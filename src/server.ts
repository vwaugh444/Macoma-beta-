import "dotenv/config";
import crypto from "node:crypto";
import express, { type Request } from "express";
import { runAgent } from "./agent.js";
import { agentCard, a2aHandler } from "./a2a.js";
import { a2aPaywall, walletAddress, NETWORK } from "./x402.js";
import { createUser, flush, getUser, importLegacyStore, phoneForCode, recordConsent, referralCount, update, withUnit } from "./store.js";
import { db, usingPostgres } from "./db.js";
import { normalizePhone, sendSms, smsEnabled, verifyTwilio } from "./sms.js";
import * as biz from "./business.js";
import * as billing from "./billing.js";
import { connectorRoutes, connectToken, startSession, whoIs } from "./connectors.js";
import { workspaceRoutes } from "./workspace.js";
import { stripeEnabled, type Stripe } from "./stripeClient.js";
import { startScheduler } from "./scheduler.js";
import { allow, enqueue, queueStats, startWorkers, stopWorkers } from "./queue.js";
import { jobHandlers, sendWelcome, TERMS_VERSION } from "./inbound.js";

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const INVITE_ONLY = process.env.INVITE_ONLY === "true";
const AGENT_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? "";
// web: pages, sign-in and webhooks. worker: runs queued jobs and the scheduler. all: both (dev, small installs).
const ROLE = (process.env.ROLE ?? "all") as "web" | "worker" | "all";

const app = express();
app.set("trust proxy", true);

// Stripe needs the raw body for signature checks, so these go before express.json().
// Webhooks only verify and queue; workers do the work, so these answer in milliseconds.
// The event id is the dedupe key, so Stripe's retries never double-count.
const lane = (event: Stripe.Event, fallback: string) => {
  const obj = event.data.object as { metadata?: Record<string, string> | null; customer?: unknown };
  return obj.metadata?.phone ?? obj.metadata?.owner ?? (typeof obj.customer === "string" ? `stripe:${obj.customer}` : fallback);
};

// Macoma's own billing: subscriptions, trials, reply packs.
app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = biz.verifyStripe(req.body, req.header("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
  if (!event) return res.status(400).send("bad signature");
  await enqueue(lane(event, `stripe:${event.id}`), "stripe_billing", event, { dedupe: `stripe:${event.id}` });
  res.json({ received: true });
});

// Owners' connected Stripe accounts: invoice paid → tell the owner, count the platform fee.
app.post("/stripe/connect-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = biz.verifyStripe(req.body, req.header("stripe-signature"), process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  if (!event) return res.status(400).send("bad signature");
  await enqueue(lane(event, `stripe:${event.account ?? event.id}`), "stripe_connect", event, { dedupe: `stripe-connect:${event.id}` });
  res.json({ received: true });
});

// Inbound texts (Twilio webhook). Verify, queue, ack. Twilio's MessageSid is the dedupe key.
app.post("/sms", express.urlencoded({ extended: false }), async (req, res) => {
  if (!verifyTwilio(req.header("X-Twilio-Signature"), `${PUBLIC_URL}/sms`, req.body)) {
    return res.status(403).send("bad signature");
  }
  const phone = normalizePhone(String(req.body.From ?? ""));
  const text = String(req.body.Body ?? "").trim();
  if (phone && text) {
    const sid = typeof req.body.MessageSid === "string" ? req.body.MessageSid : null;
    await enqueue(phone, "sms", { text }, { dedupe: sid ? `sms:${sid}` : undefined });
  }
  res.type("text/xml").send("<Response/>");
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public", { extensions: ["html"] }));

// Each request is one unit of work: accounts it changes are saved before the response goes out.
app.use((_req, res, next) => {
  withUnit(() => {
    const end = res.end.bind(res) as (...a: unknown[]) => typeof res;
    res.end = ((...args: unknown[]) => {
      flush()
        .catch((err) => console.error("save failed", err))
        .finally(() => end(...args));
      return res;
    }) as typeof res.end;
    next();
  });
});

app.use(connectorRoutes(sendWelcome));
app.use(workspaceRoutes());

// Plan checkout from the connect window. Stripe Checkout shows Apple Pay on Apple devices.
app.post("/api/billing/checkout", async (req, res) => {
  const user = await whoIs(req);
  if (!user) return res.status(401).json({ error: "Please sign in again, or text CONNECT for a new link." });
  const plan = String(req.body?.plan ?? "") as keyof typeof billing.PLANS;
  if (!billing.PLANS[plan]) return res.status(400).json({ error: "Pick a plan." });
  try {
    const back = req.body?.t ? `/connect.html?t=${connectToken(user)}&paid=1` : "/workspace?paid=1";
    res.json(await billing.switchPlan(user, plan, back));
  } catch (err) {
    console.error("checkout", err);
    res.status(502).json({ error: "Checkout is unavailable right now. Try again in a minute." });
  }
});

app.get("/api/billing/plans", (_req, res) => {
  res.json({
    trial: { days: billing.TRIAL.days, replies: billing.TRIAL.replies },
    plans: Object.values(billing.PLANS).map(({ id, name, priceUsd, replies, customerTexts, seats, invoiceFeePct }) => ({ id, name, priceUsd, replies, customerTexts, seats, invoiceFeePct })),
    pack: billing.PACK,
  });
});

// --- Join (web): number → one-time code → active ------------------------------

const hashOtp = (phone: string, code: string) => crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");

app.get("/api/config", (_req, res) => {
  res.json({ inviteOnly: INVITE_ONLY, agentNumber: AGENT_NUMBER, termsVersion: TERMS_VERSION });
});

app.post("/api/join", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  if (!phone) return res.status(400).json({ error: "That doesn't look like a phone number." });
  // Limits per IP and per number so the form can't be used to spam strangers. Shared by every server.
  if (!(await allow(`ip:${req.ip}`, 10)) || !(await allow(`otp:${phone}`, 3))) return res.status(429).json({ error: "Too many tries. Try again later." });
  if (req.body?.ageConfirmed !== true || req.body?.agreed !== true)
    return res.status(400).json({ error: "Please confirm you're 18+ and agree to the terms." });

  const ref = typeof req.body?.ref === "string" && (await phoneForCode(req.body.ref)) ? req.body.ref : null;
  const existing = await getUser(phone);
  if (existing?.status === "suspended") return res.status(403).json({ error: "This number can't use Macoma." });
  if (!existing && INVITE_ONLY && !ref) return res.status(403).json({ error: "Macoma is invite-only right now. Ask a friend for their link." });

  const user = existing ?? (await createUser(phone, ref));
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  user.otp = { hash: hashOtp(phone, code), expiresAt: Date.now() + 10 * 60 * 1000, tries: 0 };
  update(user);
  await flush(); // the code must be saved before it can arrive
  // A one-time code may be sent even to an opted-out number, since they asked for it.
  await sendSms(phone, `Your Macoma code is ${code}. It expires in 10 minutes. Didn't ask for this? Ignore it.`).catch((err) =>
    console.error("otp sms failed", err),
  );
  res.json({ sent: true });
});

app.post("/api/verify", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  const user = phone ? await getUser(phone) : undefined;
  const code = String(req.body?.code ?? "").trim();
  if (!user?.otp || Date.now() > user.otp.expiresAt) return res.status(400).json({ error: "Code expired. Request a new one." });
  if (++user.otp.tries > 5) {
    user.otp = null;
    update(user);
    return res.status(429).json({ error: "Too many wrong codes. Request a new one." });
  }
  if (hashOtp(user.phone, code) !== user.otp.hash) {
    update(user);
    return res.status(400).json({ error: "That code isn't right." });
  }
  user.otp = null;
  const isNew = user.status === "pending";
  if (isNew || !user.consent) await recordConsent(user, { at: Date.now(), ip: req.ip ?? null, via: "web", termsVersion: TERMS_VERSION, ageConfirmed: true });
  user.status = "active";
  user.optedOut = false;
  user.verifiedAt ??= Date.now();
  update(user);
  if (isNew) await billing.startTrial(user);
  startSession(res, user);
  res.json({
    next: isNew ? "/workspace?welcome=1" : "/workspace",
    shareUrl: `${PUBLIC_URL}/?ref=${user.code}`,
    referrals: await referralCount(user.code),
    agentNumber: AGENT_NUMBER,
    isNew,
    connectUrl: `/connect.html?t=${connectToken(user)}`,
  });
});

// --- A2A: other agents talk to Macoma (optionally paid via x402) ---------------

app.get(["/.well-known/agent-card.json", "/.well-known/agent.json"], (_req, res) => res.json(agentCard()));
const paywall = a2aPaywall();
if (paywall) app.use(paywall);
app.post("/a2a", a2aHandler((text, contextId) => runAgent(text, { kind: "a2a", contextId })));

app.get("/healthz", (_req, res) => res.send("ok"));

// For the load balancer and dashboards: database reachable, queue depth and age.
// Gate the numbers behind OPS_TOKEN so they aren't public.
app.get("/readyz", async (req: Request, res) => {
  try {
    await (await db()).query("SELECT 1");
    const showStats = process.env.OPS_TOKEN && req.header("authorization") === `Bearer ${process.env.OPS_TOKEN}`;
    res.json({ ok: true, ...(showStats ? { queue: await queueStats() } : {}) });
  } catch {
    res.status(503).json({ ok: false });
  }
});

async function main() {
  await db();
  await importLegacyStore();
  console.log(`Macoma (${ROLE}) on ${usingPostgres() ? "Postgres" : "embedded Postgres (dev)"}`);
  if (ROLE !== "worker") {
    const server = app.listen(PORT, () => {
      console.log(`  Web:     ${PUBLIC_URL}`);
      console.log(`  SMS:     ${smsEnabled ? `Twilio ${process.env.TWILIO_MESSAGING_SERVICE_SID ? "messaging service" : AGENT_NUMBER}` : "console (dev mode). POST /sms with From & Body to simulate"}`);
      console.log(`  Stripe:  ${biz.stripeEnabled ? "billing + Connect invoices" : "off (no billing; invoices use the owner's payment link)"}`);
      console.log(`  A2A:     ${PUBLIC_URL}/.well-known/agent-card.json ${paywall ? `(paid, ${process.env.A2A_PRICE ?? "$0.01"})` : "(free)"}`);
      console.log(`  x402:    ${walletAddress ? `agent wallet ${walletAddress} on ${NETWORK}` : "no agent wallet; paid calls disabled"}`);
    });
    process.on("SIGTERM", () => server.close());
  }
  if (ROLE !== "web") {
    startWorkers(jobHandlers);
    startScheduler();
    // Finish running jobs on deploy; anything cut off is retried after its lock expires.
    process.on("SIGTERM", () => {
      stopWorkers();
      setTimeout(() => process.exit(0), 25_000).unref();
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

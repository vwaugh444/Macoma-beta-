import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { runAgent } from "./agent.js";
import { agentCard, a2aHandler } from "./a2a.js";
import { a2aPaywall, walletAddress, NETWORK } from "./x402.js";
import {
  allUsers,
  createUser,
  deleteUser,
  getUser,
  isDoNotText,
  ownerForContactPhone,
  phoneForCode,
  recordConsent,
  referralCount,
  setDoNotText,
  update,
  type User,
} from "./store.js";
import { normalizePhone, sendSms, smsEnabled, verifyTwilio } from "./sms.js";
import * as biz from "./business.js";
import * as billing from "./billing.js";
import { connectorRoutes, connectToken, connectUrl, connectedSummary, userFromToken } from "./connectors.js";
import { stripeEnabled } from "./stripeClient.js";
import { startScheduler } from "./scheduler.js";

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const INVITE_ONLY = process.env.INVITE_ONLY === "true";
const AGENT_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? "";
const TERMS_VERSION = "2026-10-21";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@example.com";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);
const START_WORDS = new Set(["START", "UNSTOP"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
const YES_WORDS = new Set(["YES", "Y", "SEND", "CONFIRM", "OK", "AGREE"]);
const NO_WORDS = new Set(["NO", "N", "DONT", "DON'T", "NEVERMIND"]);

const HELP_TEXT = `Macoma: an AI assistant you text. Reply PLAN for your usage, MORE for extra replies, CONNECT to link your calendar or Stripe, LOG for recent actions, CANCEL PLAN to stop billing, DELETE MY DATA to erase your account, STOP to opt out. Help: ${SUPPORT_EMAIL}. Msg & data rates may apply.`;
const WELCOME_TEXT =
  "Hey, it's Macoma, your assistant. Text me like you'd text a sharp office manager: reminders, reorders, invoices, follow-ups, \"tell my 2pm I'm running late\". What should I call you, and what's your business (if you have one)?";
const TERMS_PROMPT = `Hi, I'm Macoma, an AI assistant you text. To start, reply YES to confirm you're 18+ and agree to the Terms (${PUBLIC_URL}/terms) and SMS terms (${PUBLIC_URL}/sms-terms). Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.`;

const app = express();
app.set("trust proxy", true);

// Texts to the owner are metered: every segment counts toward the margin rule.
async function textOwner(user: User, body: string) {
  await sendSms(user.phone, body);
  billing.recordSms(user, body);
}

// Stripe needs the raw body for signature checks, so these go before express.json().
// Macoma's own billing: subscriptions, trials, reply packs.
app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = biz.verifyStripe(req.body, req.header("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
  if (!event) return res.status(400).send("bad signature");
  res.json({ received: true });
  try {
    const note = await billing.handleBillingEvent(event);
    const owner = billing.billingOwnerFor(event);
    if (note && owner && !owner.optedOut) await textOwner(owner, note);
  } catch (err) {
    console.error("stripe billing event", err);
  }
});

// Owners' connected Stripe accounts: invoice paid → tell the owner, count the platform fee.
app.post("/stripe/connect-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = biz.verifyStripe(req.body, req.header("stripe-signature"), process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  if (!event) return res.status(400).send("bad signature");
  res.json({ received: true });
  await biz.handleConnectEvent(event, getUser).catch((err) => console.error("stripe connect event", err));
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public", { extensions: ["html"] }));

// The first text arrives when the owner finishes the connect window, or 15 minutes after
// they verified if they close it early.
async function sendWelcome(user: User) {
  if (user.welcomeSentAt || user.optedOut || user.status !== "active") return;
  user.welcomeSentAt = Date.now();
  update(user);
  const linked = Object.keys(user.connections).length ? ` I can see your ${connectedSummary(user)}.` : "";
  await textOwner(user, WELCOME_TEXT + linked).catch((err) => console.error("welcome sms failed", err));
}
app.use(connectorRoutes(sendWelcome));

// Plan checkout from the connect window. Stripe Checkout shows Apple Pay on Apple devices.
app.post("/api/billing/checkout", async (req, res) => {
  const user = userFromToken(req.body?.t);
  if (!user) return res.status(401).json({ error: "This link expired. Text CONNECT to get a new one." });
  const plan = String(req.body?.plan ?? "") as keyof typeof billing.PLANS;
  if (!billing.PLANS[plan]) return res.status(400).json({ error: "Pick a plan." });
  user.billing.plan = plan;
  update(user);
  if (!stripeEnabled) return res.json({ url: null, message: "Billing isn't switched on yet. Your free trial is running." });
  try {
    res.json({ url: await billing.planLink(user, plan, `/connect.html?t=${connectToken(user.phone)}&paid=1`) });
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
setInterval(() => {
  for (const u of allUsers()) {
    if (!u.welcomeSentAt && u.verifiedAt && Date.now() - u.verifiedAt > 15 * 60 * 1000) void sendWelcome(u);
  }
}, 60_000);

// --- Join (web): number → one-time code → active ------------------------------

const hits = new Map<string, number[]>();
function allow(key: string, max: number, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= max;
}

const hashOtp = (phone: string, code: string) => crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");

app.get("/api/config", (_req, res) => {
  res.json({ inviteOnly: INVITE_ONLY, agentNumber: AGENT_NUMBER, termsVersion: TERMS_VERSION });
});

app.post("/api/join", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  if (!phone) return res.status(400).json({ error: "That doesn't look like a phone number." });
  // Limits per IP and per number so the form can't be used to spam strangers.
  if (!allow(`ip:${req.ip}`, 10) || !allow(`otp:${phone}`, 3)) return res.status(429).json({ error: "Too many tries. Try again later." });
  if (req.body?.ageConfirmed !== true || req.body?.agreed !== true)
    return res.status(400).json({ error: "Please confirm you're 18+ and agree to the terms." });

  const ref = typeof req.body?.ref === "string" && phoneForCode(req.body.ref) ? req.body.ref : null;
  const existing = getUser(phone);
  if (existing?.status === "suspended") return res.status(403).json({ error: "This number can't use Macoma." });
  if (!existing && INVITE_ONLY && !ref) return res.status(403).json({ error: "Macoma is invite-only right now. Ask a friend for their link." });

  const user = existing ?? createUser(phone, ref);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  user.otp = { hash: hashOtp(phone, code), expiresAt: Date.now() + 10 * 60 * 1000, tries: 0 };
  update(user);
  // A one-time code may be sent even to an opted-out number, since they asked for it.
  await sendSms(phone, `Your Macoma code is ${code}. It expires in 10 minutes. Didn't ask for this? Ignore it.`).catch((err) =>
    console.error("otp sms failed", err),
  );
  res.json({ sent: true });
});

app.post("/api/verify", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  const user = phone ? getUser(phone) : undefined;
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
  if (isNew || !user.consent) recordConsent(user, { at: Date.now(), ip: req.ip ?? null, via: "web", termsVersion: TERMS_VERSION, ageConfirmed: true });
  user.status = "active";
  user.optedOut = false;
  user.verifiedAt ??= Date.now();
  update(user);
  if (isNew) billing.startTrial(user);
  res.json({
    shareUrl: `${PUBLIC_URL}/?ref=${user.code}`,
    referrals: referralCount(user.code),
    agentNumber: AGENT_NUMBER,
    isNew,
    connectUrl: `/connect.html?t=${connectToken(user.phone)}`,
  });
});

// --- Inbound SMS (Twilio webhook) ---------------------------------------------

// One message at a time per phone so history and confirmations stay in order.
const queues = new Map<string, Promise<void>>();
function enqueue(phone: string, job: () => Promise<void>) {
  const next = (queues.get(phone) ?? Promise.resolve()).then(job, job);
  queues.set(phone, next.catch(() => {}));
}

async function handleOwner(user: User, text: string) {
  const word = text.toUpperCase().replace(/[.!]+$/, "").trim();
  const reply = (body: string) => textOwner(user, body);
  billing.recordSms(user, text); // inbound segments cost money too

  if (STOP_WORDS.has(word)) {
    user.optedOut = true;
    update(user);
    return reply("You're unsubscribed from Macoma and won't get more texts. Reply START to come back.");
  }
  if (START_WORDS.has(word) || (user.optedOut && word === "YES")) {
    user.optedOut = false;
    update(user);
    return reply("Welcome back. Text me anything.");
  }
  if (user.optedOut || user.status === "suspended") return;
  if (HELP_WORDS.has(word)) return reply(HELP_TEXT);

  if (user.status === "pending") {
    if (!YES_WORDS.has(word)) return reply(TERMS_PROMPT);
    recordConsent(user, { at: Date.now(), ip: null, via: "sms", termsVersion: TERMS_VERSION, ageConfirmed: true });
    user.status = "active";
    user.verifiedAt = Date.now();
    update(user);
    billing.startTrial(user);
    await sendWelcome(user);
    return reply(`Want me to see your calendar or send invoices you get paid for by Apple Pay? Connect your accounts here (link works for 30 min): ${connectUrl(user)}`);
  }

  if (user.pending && YES_WORDS.has(word)) return reply(await biz.confirmPending(user, () => deleteUser(user.phone)));
  if (user.pending && NO_WORDS.has(word)) {
    const what = biz.cancelPending(user);
    return reply(what ? `Cancelled: ${what}` : "Nothing to cancel.");
  }
  if (word === "LOG" || word === "ACTIONS") return reply(biz.recentActions(user));
  if (word === "PLAN" || word === "USAGE") return reply(billing.describeUsage(user));
  if (word === "CONNECT") return reply(`Connect your calendar, Stripe, QuickBooks or Square here (link works for 30 min): ${connectUrl(user)}`);
  if (word === "MORE") return reply(`Here's a pack of ${billing.PACK.replies} replies for $${billing.PACK.priceUsd}. Apple Pay works on the checkout page: ${await billing.packLink(user)}`);
  if (word === "UPGRADE") {
    const next = user.billing.plan === "personal" ? "business" : "crew";
    const p = billing.PLANS[next];
    return reply(`${p.name}: $${p.priceUsd}/mo, ${p.replies} replies, ${p.customerTexts} customer texts. Switch here (Apple Pay works): ${await billing.planLink(user, next, "/thanks.html?")}`);
  }
  if (word === "CANCEL PLAN") return reply(await billing.cancelPlan(user));
  if (word === "START PLAN" || word === "RESUME PLAN") return reply(await billing.resumePlan(user));
  if (word === "DELETE MY DATA" || word === "DELETE ACCOUNT") {
    biz.propose(user, "delete_account", "Delete account and all data", {});
    return reply("This permanently deletes your contacts, reminders, invoices and history. Reply YES to confirm or NO to keep everything.");
  }

  const g = await billing.gate(user);
  if (!g.ok) return reply(g.message);
  const answer = await runAgent(text, { kind: "sms", user }, g.model);
  await billing.recordReply(user);
  return reply(g.notice ? `${answer}\n\n${g.notice}` : answer);
}

// A customer or lead texting back after we messaged them on an owner's behalf.
async function handleContactReply(phone: string, text: string): Promise<boolean> {
  const word = text.toUpperCase().replace(/[.!]+$/, "");
  const match = ownerForContactPhone(phone);
  if (STOP_WORDS.has(word)) {
    setDoNotText(phone, true);
    await sendSms(phone, "You won't get more texts from this number. Reply START to undo.");
    if (match && !match.owner.optedOut) await sendSms(match.owner.phone, `${match.contact.name} opted out of texts. I won't message them again.`);
    return true;
  }
  if (START_WORDS.has(word) && isDoNotText(phone)) {
    setDoNotText(phone, false);
    await sendSms(phone, "You're resubscribed.");
    return true;
  }
  if (!match) return false;
  const { owner, contact } = match;
  contact.lastInboundAt = Date.now();
  biz.logAction(owner, { type: "contact_reply", summary: `${contact.name} replied: ${text.slice(0, 120)}`, status: "done" });
  if (!owner.optedOut) await textOwner(owner, `💬 ${contact.name} (${contact.kind}) replied:\n"${text}"\nWant me to answer?`);
  return true;
}

app.post("/sms", (req, res) => {
  if (!verifyTwilio(req.header("X-Twilio-Signature"), `${PUBLIC_URL}/sms`, req.body)) {
    return res.status(403).send("bad signature");
  }
  const phone = normalizePhone(String(req.body.From ?? ""));
  const text = String(req.body.Body ?? "").trim();
  // Ack right away: Twilio times out after 15s and the agent may take longer.
  res.type("text/xml").send("<Response/>");
  if (!phone || !text) return;

  enqueue(phone, async () => {
    try {
      const user = getUser(phone);
      if (user) return await handleOwner(user, text);
      if (await handleContactReply(phone, text)) return;
      if (isDoNotText(phone)) return;
      if (INVITE_ONLY) return await sendSms(phone, `Macoma is invite-only for now. Get a link from a friend, or join the waitlist at ${PUBLIC_URL}`);
      createUser(phone, null);
      await sendSms(phone, TERMS_PROMPT);
    } catch (err) {
      console.error("inbound error", err);
      const u = getUser(phone);
      if (u && !u.optedOut) await sendSms(phone, "Something broke on my end. Try again in a minute.").catch(() => {});
    }
  });
});

// --- A2A: other agents talk to Macoma (optionally paid via x402) ---------------

app.get(["/.well-known/agent-card.json", "/.well-known/agent.json"], (_req, res) => res.json(agentCard()));
const paywall = a2aPaywall();
if (paywall) app.use(paywall);
app.post("/a2a", a2aHandler((text, contextId) => runAgent(text, { kind: "a2a", contextId })));

app.get("/healthz", (_req, res) => res.send("ok"));

startScheduler();
app.listen(PORT, () => {
  console.log(`Macoma listening on ${PUBLIC_URL}`);
  console.log(`  SMS:     ${smsEnabled ? `Twilio ${AGENT_NUMBER}` : "console (dev mode). POST /sms with From & Body to simulate"}`);
  console.log(`  Stripe:  ${biz.stripeEnabled ? "billing + Connect invoices" : "off (no billing; invoices use the owner's payment link)"}`);
  console.log(`  A2A:     ${PUBLIC_URL}/.well-known/agent-card.json ${paywall ? `(paid, ${process.env.A2A_PRICE ?? "$0.01"})` : "(free)"}`);
  console.log(`  x402:    ${walletAddress ? `agent wallet ${walletAddress} on ${NETWORK}` : "no agent wallet; paid calls disabled"}`);
});

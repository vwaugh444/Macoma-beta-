import "dotenv/config";
import express from "express";
import { runAgent } from "./agent.js";
import { agentCard, a2aHandler } from "./a2a.js";
import { a2aPaywall, walletAddress, NETWORK } from "./x402.js";
import { createUser, getUser, phoneForCode, referralCount } from "./store.js";
import { normalizePhone, sendSms, smsEnabled, verifyTwilio } from "./sms.js";

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const INVITE_ONLY = process.env.INVITE_ONLY === "true";
const AGENT_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? "";

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));

// --- Join: the whole "interface" -------------------------------------------

// Naive per-IP limiter so the form can't be used to spam SMS to random numbers.
const joins = new Map<string, number[]>();
function allowJoin(ip: string) {
  const now = Date.now();
  const recent = (joins.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  joins.set(ip, recent);
  return recent.length <= 5;
}

app.get("/api/config", (_req, res) => {
  res.json({ inviteOnly: INVITE_ONLY, agentNumber: AGENT_NUMBER });
});

app.post("/api/join", async (req, res) => {
  if (!allowJoin(req.ip ?? "unknown")) return res.status(429).json({ error: "Too many tries. Try again later." });
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  if (!phone) return res.status(400).json({ error: "That doesn't look like a phone number." });

  const ref = typeof req.body?.ref === "string" && phoneForCode(req.body.ref) ? req.body.ref : null;
  const existing = getUser(phone);
  if (!existing && INVITE_ONLY && !ref) return res.status(403).json({ error: "Macoma is invite-only right now. Ask a friend for their link." });

  const user = existing ?? createUser(phone, ref);
  if (!existing) {
    await sendSms(
      phone,
      "Hey, it's Macoma, your agent. Text me anything: research, plans, reminders, errands. Save this number. Reply STOP to opt out.",
    ).catch((err) => console.error("welcome sms failed", err));
  }
  res.json({ shareUrl: `${PUBLIC_URL}/?ref=${user.code}`, referrals: referralCount(user.code), agentNumber: AGENT_NUMBER });
});

// --- Inbound SMS (Twilio webhook) ------------------------------------------

// One message at a time per phone so history stays in order.
const queues = new Map<string, Promise<void>>();
function enqueue(phone: string, job: () => Promise<void>) {
  const next = (queues.get(phone) ?? Promise.resolve()).then(job, job);
  queues.set(phone, next.catch(() => {}));
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

  let user = getUser(phone);
  if (!user) {
    if (INVITE_ONLY) {
      sendSms(phone, `Macoma is invite-only for now. Get a link from a friend, or join at ${PUBLIC_URL}`).catch(console.error);
      return;
    }
    user = createUser(phone, null);
  }
  const u = user;
  enqueue(phone, async () => {
    try {
      await sendSms(phone, await runAgent(text, { kind: "sms", user: u }));
    } catch (err) {
      console.error("agent error", err);
      await sendSms(phone, "Something broke on my end. Try again in a minute.").catch(() => {});
    }
  });
});

// --- A2A: other agents talk to Macoma (optionally paid via x402) ------------

app.get(["/.well-known/agent-card.json", "/.well-known/agent.json"], (_req, res) => res.json(agentCard()));
const paywall = a2aPaywall();
if (paywall) app.use(paywall);
app.post("/a2a", a2aHandler((text, contextId) => runAgent(text, { kind: "a2a", contextId })));

app.get("/healthz", (_req, res) => res.send("ok"));

app.listen(PORT, () => {
  console.log(`Macoma listening on ${PUBLIC_URL}`);
  console.log(`  SMS:   ${smsEnabled ? `Twilio ${AGENT_NUMBER}` : "console (dev mode). POST /sms with From & Body to simulate"}`);
  console.log(`  A2A:   ${PUBLIC_URL}/.well-known/agent-card.json ${paywall ? `(paid, ${process.env.A2A_PRICE ?? "$0.01"})` : "(free)"}`);
  console.log(`  x402:  ${walletAddress ? `agent wallet ${walletAddress} on ${NETWORK}` : "no agent wallet; paid calls disabled"}`);
});

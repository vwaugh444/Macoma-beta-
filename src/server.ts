import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { runAgent } from "./agent.js";
import { agentCard, a2aHandler } from "./a2a.js";
import { a2aPaywall, walletAddress, NETWORK } from "./x402.js";
import {
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

const HELP_TEXT = `Macoma: an AI assistant you text. Text anything to get started. Reply LOG to see recent actions, DELETE MY DATA to erase your account, STOP to opt out. Help: ${SUPPORT_EMAIL}. Msg & data rates may apply.`;
const WELCOME_TEXT =
  "Hey, it's Macoma, your assistant. Text me like you'd text a sharp office manager: reminders, reorders, invoices, follow-ups, \"tell my 2pm I'm running late\". What should I call you, and what's your business (if you have one)?";
const TERMS_PROMPT = `Hi, I'm Macoma, an AI assistant you text. To start, reply YES to confirm you're 18+ and agree to the Terms (${PUBLIC_URL}/terms) and SMS terms (${PUBLIC_URL}/sms-terms). Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.`;

const app = express();
app.set("trust proxy", true);

// Stripe needs the raw body for signature checks, so it goes before express.json().
app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = biz.verifyStripe(req.body, req.header("stripe-signature"));
  if (!event) return res.status(400).send("bad signature");
  res.json({ received: true });
  await biz.handleStripeEvent(event, getUser).catch((err) => console.error("stripe event", err));
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public", { extensions: ["html"] }));

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
  update(user);
  if (isNew) await sendSms(user.phone, WELCOME_TEXT).catch((err) => console.error("welcome sms failed", err));
  res.json({ shareUrl: `${PUBLIC_URL}/?ref=${user.code}`, referrals: referralCount(user.code), agentNumber: AGENT_NUMBER, isNew });
});

// --- Inbound SMS (Twilio webhook) ---------------------------------------------

// One message at a time per phone so history and confirmations stay in order.
const queues = new Map<string, Promise<void>>();
function enqueue(phone: string, job: () => Promise<void>) {
  const next = (queues.get(phone) ?? Promise.resolve()).then(job, job);
  queues.set(phone, next.catch(() => {}));
}

async function handleOwner(user: User, text: string) {
  const word = text.toUpperCase().replace(/[.!]+$/, "");
  const reply = (body: string) => sendSms(user.phone, body);

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
    update(user);
    return reply(WELCOME_TEXT);
  }

  if (user.pending && YES_WORDS.has(word)) return reply(await biz.confirmPending(user, () => deleteUser(user.phone)));
  if (user.pending && NO_WORDS.has(word)) {
    const what = biz.cancelPending(user);
    return reply(what ? `Cancelled: ${what}` : "Nothing to cancel.");
  }
  if (word === "LOG" || word === "ACTIONS") return reply(biz.recentActions(user));
  if (word === "DELETE MY DATA" || word === "DELETE ACCOUNT") {
    biz.propose(user, "delete_account", "Delete account and all data", {});
    return reply("This permanently deletes your contacts, reminders, invoices and history. Reply YES to confirm or NO to keep everything.");
  }

  return reply(await runAgent(text, { kind: "sms", user }));
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
  if (!owner.optedOut) await sendSms(owner.phone, `💬 ${contact.name} (${contact.kind}) replied:\n"${text}"\nWant me to answer?`);
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
  console.log(`  Stripe:  ${biz.stripeEnabled ? "invoices via Stripe" : "off (invoices use the owner's payment link)"}`);
  console.log(`  A2A:     ${PUBLIC_URL}/.well-known/agent-card.json ${paywall ? `(paid, ${process.env.A2A_PRICE ?? "$0.01"})` : "(free)"}`);
  console.log(`  x402:    ${walletAddress ? `agent wallet ${walletAddress} on ${NETWORK}` : "no agent wallet; paid calls disabled"}`);
});

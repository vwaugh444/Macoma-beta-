// Everything that happens because a text or an event came in. Runs in worker processes,
// one job at a time per phone (see queue.ts), so web servers stay fast under load.
import { runAgent } from "./agent.js";
import {
  createUser,
  deleteUser,
  getUser,
  isDoNotText,
  ownerForContactPhone,
  recordConsent,
  setDoNotText,
  update,
  type User,
} from "./store.js";
import { sendSms } from "./sms.js";
import * as biz from "./business.js";
import * as billing from "./billing.js";
import { connectUrl, connectedSummary } from "./connectors.js";
import { tickUser } from "./scheduler.js";
import type { Job, JobKind } from "./queue.js";
import type { Stripe } from "./stripeClient.js";

const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
const INVITE_ONLY = process.env.INVITE_ONLY === "true";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@example.com";
export const TERMS_VERSION = "2026-10-21";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);
const START_WORDS = new Set(["START", "UNSTOP"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
const YES_WORDS = new Set(["YES", "Y", "SEND", "CONFIRM", "AGREE"]); // not "OK": too casual to send a text to a customer
const NO_WORDS = new Set(["NO", "N", "DONT", "DON'T", "NEVERMIND"]);

const HELP_TEXT = `Macoma: an AI assistant you text. Reply PLAN for your usage, MORE for extra replies, CONNECT to link your calendar or Stripe, LOG for recent actions, CANCEL PLAN to stop billing, DELETE MY DATA to erase your account, STOP to opt out. Help: ${SUPPORT_EMAIL}. Msg & data rates may apply.`;
const WELCOME_TEXT =
  "Hey, it's Macoma, your assistant. Text me like you'd text a sharp office manager: reminders, reorders, invoices, follow-ups, \"tell my 2pm I'm running late\". What should I call you, and what's your business (if you have one)?";
const TERMS_PROMPT = `Hi, I'm Macoma, an AI assistant you text. To start, reply YES to confirm you're 18+ and agree to the Terms (${PUBLIC_URL}/terms) and SMS terms (${PUBLIC_URL}/sms-terms). Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.`;

// Texts to the owner are metered: every segment counts toward the margin rule.
export async function textOwner(user: User, body: string) {
  await sendSms(user.phone, body);
  billing.recordSms(user, body);
}

// The first text arrives when the owner finishes the connect window, or 15 minutes after
// they verified if they close it early (the scheduler handles that case).
export async function sendWelcome(user: User) {
  if (user.welcomeSentAt || user.optedOut || user.status !== "active") return;
  user.welcomeSentAt = Date.now();
  update(user);
  const linked = Object.keys(user.connections).length ? ` I can see your ${connectedSummary(user)}.` : "";
  await textOwner(user, WELCOME_TEXT + linked).catch((err) => console.error("welcome sms failed", err));
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
    await recordConsent(user, { at: Date.now(), ip: null, via: "sms", termsVersion: TERMS_VERSION, ageConfirmed: true });
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
  const pendingBefore = user.pending?.actionId;
  let answer = await runAgent(text, { kind: "sms", user }, g.model);
  await billing.recordReply(user);
  // The owner approves the server's exact draft, never the model's paraphrase of it.
  const p = user.pending;
  if (p && p.actionId !== pendingBefore) answer = `${answer}\n\n${biz.exactDraft(user, p)}`;
  return reply(g.notice ? `${answer}\n\n${g.notice}` : answer);
}

// A customer or lead texting back after we messaged them on an owner's behalf.
async function handleContactReply(phone: string, text: string): Promise<boolean> {
  const word = text.toUpperCase().replace(/[.!]+$/, "");
  const match = await ownerForContactPhone(phone);
  if (STOP_WORDS.has(word)) {
    await setDoNotText(phone, true);
    await sendSms(phone, "You won't get more texts from this number. Reply START to undo.");
    if (match && !match.owner.optedOut) await sendSms(match.owner.phone, `${match.contact.name} opted out of texts. I won't message them again.`);
    return true;
  }
  if (START_WORDS.has(word) && (await isDoNotText(phone))) {
    await setDoNotText(phone, false);
    await sendSms(phone, "You're resubscribed.");
    return true;
  }
  if (!match) return false;
  const { owner, contact } = match;
  contact.lastInboundAt = Date.now();
  biz.logAction(owner, { type: "contact_reply", summary: `${contact.name} replied: ${text.slice(0, 120)}`, status: "done" });
  update(owner);
  if (!owner.optedOut) await textOwner(owner, `💬 ${contact.name} (${contact.kind}) replied:\n"${text}"\nWant me to answer?`);
  return true;
}

// Never throws: a retry could send the owner the same reply twice, so failures end here.
async function inboundSms(phone: string, text: string) {
  try {
    const user = await getUser(phone);
    if (user) return await handleOwner(user, text);
    if (await handleContactReply(phone, text)) return;
    if (await isDoNotText(phone)) return;
    if (INVITE_ONLY) return await sendSms(phone, `Macoma is invite-only for now. Get a link from a friend, or join the waitlist at ${PUBLIC_URL}`);
    await createUser(phone, null);
    await sendSms(phone, TERMS_PROMPT);
  } catch (err) {
    console.error("inbound error", err);
    const u = await getUser(phone).catch(() => undefined);
    if (u && !u.optedOut) await sendSms(phone, "Something broke on my end. Try again in a minute.").catch(() => {});
  }
}

export const jobHandlers: Record<JobKind, (job: Job) => Promise<void>> = {
  sms: (job) => inboundSms(job.phone, String(job.payload.text ?? "")),

  // Macoma's own billing: subscriptions, trials, reply packs. Throws to retry.
  stripe_billing: async (job) => {
    const event = job.payload as Stripe.Event;
    const note = await billing.handleBillingEvent(event);
    const owner = await billing.billingOwnerFor(event);
    if (note && owner && !owner.optedOut) await textOwner(owner, note);
  },

  // Owners' connected Stripe accounts: invoice paid → tell the owner, count the platform fee.
  stripe_connect: (job) => biz.handleConnectEvent(job.payload as Stripe.Event, getUser),

  tick: async (job) => {
    const user = await getUser(job.phone);
    if (user) await tickUser(user, sendWelcome);
  },
};

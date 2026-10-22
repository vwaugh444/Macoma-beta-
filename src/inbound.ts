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
import { connectUrl, connectedSummary, disconnectAll } from "./connectors.js";
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

// Deleting an account: stop billing, revoke connected accounts, then erase the record.
export async function closeAccount(user: User) {
  await billing.cancelNow(user);
  await disconnectAll(user);
  await deleteUser(user.phone);
}

// Every text to an owner goes through here: metered against the margin rule, and never sent
// to an opted-out or suspended number (except the one STOP confirmation, via `force`).
export async function textOwner(user: User, body: string, opts: { force?: boolean } = {}) {
  if (!opts.force && (user.optedOut || user.status === "suspended")) return;
  await sendSms(user.phone, body);
  billing.recordSms(user, body);
  user.lastOwnerTextAt = Date.now();
  update(user);
}

// The first text arrives when the owner finishes the connect window, or 15 minutes after
// they verified if they close it early (the scheduler handles that case). Returns whether
// a welcome went out now; on a send failure it stays unsent so the scheduler tries again.
export async function sendWelcome(user: User): Promise<boolean> {
  if (user.welcomeSentAt || user.optedOut || user.status !== "active") return false;
  user.welcomeSentAt = Date.now();
  update(user);
  const linked = Object.keys(user.connections).length ? ` I can see your ${connectedSummary(user)}.` : "";
  try {
    await textOwner(user, WELCOME_TEXT + linked);
    return true;
  } catch (err) {
    console.error("welcome sms failed", err);
    user.welcomeSentAt = null;
    update(user);
    return false;
  }
}

async function handleOwner(user: User, text: string) {
  const word = text.toUpperCase().replace(/[.!]+$/, "").trim();
  const reply = (body: string) => textOwner(user, body);
  // Sends a reply that ends with a draft awaiting YES, and notes when the owner saw it.
  const replyWithDraft = async (body: string) => {
    await reply(body);
    if (user.pending) user.pending.shownAt = user.lastOwnerTextAt;
    update(user);
  };
  billing.recordSms(user, text); // inbound segments cost money too

  // STOP to this number stops everything from it, including texts a business sends through Macoma.
  if (STOP_WORDS.has(word)) {
    user.optedOut = true;
    update(user);
    await setDoNotText(user.phone, true);
    return textOwner(user, "You're unsubscribed from Macoma and won't get more texts. Reply START to come back.", { force: true });
  }
  if (START_WORDS.has(word) || (user.optedOut && word === "YES")) {
    user.optedOut = false;
    update(user);
    await setDoNotText(user.phone, false);
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
    if (!(await billing.startTrial(user))) {
      // This number had a free trial before (the account was deleted since).
      user.welcomeSentAt = Date.now();
      update(user);
      return reply(`Welcome back to Macoma. Your free trial was used earlier, so pick a plan to start again (Apple Pay works): ${await billing.planLink(user)}`);
    }
    await sendWelcome(user);
    return reply(`Want me to see your calendar or send invoices you get paid for by Apple Pay? Connect your accounts here (link works for 30 min): ${connectUrl(user)}`);
  }

  if (user.pending && YES_WORDS.has(word)) {
    // A YES only approves the draft if it was the last thing we texted. If a reminder or a
    // customer's message arrived since, show the draft again rather than guess.
    const p = user.pending;
    if (!p.shownAt || (user.lastOwnerTextAt ?? 0) > p.shownAt) return replyWithDraft(`To be sure, you're approving this:\n${biz.exactDraft(user, p)}`);
    return reply(await biz.confirmPending(user, () => closeAccount(user)));
  }
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
    const r = await billing.switchPlan(user, next, "/thanks.html?");
    return reply(r.url ? `${p.name}: $${p.priceUsd}/mo, ${p.replies} replies, ${p.customerTexts} customer texts. Switch here (Apple Pay works): ${r.url}` : r.message);
  }
  if (word === "START NOW") return reply(await billing.startPlanNow(user));
  if (word === "CANCEL PLAN") return reply(await billing.cancelPlan(user));
  if (word === "START PLAN" || word === "RESUME PLAN") return reply(await billing.resumePlan(user));
  if (word === "DELETE MY DATA" || word === "DELETE ACCOUNT") {
    biz.propose(user, "delete_account", "Delete account and all data", {});
    return replyWithDraft("This permanently deletes your contacts, reminders, invoices and history, and stops your plan. Reply YES to confirm or NO to keep everything.");
  }

  const g = await billing.gate(user);
  if (!g.ok) return reply(g.message);
  const pendingBefore = user.pending?.actionId;
  let answer = await runAgent(text, { kind: "sms", user }, g.model);
  await billing.recordReply(user);
  // The owner approves the server's exact draft, never the model's paraphrase of it.
  const p = user.pending;
  if (p && p.actionId !== pendingBefore) answer = `${answer}\n\n${biz.exactDraft(user, p)}`;
  const body = g.notice ? `${answer}\n\n${g.notice}` : answer;
  return p && p.actionId !== pendingBefore ? replyWithDraft(body) : reply(body);
}

// A customer or lead texting back after we messaged them on an owner's behalf.
async function handleContactReply(phone: string, text: string): Promise<boolean> {
  const word = text.toUpperCase().replace(/[.!]+$/, "");
  const match = await ownerForContactPhone(phone);
  // Texts to and from a business's contacts are part of that business's usage.
  const toContact = async (body: string) => {
    await sendSms(phone, body);
    if (match) billing.recordSms(match.owner, body);
  };
  if (match) billing.recordSms(match.owner, text);
  if (STOP_WORDS.has(word)) {
    await setDoNotText(phone, true);
    await toContact("You won't get more texts from this number. Reply START to undo.");
    if (match) await textOwner(match.owner, `${match.contact.name} opted out of texts. I won't message them again.`);
    return true;
  }
  if (START_WORDS.has(word) && (await isDoNotText(phone))) {
    await setDoNotText(phone, false);
    await toContact("You're resubscribed.");
    return true;
  }
  if (HELP_WORDS.has(word) && match) {
    const from = match.owner.settings.business ?? match.owner.settings.name ?? "a business";
    await toContact(`Texts from ${from}, sent with Macoma. Reply STOP to opt out. Help: ${SUPPORT_EMAIL}. Msg & data rates may apply.`);
    return true;
  }
  if (!match) return false;
  const { owner, contact } = match;
  contact.lastInboundAt = Date.now();
  biz.logAction(owner, { type: "contact_reply", summary: `${contact.name} replied: ${text.slice(0, 120)}`, status: "done" });
  update(owner);
  await textOwner(owner, `💬 ${contact.name} (${contact.kind}) replied:\n"${text}"\nTell me what to say back, or I'll leave it with you.`);
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
    await textOwner(await createUser(phone, null), TERMS_PROMPT);
  } catch (err) {
    console.error("inbound error", err);
    const u = await getUser(phone).catch(() => undefined);
    if (u) await textOwner(u, "Something broke on my end. Try again in a minute.").catch(() => {});
  }
}

export const jobHandlers: Record<JobKind, (job: Job) => Promise<void>> = {
  sms: (job) => inboundSms(job.phone, String(job.payload.text ?? "")),

  // Macoma's own billing: subscriptions, trials, reply packs. Throws to retry.
  stripe_billing: async (job) => {
    const event = job.payload as Stripe.Event;
    const note = await billing.handleBillingEvent(event);
    const owner = await billing.billingOwnerFor(event);
    if (note && owner) await textOwner(owner, note);
  },

  // Owners' connected Stripe accounts: invoice paid → tell the owner, count the platform fee.
  stripe_connect: async (job) => {
    const paid = await biz.handleConnectEvent(job.payload as Stripe.Event, getUser);
    if (paid) await textOwner(paid.owner, paid.text);
  },

  tick: async (job) => {
    const user = await getUser(job.phone);
    if (user) await tickUser(user, sendWelcome, textOwner);
  },
};

// Plans, the trial, the usage meter and the margin rule.
//
// The rule: an account's AI + messaging cost may not exceed MAX_COST_SHARE (40%)
// of what it pays Macoma this month. Every reply is metered at real cost. Near the
// line the agent switches to a cheaper model; at the allowance it pauses and offers
// a reply pack. Nothing is billed as overage without the owner saying yes.
import crypto from "node:crypto";
import { db } from "./db.js";
import { stripe, type Stripe } from "./stripeClient.js";
import { getUser, newUsage, update, userByStripe, type PlanId, type User } from "./store.js";

const env = process.env;
const PUBLIC_URL = (env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type Plan = {
  id: PlanId;
  name: string;
  priceUsd: number;
  replies: number; // assistant replies included per month
  customerTexts: number; // texts to the owner's customers per month
  seats: number;
  invoiceFeePct: number; // platform fee on invoices paid through Macoma
  stripePrice: string | undefined; // Stripe Price id for the monthly plan
};

export const PLANS: Record<PlanId, Plan> = {
  personal: { id: "personal", name: "Personal", priceUsd: 19, replies: 150, customerTexts: 0, seats: 1, invoiceFeePct: 0, stripePrice: env.STRIPE_PRICE_PERSONAL },
  business: { id: "business", name: "Business", priceUsd: 59, replies: 400, customerTexts: 300, seats: 1, invoiceFeePct: 1, stripePrice: env.STRIPE_PRICE_BUSINESS },
  crew: { id: "crew", name: "Crew", priceUsd: 149, replies: 1000, customerTexts: 800, seats: 3, invoiceFeePct: 0.5, stripePrice: env.STRIPE_PRICE_CREW },
};

export const TRIAL = {
  days: Number(env.TRIAL_DAYS ?? 14),
  replies: Number(env.TRIAL_REPLIES ?? 100),
  customerTexts: Number(env.TRIAL_CUSTOMER_TEXTS ?? 30),
  costCapUsd: Number(env.TRIAL_COST_CAP_USD ?? 4),
};
export const PACK = { replies: 200, priceUsd: 20 };
export const SEAT_PRICE_USD = 25;
export const LINE_PRICE_USD = 15;
export const MAX_COST_SHARE = Number(env.MAX_COST_SHARE ?? 0.4);

// USD per million tokens. Check the live rate card and override with MODEL_PRICES_JSON.
type Price = { in: number; out: number; cacheRead: number; cacheWrite: number };
const MODEL_PRICES: Record<string, Price> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  ...(env.MODEL_PRICES_JSON ? JSON.parse(env.MODEL_PRICES_JSON) : {}),
};
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches
// Twilio US list price per segment plus an average carrier fee. Estimates; override per contract.
const SMS_SEGMENT_USD = Number(env.SMS_SEGMENT_USD ?? 0.0083) + Number(env.SMS_CARRIER_FEE_USD ?? 0.004);

export const DEFAULT_MODEL = env.AGENT_MODEL ?? "claude-opus-5-5";
export const BUDGET_MODEL = env.BUDGET_MODEL ?? "claude-haiku-5-5";
// Optional per-plan models, e.g. MODEL_PERSONAL=claude-sonnet-5-5.
const PLAN_MODEL: Record<PlanId, string> = {
  personal: env.MODEL_PERSONAL ?? DEFAULT_MODEL,
  business: env.MODEL_BUSINESS ?? DEFAULT_MODEL,
  crew: env.MODEL_CREW ?? DEFAULT_MODEL,
};

// --- the month --------------------------------------------------------------------

// Usage months are UTC, so changing time zone never moves the month (and the meter) backward.
const monthNow = () => new Date().toISOString().slice(0, 7);

function roll(user: User) {
  const m = monthNow();
  if (m > user.usage.month) user.usage = newUsage(m, user.usage.trialReplies);
}

const inTrial = (u: User) => u.billing.status === "trialing";

export function plan(user: User): Plan {
  return PLANS[user.billing.plan];
}

export function revenueUsd(user: User): number {
  roll(user);
  const b = user.billing;
  const paying = b.status === "active" || b.status === "past_due";
  const recurring = paying ? plan(user).priceUsd + b.extraSeats * SEAT_PRICE_USD + b.extraLines * LINE_PRICE_USD : 0;
  return recurring + user.usage.packRevenueUsd + user.usage.feeRevenueUsd;
}

export function costUsd(user: User) {
  roll(user);
  return user.usage.aiCostUsd + user.usage.smsCostUsd;
}

export function costBudgetUsd(user: User) {
  return inTrial(user) ? TRIAL.costCapUsd + revenueUsd(user) * MAX_COST_SHARE : revenueUsd(user) * MAX_COST_SHARE;
}

export function repliesAllowed(user: User) {
  roll(user);
  if (inTrial(user)) return Math.max(0, TRIAL.replies - user.usage.trialReplies) + user.usage.replies + user.usage.packReplies;
  return plan(user).replies + user.usage.packReplies;
}

export function customerTextsAllowed(user: User) {
  return inTrial(user) ? TRIAL.customerTexts : plan(user).customerTexts;
}

// --- the gate before every reply ----------------------------------------------------

export type Gate = { ok: true; model: string; notice?: string } | { ok: false; message: string };

export async function gate(user: User): Promise<Gate> {
  roll(user);
  const b = user.billing;

  if (inTrial(user) && b.trialEndsAt && Date.now() > b.trialEndsAt && !b.stripeSubscriptionId) {
    b.status = "none";
    update(user);
  }
  if (b.status === "none" || b.status === "canceled") {
    return { ok: false, message: `Your Macoma trial has ended. Pick a plan to keep going: ${await planLink(user, b.plan)}` };
  }
  if (b.status === "past_due") {
    return { ok: false, message: `Your last payment didn't go through. Update it here and I'll pick up where we left off: ${await portalLink(user)}` };
  }

  const used = user.usage.replies;
  const allowed = repliesAllowed(user);
  if (used >= allowed) {
    const p = plan(user);
    return {
      ok: false,
      message: inTrial(user)
        ? b.stripeSubscriptionId
          ? `You've used all ${TRIAL.replies} trial replies. Reply START NOW to end the trial and start your ${p.name} plan today ($${p.priceUsd}/mo), or wait until it starts on its own. Your reminders still fire.`
          : `You've used all ${TRIAL.replies} trial replies. Start your plan to keep going (your reminders still fire): ${await planLink(user, b.plan)}`
        : `You've used this month's ${allowed} replies. Reply MORE to add ${PACK.replies} for $${PACK.priceUsd}, or UPGRADE for a bigger plan. Your reminders still fire.`,
    };
  }

  let notice: string | undefined;
  if (!user.usage.warned && used + 1 >= Math.ceil(allowed * 0.8)) {
    user.usage.warned = true;
    update(user);
    notice = inTrial(user)
      ? `Heads-up: you've used ${user.usage.trialReplies + 1} of your ${TRIAL.replies} trial replies. Reply UPGRADE to start your plan anytime.`
      : `Heads-up: you've used ${used + 1} of ${allowed} replies this month. Reply MORE anytime to add ${PACK.replies}.`;
  }

  // Over the cost budget: keep answering, on the cheapest model that can do the job.
  const model = costUsd(user) >= costBudgetUsd(user) ? BUDGET_MODEL : PLAN_MODEL[b.plan];
  return { ok: true, model, notice };
}

export function canTextCustomer(user: User): string | null {
  roll(user);
  const allowed = customerTextsAllowed(user);
  if (allowed === 0) return "Texting customers is on the Business and Crew plans. Reply UPGRADE to switch.";
  if (user.usage.customerTexts >= allowed) return `You've sent this month's ${allowed} customer texts. Reply UPGRADE for more.`;
  return null;
}

// --- metering -------------------------------------------------------------------------

type ApiUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export const hasPrice = (model: string) => Boolean(MODEL_PRICES[model]);

export function priceCall(model: string, u: ApiUsage): number {
  const p = MODEL_PRICES[model] ?? MODEL_PRICES[DEFAULT_MODEL];
  const perTok = (usd: number) => usd / 1_000_000;
  return (
    u.input_tokens * perTok(p.in) +
    (u.cache_read_input_tokens ?? 0) * perTok(p.cacheRead) +
    (u.cache_creation_input_tokens ?? 0) * perTok(p.cacheWrite) +
    u.output_tokens * perTok(p.out) +
    (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD
  );
}

export function recordModelCall(user: User | null, model: string, u: ApiUsage) {
  if (!user) return;
  roll(user);
  user.usage.aiCostUsd += priceCall(model, u);
  user.usage.inputTokens += u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  user.usage.outputTokens += u.output_tokens;
}

// Called once per answered inbound text.
export async function recordReply(user: User) {
  roll(user);
  user.usage.replies += 1;
  if (inTrial(user)) user.usage.trialReplies += 1; // at the cap the gate pauses replies; billing never starts early on its own
  update(user);
}

// GSM-7 fits 160 characters (153 per part); anything else is UCS-2 at 70 (67 per part).
// GSM extension characters take two slots; UCS-2 counts UTF-16 units, so an emoji takes two.
const GSM_BASIC = /^[\n\r !"#$%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà@£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤^{}\\[~\]|€]*$/;
const GSM_EXT = /[\^{}\\[~\]|€]/g;
export function segments(text: string): number {
  const gsm = GSM_BASIC.test(text);
  const len = gsm ? text.length + (text.match(GSM_EXT)?.length ?? 0) : text.length;
  const single = gsm ? 160 : 70;
  const part = gsm ? 153 : 67;
  return len <= single ? 1 : Math.ceil(len / part);
}

export function recordSms(user: User, text: string) {
  roll(user);
  user.usage.smsCostUsd += segments(text) * SMS_SEGMENT_USD;
  update(user);
}

export function recordCustomerText(user: User, text: string) {
  user.usage.customerTexts += 1;
  recordSms(user, text);
}

export function recordInvoiceFee(user: User, feeUsd: number) {
  roll(user);
  user.usage.feeRevenueUsd += feeUsd;
  update(user);
}

export function invoiceFeeCents(user: User, totalUsd: number): number {
  return Math.round(totalUsd * 100 * (plan(user).invoiceFeePct / 100));
}

// --- trial and Stripe Billing ---------------------------------------------------------

// One free trial per phone number, ever. A hash of the number outlives account deletion
// (see the Privacy Policy), so delete-and-rejoin doesn't reset the trial.
const trialKey = (phone: string) => crypto.createHash("sha256").update(`macoma-trial:${phone}`).digest("hex");

export async function startTrial(user: User): Promise<boolean> {
  if (user.billing.status !== "none") return false;
  const r = await (await db()).query("INSERT INTO trial_history (phone_hash) VALUES ($1) ON CONFLICT DO NOTHING", [trialKey(user.phone)]);
  if (!r.rowCount) return false; // had one before: they'll be asked to pick a plan
  user.billing.status = "trialing";
  user.billing.trialEndsAt = Date.now() + TRIAL.days * 86_400_000;
  update(user);
  return true;
}

// The owner asked (START NOW) to end the trial and start paying today.
export async function startPlanNow(user: User): Promise<string> {
  const b = user.billing;
  if (b.status !== "trialing") return describeUsage(user);
  if (stripe && b.stripeSubscriptionId) {
    await stripe.subscriptions.update(b.stripeSubscriptionId, { trial_end: "now" }); // the webhook flips status to active
    return `Your ${plan(user).name} plan starts today. You'll get a receipt from Stripe.`;
  }
  return `Start your plan here (Apple Pay works): ${await planLink(user, b.plan)}`;
}

const liveSubscription = (user: User) =>
  Boolean(user.billing.stripeSubscriptionId) && ["trialing", "active", "past_due"].includes(user.billing.status);

// Changes plan: an existing subscription is switched in place (prorated), never duplicated.
// The plan on the account only changes when Stripe confirms (webhook), never before payment.
export async function switchPlan(user: User, planId: PlanId, returnPath: string): Promise<{ url: string | null; message: string }> {
  const p = PLANS[planId];
  if (!stripe) {
    user.billing.plan = planId; // dev mode: nothing to pay
    update(user);
    return { url: null, message: "Billing isn't switched on yet. Your free trial is running." };
  }
  if (!liveSubscription(user)) return { url: await planLink(user, planId, returnPath), message: "" };
  if (user.billing.plan === planId) return { url: null, message: `You're already on ${p.name}.` };
  if (!p.stripePrice) return { url: null, message: "That plan isn't available yet." };
  const sub = await stripe.subscriptions.retrieve(user.billing.stripeSubscriptionId!);
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, price: p.stripePrice }],
    proration_behavior: "create_prorations",
    metadata: { phone: user.phone, plan: planId },
  });
  return { url: null, message: `Switched to ${p.name} ($${p.priceUsd}/mo). The difference shows on your next bill.` };
}

// Account deletion: stop billing right away (no further charges for a deleted account).
export async function cancelNow(user: User) {
  const b = user.billing;
  if (stripe && b.stripeSubscriptionId && b.status !== "canceled") {
    await stripe.subscriptions.cancel(b.stripeSubscriptionId).catch((err) => {
      if ((err as { code?: string }).code !== "resource_missing") throw err;
    });
  }
  b.status = "canceled";
  update(user);
}

const fallbackLink = `${PUBLIC_URL}/#plans`;

// A Stripe Checkout link for a plan. Apple Pay shows on Checkout automatically on Apple devices.
export async function planLink(user: User, planId: PlanId = user.billing.plan, returnPath = "/connect.html?paid=1"): Promise<string> {
  const p = PLANS[planId];
  if (!stripe || !p.stripePrice) return fallbackLink;
  const b = user.billing;
  // Keep the rest of the trial unless its replies are used up; then billing starts today.
  const repliesLeft = user.usage.trialReplies < TRIAL.replies;
  const trialLeft = b.status === "trialing" && b.trialEndsAt && repliesLeft ? b.trialEndsAt - Date.now() : 0;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: p.stripePrice, quantity: 1 }],
    ...(b.stripeCustomerId ? { customer: b.stripeCustomerId } : {}),
    client_reference_id: user.phone,
    metadata: { phone: user.phone, kind: "plan", plan: planId },
    subscription_data: {
      metadata: { phone: user.phone, plan: planId },
      // Stripe needs a trial end at least 48 hours out; otherwise billing starts today.
      ...(trialLeft > 48 * 3_600_000 ? { trial_end: Math.floor((Date.now() + trialLeft) / 1000) } : {}),
    },
    payment_method_collection: "always",
    // California's auto-renewal law wants separate, express consent to a trial that converts to paid.
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: {
        message: `I agree to the [Terms](${PUBLIC_URL}/terms). After the free trial my ${p.name} plan renews every month at $${p.priceUsd} until I cancel. I can cancel anytime by texting CANCEL PLAN.`,
      },
    },
    // Tells the page whether billing starts at the end of the trial or today.
    success_url: `${PUBLIC_URL}${returnPath.replace("paid=1", trialLeft > 48 * 3_600_000 ? "paid=trial" : "paid=now")}`,
    cancel_url: `${PUBLIC_URL}${returnPath.replace("paid=1", "paid=0")}`,
  });
  return session.url ?? fallbackLink;
}

export async function packLink(user: User): Promise<string> {
  if (!stripe) return fallbackLink;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: PACK.priceUsd * 100,
          product_data: { name: `Macoma reply pack (${PACK.replies} replies)` },
        },
      },
    ],
    ...(user.billing.stripeCustomerId ? { customer: user.billing.stripeCustomerId } : {}),
    client_reference_id: user.phone,
    metadata: { phone: user.phone, kind: "pack" },
    success_url: `${PUBLIC_URL}/thanks.html`,
    cancel_url: `${PUBLIC_URL}/`,
  });
  return session.url ?? fallbackLink;
}

export async function portalLink(user: User): Promise<string> {
  if (!stripe || !user.billing.stripeCustomerId) return fallbackLink;
  const s = await stripe.billingPortal.sessions.create({ customer: user.billing.stripeCustomerId, return_url: `${PUBLIC_URL}/` });
  return s.url;
}

// Cancel by text: ends at the close of the paid period, as the owner expects.
export async function cancelPlan(user: User): Promise<string> {
  const b = user.billing;
  if (b.status === "canceled" || b.status === "none") return "You don't have a plan that renews, so there's nothing to cancel.";
  if (stripe && b.stripeSubscriptionId) {
    const sub = await stripe.subscriptions.update(b.stripeSubscriptionId, { cancel_at_period_end: true });
    const end = sub.items.data[0]?.current_period_end ?? null;
    return `Done. Your plan won't renew${end ? ` and stays on until ${new Date(end * 1000).toLocaleDateString("en-US", { timeZone: user.settings.timezone, month: "short", day: "numeric" })}` : ""}. Reply START PLAN to undo.`;
  }
  b.status = "canceled";
  update(user);
  return "Done. Your plan is cancelled and you won't be charged.";
}

export async function resumePlan(user: User): Promise<string> {
  const b = user.billing;
  if (b.status === "canceled" && b.stripeSubscriptionId) {
    b.stripeSubscriptionId = null; // ended subscriptions can't be resumed; start a new one
    update(user);
  }
  if (stripe && b.stripeSubscriptionId) {
    await stripe.subscriptions.update(b.stripeSubscriptionId, { cancel_at_period_end: false });
    return "Your plan will keep renewing. Welcome back.";
  }
  return `Pick a plan here: ${await planLink(user)}`;
}

export function describeUsage(user: User): string {
  roll(user);
  const b = user.billing;
  const p = plan(user);
  const status =
    b.status === "trialing" && b.trialEndsAt
      ? `Trial: ${Math.max(0, TRIAL.replies - user.usage.trialReplies)} replies or ${Math.max(0, Math.ceil((b.trialEndsAt - Date.now()) / 86_400_000))} days left`
      : `${p.name} plan (${b.status})`;
  return `${status}. This month: ${user.usage.replies}/${repliesAllowed(user)} replies, ${user.usage.customerTexts}/${customerTextsAllowed(user)} customer texts.`;
}

// Texted 3 days before a trial converts. Returns the text, or null when nothing is due.
export function trialReminder(user: User): string | null {
  const b = user.billing;
  if (b.status !== "trialing" || b.trialReminderSent || !b.trialEndsAt) return null;
  if (b.trialEndsAt - Date.now() > 3 * 86_400_000) return null;
  b.trialReminderSent = true;
  update(user);
  const p = plan(user);
  const day = new Date(b.trialEndsAt).toLocaleDateString("en-US", { timeZone: user.settings.timezone, weekday: "long", month: "short", day: "numeric" });
  return b.stripeSubscriptionId
    ? `Heads-up: your free trial ends ${day}. Then your ${p.name} plan is $${p.priceUsd}/month. Nothing to do if you're staying. Text CANCEL PLAN to stop it.`
    : `Heads-up: your free trial ends ${day}. Text UPGRADE to keep your assistants going after that.`;
}

// --- Stripe webhooks (platform account) -------------------------------------------------

const statusFrom = (s: Stripe.Subscription.Status): User["billing"]["status"] =>
  s === "trialing" ? "trialing" : s === "active" ? "active" : s === "past_due" || s === "unpaid" || s === "incomplete" ? "past_due" : "canceled";

export async function handleBillingEvent(event: Stripe.Event): Promise<string | null> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      const user = s.metadata?.phone ? await getUser(s.metadata.phone) : undefined;
      if (!user) return null;
      if (typeof s.customer === "string") user.billing.stripeCustomerId = s.customer;
      // A bank payment can complete checkout before the money arrives; credit the pack only once paid.
      // (Each event id is processed once: the job queue dedupes on it.)
      if (s.metadata?.kind === "pack" && s.payment_status === "paid") {
        roll(user);
        user.usage.packReplies += PACK.replies;
        user.usage.packRevenueUsd += (s.amount_total ?? PACK.priceUsd * 100) / 100;
        update(user);
        return `Added ${PACK.replies} replies. Thanks!`;
      }
      if (s.metadata?.kind === "plan" && typeof s.subscription === "string" && event.type === "checkout.session.completed") {
        user.billing.stripeSubscriptionId = s.subscription;
        user.billing.plan = (s.metadata.plan as PlanId) ?? user.billing.plan;
        update(user);
      }
      return null;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const user = sub.metadata?.phone ? await getUser(sub.metadata.phone) : await userByStripe({ subscription: sub.id });
      if (!user) return null;
      const before = user.billing.status;
      user.billing.stripeSubscriptionId = sub.id;
      if (typeof sub.customer === "string") user.billing.stripeCustomerId = sub.customer;
      user.billing.status = event.type === "customer.subscription.deleted" ? "canceled" : statusFrom(sub.status);
      user.billing.trialEndsAt = sub.trial_end ? sub.trial_end * 1000 : user.billing.trialEndsAt;
      const planId = Object.values(PLANS).find((p) => p.stripePrice && sub.items.data.some((i) => i.price.id === p.stripePrice))?.id;
      if (planId) user.billing.plan = planId;
      update(user);
      if (before !== "active" && user.billing.status === "active") return `You're on the ${plan(user).name} plan. Thanks for being here.`;
      if (user.billing.status === "past_due" && before !== "past_due") return `Your payment didn't go through. Update it here: ${await portalLink(user)}`;
      return null;
    }
    default:
      return null;
  }
}

export async function billingOwnerFor(event: Stripe.Event): Promise<User | undefined> {
  const obj = event.data.object as { metadata?: Record<string, string> | null; customer?: unknown };
  if (obj.metadata?.phone) return getUser(obj.metadata.phone);
  if (typeof obj.customer === "string") return userByStripe({ customer: obj.customer });
  return undefined;
}

// Owner tools: contacts, reminders, follow-ups, reorders, invoices.
// Anything that reaches a third party goes through `propose()` and only runs
// after the owner replies YES.
import { stripe, stripeEnabled, type Stripe } from "./stripeClient.js";
import { sendSms } from "./sms.js";
import * as billing from "./billing.js";
import {
  id,
  isDoNotText,
  update,
  type ActionLog,
  type Contact,
  type Invoice,
  type Pending,
  type Reminder,
  type User,
} from "./store.js";

export { stripeEnabled };
const CONFIRM_TTL_MS = 30 * 60 * 1000;

// --- action log ---------------------------------------------------------------

export function logAction(user: User, entry: Omit<ActionLog, "id" | "at">): ActionLog {
  const a: ActionLog = { id: id("act"), at: Date.now(), ...entry };
  user.actions = [...user.actions, a].slice(-200);
  update(user);
  return a;
}

function setActionStatus(user: User, actionId: string, status: ActionLog["status"], detail?: string) {
  const a = user.actions.find((x) => x.id === actionId);
  if (a) Object.assign(a, { status, ...(detail && { detail }) });
  update(user);
}

export function recentActions(user: User, n = 8): string {
  const rows = user.actions.slice(-n).reverse();
  if (!rows.length) return "No actions yet.";
  return rows.map((a) => `${fmtTime(user, a.at)} · ${a.status.replace(/_/g, " ")} · ${a.summary}`).join("\n");
}

// --- confirmation gate ----------------------------------------------------------

type PendingType = "message_contact" | "send_invoice" | "delete_account" | "web_request" | "ask_agent" | "bundle" | "purchase";

// Actions defined elsewhere (agent.ts) that also wait for YES. Registered to avoid a circular import.
const actions = new Map<string, (user: User, payload: any) => Promise<string>>();
export function registerAction(type: PendingType, run: (user: User, payload: any) => Promise<string>) {
  actions.set(type, run);
}

export function propose(user: User, type: PendingType, summary: string, payload: unknown, ttlMs = CONFIRM_TTL_MS): string {
  if (user.pending) setActionStatus(user, user.pending.actionId, "cancelled", "replaced by a newer request");
  const action = logAction(user, { type, summary, status: "awaiting_confirmation" });
  user.pending = { actionId: action.id, type, summary, payload, expiresAt: Date.now() + ttlMs };
  update(user);
  return action.id;
}

// The exact words the owner is approving, written by the server rather than the model.
export function exactDraft(user: User, p: Pending): string {
  if (p.type === "message_contact") {
    const c = user.contacts.find((x) => x.id === p.payload.contactId);
    return `To ${c?.name ?? "contact"}, exactly:\n"${p.payload.text}"\nReply YES to send or NO to cancel.`;
  }
  if (p.type === "send_invoice") {
    const inv = user.invoices.find((i) => i.id === p.payload.invoiceId);
    return inv ? `${invoiceText(user, inv)}\nReply YES to send it or NO to cancel.` : "Reply YES to send or NO to cancel.";
  }
  if (p.type === "bundle") return bundleText(p.payload.items);
  if (p.type === "purchase")
    return `Buy ${p.payload.item} from ${p.payload.merchant} for $${Number(p.payload.totalUsd).toFixed(2)}. Reply YES and I'll send the checkout link; you pay there with Apple Pay or a card. NO to cancel.`;
  if (p.type === "web_request") return `${p.payload.method} ${p.payload.url}\nPaid only if it fits your per-call and daily limits. Reply YES to go ahead or NO to cancel.`;
  if (p.type === "ask_agent")
    return `Send to ${p.payload.agent_name ? `your agent ${p.payload.agent_name}` : `the agent at ${p.payload.agent_url}`}, exactly:\n"${p.payload.message}"\nReply YES to send or NO to cancel.`;
  return `${p.summary}. Reply YES to confirm or NO to cancel.`;
}

export function cancelPending(user: User): string | null {
  const p = user.pending;
  if (!p) return null;
  user.pending = null;
  setActionStatus(user, p.actionId, "cancelled");
  return p.summary;
}

// Runs the pending action. Returns the text to send back to the owner.
// `pick` (1-based) sends only some items of a prepared bundle, e.g. the owner replied "1 3".
export async function confirmPending(user: User, onDeleteAccount: () => Promise<void> | void, pick?: number[]): Promise<string> {
  const p = user.pending;
  if (!p) return "Nothing is waiting for a yes right now.";
  user.pending = null;
  update(user);
  if (Date.now() > p.expiresAt) {
    setActionStatus(user, p.actionId, "cancelled", "expired");
    return "That request expired. Ask me again if you still want it.";
  }
  try {
    let result: string;
    switch (p.type) {
      case "message_contact":
        result = await deliverToContact(user, p.payload.contactId, p.payload.text);
        break;
      case "send_invoice":
        result = await deliverInvoice(user, p.payload.invoiceId);
        break;
      case "bundle":
        result = await deliverBundle(user, p.payload.items, pick);
        break;
      // Today the owner pays on the merchant's page (Apple Pay needs their Face ID). When Stripe's
      // agent payments (one-time card or Shared Payment Token) are enabled, this is where Macoma
      // would get a credential capped at this total for this merchant and complete checkout.
      case "purchase":
        result = `Here's the checkout for ${p.payload.item} at ${p.payload.merchant}: ${p.payload.checkoutUrl}\nPay there with Apple Pay. Tell me when it's done and I'll note it.`;
        break;
      case "delete_account":
        setActionStatus(user, p.actionId, "done");
        await onDeleteAccount();
        return "Done. Your account and data are deleted. Text this number again any time to start over.";
      default: {
        const run = actions.get(p.type);
        if (!run) throw new Error(`Unknown action ${p.type}`);
        result = await run(user, p.payload);
      }
    }
    setActionStatus(user, p.actionId, "done");
    return result;
  } catch (err) {
    const msg = (err as Error).message;
    setActionStatus(user, p.actionId, "failed", msg);
    return `Couldn't do that: ${msg}`;
  }
}

// --- contacts -------------------------------------------------------------------

export function upsertContact(user: User, input: Partial<Contact> & { name: string }): Contact {
  const match =
    (input.id && user.contacts.find((c) => c.id === input.id)) ||
    (input.phone && user.contacts.find((c) => c.phone === input.phone)) ||
    user.contacts.find((c) => c.name.toLowerCase() === input.name.toLowerCase());
  if (match) {
    Object.assign(match, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null)));
    update(user);
    return match;
  }
  const c: Contact = {
    id: id("c"),
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    kind: input.kind ?? "other",
    notes: input.notes ?? "",
    lastOutboundAt: null,
    lastInboundAt: null,
  };
  user.contacts.push(c);
  update(user);
  return c;
}

export function findContact(user: User, ref: string): Contact {
  const q = ref.toLowerCase();
  const c =
    user.contacts.find((x) => x.id === ref) ??
    user.contacts.find((x) => x.name.toLowerCase() === q) ??
    user.contacts.find((x) => x.name.toLowerCase().includes(q));
  if (!c) throw new Error(`No contact matching "${ref}". Add them first with their name and number.`);
  return c;
}

export function describeContacts(user: User, kind?: string): string {
  const list = user.contacts.filter((c) => !kind || c.kind === kind);
  if (!list.length) return "No contacts yet.";
  return list
    .map((c) => {
      const last = Math.max(c.lastOutboundAt ?? 0, c.lastInboundAt ?? 0);
      return `${c.id} · ${c.name} (${c.kind}) ${c.phone ?? "no phone"}${c.email ? " " + c.email : ""}${
        last ? ` · last contact ${fmtTime(user, last)}` : ""
      }${c.notes ? ` · ${c.notes}` : ""}`;
    })
    .join("\n");
}

// Quiet hours for texts to third parties, in the owner's timezone.
function inQuietHours(user: User) {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: user.settings.timezone, hour: "numeric", hour12: false }));
  return hour < 8 || hour >= 21;
}

// Why a text to this contact can't go out right now, or null if it can.
async function textBlocked(user: User, c: Contact): Promise<string | null> {
  if (!c.phone) return `${c.name} has no phone number on file.`;
  if (await isDoNotText(c.phone)) return `${c.name} has opted out of texts.`;
  if (inQuietHours(user)) return "It's outside 8am–9pm for texting customers. Set a reminder to send it in the morning instead.";
  return billing.canTextCustomer(user);
}

// How every text to a contact ends, so they know who it's from.
export const signed = (user: User, text: string) => `${text}\n\n– ${signature(user)} (sent via Macoma)`;

// --- prepared bundles: several drafts, one YES ------------------------------------------------

export type BundleItem = { contactId: string; text: string; label: string; kind: "confirm" | "invoice" | "lead"; invoiceId?: string };

export function bundleText(items: BundleItem[]): string {
  const lines = items.map((it, i) => `${i + 1}. ${it.label}\n"${it.text.split("\n\n– ")[0]}"`);
  return `${lines.join("\n")}\nReply YES to send ${items.length > 1 ? "all" : "it"}${items.length > 1 ? ", the numbers to send some (like 1 3)," : ""} or NO to skip.`;
}

async function deliverBundle(user: User, items: BundleItem[], pick?: number[]): Promise<string> {
  const chosen = pick?.length ? items.filter((_, i) => pick.includes(i + 1)) : items;
  if (!chosen.length) return "None of those numbers matched, so nothing was sent.";
  const { sent, skipped } = await sendPrepared(user, chosen);
  return [sent.length && `Sent to ${sent.join(", ")} ✓`, skipped.length && `Skipped: ${skipped.join("; ")}`].filter(Boolean).join("\n");
}

// Sends prepared texts one by one; each is re-checked (opt-outs, quiet hours, allowance) as it goes.
export async function sendPrepared(user: User, chosen: BundleItem[]): Promise<{ sent: string[]; skipped: string[] }> {
  const sent: string[] = [], skipped: string[] = [];
  for (const it of chosen) {
    const c = user.contacts.find((x) => x.id === it.contactId);
    try {
      await deliverToContact(user, it.contactId, it.text);
      if (c) c.nudgedAt = Date.now();
      const inv = it.invoiceId && user.invoices.find((i) => i.id === it.invoiceId);
      if (inv) inv.nudgedAt = Date.now();
      sent.push(c?.name ?? "contact");
    } catch (err) {
      skipped.push(`${c?.name ?? "contact"} (${(err as Error).message.replace(/\.$/, "")})`);
    }
  }
  update(user);
  return { sent, skipped };
}

function signature(user: User) {
  return user.settings.business ?? user.settings.name ?? "your contact";
}

export async function draftContactMessage(user: User, contactRef: string, text: string): Promise<string> {
  const c = findContact(user, contactRef);
  const blocked = await textBlocked(user, c);
  if (blocked) throw new Error(blocked);
  const body = signed(user, text);
  propose(user, "message_contact", `Text ${c.name}: "${text}"`, { contactId: c.id, text: body });
  return `Drafted. Show the owner this exact message to ${c.name} and ask them to reply YES to send or NO to cancel:\n${body}`;
}

async function deliverToContact(user: User, contactId: string, body: string): Promise<string> {
  const c = user.contacts.find((x) => x.id === contactId);
  if (!c?.phone) throw new Error("contact has no phone");
  // Checked again at YES: the owner may confirm hours later, or after using up the allowance.
  const blocked = await textBlocked(user, c);
  if (blocked) throw new Error(blocked);
  // First-ever message to this number carries opt-out instructions.
  const first = !c.lastOutboundAt;
  const text = first ? `${body}\nReply STOP to opt out.` : body;
  await sendSms(c.phone, text);
  billing.recordCustomerText(user, text);
  c.lastOutboundAt = Date.now();
  update(user);
  return `Sent to ${c.name}. I'll pass along anything they text back.`;
}

// --- reminders ------------------------------------------------------------------

const MAX_OPEN_REMINDERS = 50;

export function addReminder(
  user: User,
  r: Pick<Reminder, "kind" | "text" | "dueAt"> & Partial<Pick<Reminder, "repeat" | "contactId" | "onlyIfNoReply">>,
): Reminder {
  if (!Number.isFinite(r.dueAt)) throw new Error("Invalid due time. Use ISO 8601 with a UTC offset.");
  // Every reminder is a text we pay for; keep the list to what one person can act on.
  if (user.reminders.filter((x) => !x.done).length >= MAX_OPEN_REMINDERS)
    throw new Error(`There are already ${MAX_OPEN_REMINDERS} open reminders. Cancel some first.`);
  const rem: Reminder = {
    id: id("r"),
    kind: r.kind,
    text: r.text.slice(0, 300),
    dueAt: r.dueAt,
    repeat: r.repeat ?? null,
    contactId: r.contactId ?? null,
    onlyIfNoReply: r.onlyIfNoReply ?? false,
    createdAt: Date.now(),
    done: false,
  };
  user.reminders.push(rem);
  logAction(user, { type: "set_reminder", summary: `${rem.kind.replace("_", " ")} at ${fmtTime(user, rem.dueAt)}: ${rem.text}`, status: "done" });
  return rem;
}

export function describeReminders(user: User): string {
  const open = user.reminders.filter((r) => !r.done).sort((a, b) => a.dueAt - b.dueAt);
  if (!open.length) return "No upcoming reminders.";
  return open
    .map((r) => {
      const rep = r.repeat ? ` (every ${r.repeat.every} ${r.repeat.unit}${r.repeat.every > 1 ? "s" : ""})` : "";
      return `${r.id} · ${r.kind.replace("_", " ")} · ${fmtTime(user, r.dueAt)}${rep} · ${r.text}`;
    })
    .join("\n");
}

export function cancelReminder(user: User, reminderId: string) {
  const r = user.reminders.find((x) => x.id === reminderId);
  if (!r) throw new Error(`No reminder ${reminderId}`);
  r.done = true;
  logAction(user, { type: "cancel_reminder", summary: `Cancelled: ${r.text}`, status: "done" });
}

export function nextOccurrence(r: Reminder): number {
  const d = new Date(r.dueAt);
  const n = r.repeat!.every;
  if (r.repeat!.unit === "day") d.setUTCDate(d.getUTCDate() + n);
  if (r.repeat!.unit === "week") d.setUTCDate(d.getUTCDate() + 7 * n);
  if (r.repeat!.unit === "month") d.setUTCMonth(d.getUTCMonth() + n);
  return d.getTime();
}

// --- invoices -------------------------------------------------------------------

export function createInvoice(
  user: User,
  contactRef: string,
  items: Invoice["items"],
  dueInDays: number,
): Invoice {
  const c = findContact(user, contactRef);
  if (!items.length) throw new Error("Invoice needs at least one line item.");
  const total = Math.round(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100;
  const inv: Invoice = {
    id: id("inv"),
    number: `INV-${String(user.invoices.length + 1).padStart(4, "0")}`,
    contactId: c.id,
    items,
    total,
    currency: "usd",
    dueDate: Date.now() + dueInDays * 86_400_000,
    status: "draft",
    payUrl: null,
    stripeId: null,
    createdAt: Date.now(),
    sentAt: null,
    paidAt: null,
  };
  user.invoices.push(inv);
  logAction(user, { type: "create_invoice", summary: `Drafted ${inv.number} for ${c.name}: $${total.toFixed(2)}`, status: "done" });
  return inv;
}

export function invoiceText(user: User, inv: Invoice): string {
  const c = user.contacts.find((x) => x.id === inv.contactId);
  const lines = inv.items.map((i) => `${i.quantity} × ${i.description} @ $${i.unitPrice.toFixed(2)}`).join("\n");
  return `${inv.number} · ${c?.name ?? "?"} · ${inv.status} · $${inv.total.toFixed(2)} due ${fmtDate(user, inv.dueDate)}\n${lines}`;
}

export function describeInvoices(user: User, status?: string): string {
  const list = user.invoices.filter((i) => !status || i.status === status);
  if (!list.length) return "No invoices.";
  return list.map((i) => `${i.id} · ${invoiceText(user, i).split("\n")[0]}`).join("\n");
}

// Stripe emails the invoice when the owner has connected Stripe and the contact has an email.
const canEmail = (user: User, c: Contact) => Boolean(c.email && stripe && user.billing.connectAccountId);

export async function proposeSendInvoice(user: User, invoiceId: string): Promise<string> {
  const inv = user.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error(`No invoice ${invoiceId}`);
  const c = user.contacts.find((x) => x.id === inv.contactId)!;
  if (!c.phone && !c.email) throw new Error(`${c.name} has no phone or email on file.`);
  const blocked = await textBlocked(user, c);
  if (blocked && !canEmail(user, c)) throw new Error(blocked);
  if (!(stripe && user.billing.connectAccountId) && !user.settings.paymentLink)
    throw new Error(
      "No way to collect payment yet. Ask the owner to connect Stripe (text CONNECT for the link) so customers can pay with Apple Pay, or to send a payment link (Square, Venmo, PayPal) to save with update_profile.",
    );
  propose(user, "send_invoice", `Send ${inv.number} ($${inv.total.toFixed(2)}) to ${c.name}`, { invoiceId });
  return `Ready. Show the owner this and ask them to reply YES to send it to ${c.name}:\n${invoiceText(user, inv)}`;
}

async function deliverInvoice(user: User, invoiceId: string): Promise<string> {
  const inv = user.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error("invoice not found");
  const c = user.contacts.find((x) => x.id === inv.contactId)!;

  const acct = user.billing.connectAccountId;
  if (stripe && acct) {
    // Direct charge on the owner's own Stripe account: the owner is the merchant,
    // Stripe's processing fee comes out of their payout, and Macoma's fee is the application fee.
    // The hosted invoice page offers Apple Pay to the customer automatically.
    const opts = { stripeAccount: acct };
    const customer = await stripe.customers.create(
      { name: c.name, email: c.email ?? undefined, phone: c.phone ?? undefined, metadata: { macomaOwner: user.phone, contactId: c.id } },
      opts,
    );
    const fee = billing.invoiceFeeCents(user, inv.total);
    inv.feeCents = fee; // counted as revenue when Stripe says it's paid
    const draft = await stripe.invoices.create(
      {
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: Math.max(1, Math.ceil((inv.dueDate - Date.now()) / 86_400_000)),
        metadata: { owner: user.phone, invoiceId: inv.id },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
      },
      opts,
    );
    for (const item of inv.items) {
      await stripe.invoiceItems.create(
        {
          customer: customer.id,
          invoice: draft.id,
          currency: inv.currency,
          amount: Math.round(item.quantity * item.unitPrice * 100),
          description: `${item.quantity} × ${item.description}`,
        },
        opts,
      );
    }
    const final = await stripe.invoices.finalizeInvoice(draft.id!, {}, opts);
    if (c.email) await stripe.invoices.sendInvoice(final.id!, {}, opts);
    inv.stripeId = final.id!;
    inv.payUrl = final.hosted_invoice_url ?? null;
  } else {
    inv.payUrl = user.settings.paymentLink;
  }

  const blocked = await textBlocked(user, c);
  if (blocked && !canEmail(user, c)) throw new Error(blocked);
  let texted = false;
  if (!blocked && c.phone) {
    const first = !c.lastOutboundAt;
    const text = `Hi ${c.name.split(" ")[0]}, here's invoice ${inv.number} from ${signature(user)} for $${inv.total.toFixed(2)}, due ${fmtDate(
      user,
      inv.dueDate,
    )}. Pay here: ${inv.payUrl}${first ? "\nReply STOP to opt out." : ""}`;
    await sendSms(c.phone, text);
    billing.recordCustomerText(user, text);
    c.lastOutboundAt = Date.now();
    texted = true;
  }
  inv.status = "sent";
  inv.sentAt = Date.now();
  // Nudge the owner if it's still unpaid a day after it's due.
  addReminder(user, {
    kind: "invoice_chase",
    text: `${inv.number} for ${c.name} ($${inv.total.toFixed(2)}) is unpaid. Want me to send a friendly nudge?`,
    dueAt: inv.dueDate + 86_400_000,
    contactId: c.id,
  });
  update(user);
  const how = texted && canEmail(user, c) ? "by text and email" : texted ? "by text" : `by email (no text: ${blocked})`;
  return `Sent ${inv.number} to ${c.name} ${how}. I'll tell you when it's paid and nudge you if it's late.`;
}

export function markInvoicePaid(user: User, invoiceId: string, via = "owner"): Invoice {
  const inv = user.invoices.find((i) => i.id === invoiceId || i.stripeId === invoiceId || i.number === invoiceId);
  if (!inv) throw new Error(`No invoice ${invoiceId}`);
  inv.status = "paid";
  inv.paidAt = Date.now();
  for (const r of user.reminders) if (r.kind === "invoice_chase" && r.text.startsWith(inv.number)) r.done = true;
  logAction(user, { type: "invoice_paid", summary: `${inv.number} marked paid (${via})`, status: "done" });
  update(user);
  return inv;
}

// Events from owners' connected Stripe accounts (the Connect webhook endpoint).
// Returns the note to text the owner, if any.
export async function handleConnectEvent(
  event: Stripe.Event,
  findOwner: (phone: string) => Promise<User | undefined>,
): Promise<{ owner: User; text: string } | null> {
  if (event.type !== "invoice.paid") return null;
  const si = event.data.object as Stripe.Invoice;
  const owner = si.metadata?.owner ? await findOwner(si.metadata.owner) : undefined;
  // Only trust an invoice that came from the account this owner connected.
  if (!owner || !si.metadata?.invoiceId || owner.billing.connectAccountId !== event.account) return null;
  const inv = markInvoicePaid(owner, si.metadata.invoiceId, "stripe");
  const fee = inv.feeCents ?? 0;
  if (fee > 0 && !inv.feeRecorded) {
    billing.recordInvoiceFee(owner, fee / 100);
    inv.feeRecorded = true;
  }
  const c = owner.contacts.find((x) => x.id === inv.contactId);
  return { owner, text: `💸 ${c?.name ?? "A customer"} paid ${inv.number} ($${inv.total.toFixed(2)}).` };
}

export function verifyStripe(raw: Buffer, sig: string | undefined, secret: string | undefined): Stripe.Event | null {
  if (!stripe || !secret || !sig) return null;
  try {
    return stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return null;
  }
}

// --- formatting -----------------------------------------------------------------

export function fmtTime(user: User, ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: user.settings.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDate(user: User, ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { timeZone: user.settings.timezone, month: "short", day: "numeric" });
}

export function localHour(user: User) {
  return Number(new Date().toLocaleString("en-US", { timeZone: user.settings.timezone, hour: "numeric", hour12: false })) % 24;
}

// Owner tools: contacts, reminders, follow-ups, reorders, invoices.
// Anything that reaches a third party goes through `propose()` and only runs
// after the owner replies YES.
import Stripe from "stripe";
import { sendSms } from "./sms.js";
import {
  id,
  isDoNotText,
  update,
  type ActionLog,
  type Contact,
  type Invoice,
  type Reminder,
  type User,
} from "./store.js";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const stripeEnabled = Boolean(stripe);
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

type PendingType = "message_contact" | "send_invoice" | "delete_account";

export function propose(user: User, type: PendingType, summary: string, payload: unknown): string {
  if (user.pending) setActionStatus(user, user.pending.actionId, "cancelled", "replaced by a newer request");
  const action = logAction(user, { type, summary, status: "awaiting_confirmation" });
  user.pending = { actionId: action.id, type, summary, payload, expiresAt: Date.now() + CONFIRM_TTL_MS };
  update(user);
  return action.id;
}

export function cancelPending(user: User): string | null {
  const p = user.pending;
  if (!p) return null;
  user.pending = null;
  setActionStatus(user, p.actionId, "cancelled");
  return p.summary;
}

// Runs the pending action. Returns the text to send back to the owner.
export async function confirmPending(user: User, onDeleteAccount: () => void): Promise<string> {
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
      case "delete_account":
        setActionStatus(user, p.actionId, "done");
        onDeleteAccount();
        return "Done. Your account and data are deleted. Text this number again any time to start over.";
      default:
        throw new Error(`Unknown action ${p.type}`);
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

function signature(user: User) {
  return user.settings.business ?? user.settings.name ?? "your contact";
}

export function draftContactMessage(user: User, contactRef: string, text: string): string {
  const c = findContact(user, contactRef);
  if (!c.phone) throw new Error(`${c.name} has no phone number on file.`);
  if (isDoNotText(c.phone)) throw new Error(`${c.name} has opted out of texts. Reach them another way.`);
  if (inQuietHours(user)) throw new Error("It's outside 8am–9pm. Set a reminder to send it in the morning instead.");
  const body = `${text}\n\n– ${signature(user)} (sent via Macoma)`;
  propose(user, "message_contact", `Text ${c.name}: "${text}"`, { contactId: c.id, text: body });
  return `Drafted. Show the owner this exact message to ${c.name} and ask them to reply YES to send or NO to cancel:\n${body}`;
}

async function deliverToContact(user: User, contactId: string, body: string): Promise<string> {
  const c = user.contacts.find((x) => x.id === contactId);
  if (!c?.phone) throw new Error("contact has no phone");
  if (isDoNotText(c.phone)) throw new Error(`${c.name} has opted out of texts`);
  // First-ever message to this number carries opt-out instructions.
  const first = !c.lastOutboundAt;
  await sendSms(c.phone, first ? `${body}\nReply STOP to opt out.` : body);
  c.lastOutboundAt = Date.now();
  update(user);
  return `Sent to ${c.name}. I'll pass along anything they text back.`;
}

// --- reminders ------------------------------------------------------------------

export function addReminder(
  user: User,
  r: Pick<Reminder, "kind" | "text" | "dueAt"> & Partial<Pick<Reminder, "repeat" | "contactId" | "onlyIfNoReply">>,
): Reminder {
  if (!Number.isFinite(r.dueAt)) throw new Error("Invalid due time. Use ISO 8601 with a UTC offset.");
  const rem: Reminder = {
    id: id("r"),
    kind: r.kind,
    text: r.text,
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

export function proposeSendInvoice(user: User, invoiceId: string): string {
  const inv = user.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error(`No invoice ${invoiceId}`);
  const c = user.contacts.find((x) => x.id === inv.contactId)!;
  if (!c.phone && !c.email) throw new Error(`${c.name} has no phone or email on file.`);
  if (!stripe && !user.settings.paymentLink)
    throw new Error("No way to collect payment yet. Ask the owner for a payment link (Square, Venmo, PayPal, Stripe) and save it with update_profile.");
  propose(user, "send_invoice", `Send ${inv.number} ($${inv.total.toFixed(2)}) to ${c.name}`, { invoiceId });
  return `Ready. Show the owner this and ask them to reply YES to send it to ${c.name}:\n${invoiceText(user, inv)}`;
}

async function deliverInvoice(user: User, invoiceId: string): Promise<string> {
  const inv = user.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error("invoice not found");
  const c = user.contacts.find((x) => x.id === inv.contactId)!;

  if (stripe) {
    const customer = await stripe.customers.create({
      name: c.name,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      metadata: { owner: user.phone, contactId: c.id },
    });
    const draft = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: Math.max(1, Math.ceil((inv.dueDate - Date.now()) / 86_400_000)),
      metadata: { owner: user.phone, invoiceId: inv.id },
    });
    for (const item of inv.items) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: draft.id,
        currency: inv.currency,
        amount: Math.round(item.quantity * item.unitPrice * 100),
        description: `${item.quantity} × ${item.description}`,
      });
    }
    const final = await stripe.invoices.finalizeInvoice(draft.id!);
    if (c.email) await stripe.invoices.sendInvoice(final.id!);
    inv.stripeId = final.id!;
    inv.payUrl = final.hosted_invoice_url ?? null;
  } else {
    inv.payUrl = user.settings.paymentLink;
  }

  if (c.phone && !isDoNotText(c.phone)) {
    const first = !c.lastOutboundAt;
    await sendSms(
      c.phone,
      `Hi ${c.name.split(" ")[0]}, here's invoice ${inv.number} from ${signature(user)} for $${inv.total.toFixed(2)}, due ${fmtDate(
        user,
        inv.dueDate,
      )}. Pay here: ${inv.payUrl}${first ? "\nReply STOP to opt out." : ""}`,
    );
    c.lastOutboundAt = Date.now();
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
  return `Sent ${inv.number} to ${c.name}${c.email && stripe ? " (text + email)" : ""}. I'll tell you when it's paid and nudge you if it's late.`;
}

export function markInvoicePaid(user: User, invoiceId: string, via = "owner"): Invoice {
  const inv = user.invoices.find((i) => i.id === invoiceId || i.stripeId === invoiceId || i.number === invoiceId);
  if (!inv) throw new Error(`No invoice ${invoiceId}`);
  inv.status = "paid";
  inv.paidAt = Date.now();
  for (const r of user.reminders) if (r.kind === "invoice_chase" && r.text.startsWith(inv.number)) r.done = true;
  logAction(user, { type: "invoice_paid", summary: `${inv.number} marked paid (${via})`, status: "done" });
  return inv;
}

export async function handleStripeEvent(event: Stripe.Event, findOwner: (phone: string) => User | undefined) {
  if (event.type !== "invoice.paid") return;
  const si = event.data.object as Stripe.Invoice;
  const owner = si.metadata?.owner ? findOwner(si.metadata.owner) : undefined;
  if (!owner || !si.metadata?.invoiceId) return;
  const inv = markInvoicePaid(owner, si.metadata.invoiceId, "stripe");
  const c = owner.contacts.find((x) => x.id === inv.contactId);
  if (!owner.optedOut) await sendSms(owner.phone, `💸 ${c?.name ?? "A customer"} paid ${inv.number} ($${inv.total.toFixed(2)}).`);
}

export function verifyStripe(raw: Buffer, sig: string | undefined): Stripe.Event | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
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

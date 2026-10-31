// "Prepared for you": each morning, before the owner asks, Macoma drafts the texts that need
// sending and holds them for one YES:
//   • payment reminders for invoices a day or more overdue
//   • check-ins with leads who went quiet after you texted them
//   • confirmations for today's appointments with known customers (from the calendar)
// Nothing leaves without the owner's reply. No model call: it's rules over data Macoma has.
import * as billing from "./billing.js";
import { fmtDate, signed, type BundleItem } from "./business.js";
import { calendarEvents } from "./connectors.js";
import { isDoNotText, type Contact, type User } from "./store.js";

const DAY = 86_400_000;
const MAX_ITEMS = 5;

const first = (c: Contact) => c.name.split(" ")[0];
const recently = (t: number | null | undefined, now: number, days: number) => Boolean(t && now - t < days * DAY);

// The contact, if Macoma could text them at all (has a number, hasn't opted out).
async function textable(c: Contact | undefined): Promise<Contact | null> {
  return c?.phone && !(await isDoNotText(c.phone)) ? c : null;
}

export async function prepareDrafts(user: User, now = Date.now()): Promise<BundleItem[]> {
  if (user.settings.prepare === false || billing.canTextCustomer(user)) return []; // off, or no customer texts left
  const items: BundleItem[] = [];
  const used = new Set<string>();
  const add = (c: Contact, it: Omit<BundleItem, "contactId">) => {
    if (used.has(c.id) || items.length >= MAX_ITEMS) return;
    used.add(c.id);
    items.push({ contactId: c.id, ...it });
  };

  // Today's appointments with customers or leads named in the event.
  if (user.connections.google_calendar || user.connections.microsoft) {
    const events = await calendarEvents(user, new Date(now), new Date(now + 16 * 3_600_000)).catch(() => []);
    for (const e of events) {
      const title = e.title.toLowerCase();
      const c = await textable(user.contacts.find((x) => (x.kind === "customer" || x.kind === "lead") && title.includes(x.name.toLowerCase())));
      if (!c || recently(c.nudgedAt, now, 0.8)) continue;
      const time = new Date(e.start).toLocaleTimeString("en-US", { timeZone: user.settings.timezone, hour: "numeric", minute: "2-digit" });
      add(c, { label: `Confirm today's ${time} with ${c.name}`, text: signed(user, `Hi ${first(c)}, confirming today at ${time}${e.where ? ` (${e.where.slice(0, 60)})` : ""}. Reply here if anything changes.`) });
    }
  }

  // Invoices a day or more overdue, not nudged in the last 5 days.
  for (const inv of user.invoices) {
    if (inv.status !== "sent" || inv.dueDate > now - DAY || recently(inv.nudgedAt, now, 5)) continue;
    const c = await textable(user.contacts.find((x) => x.id === inv.contactId));
    if (!c) continue;
    add(c, {
      label: `Payment reminder to ${c.name} (${inv.number}, $${inv.total.toFixed(2)})`,
      invoiceId: inv.id,
      text: signed(user, `Hi ${first(c)}, a friendly reminder that ${inv.number} for $${inv.total.toFixed(2)} was due ${fmtDate(user, inv.dueDate)}.${inv.payUrl ? ` You can pay here: ${inv.payUrl}` : ""} Thank you!`),
    });
  }

  // Leads who haven't replied in 3+ days since you texted, not checked on in the last week.
  for (const c of user.contacts) {
    if (c.kind !== "lead" || !c.lastOutboundAt || now - c.lastOutboundAt < 3 * DAY) continue;
    if ((c.lastInboundAt ?? 0) > c.lastOutboundAt || recently(c.nudgedAt, now, 7)) continue;
    if (!(await textable(c))) continue;
    add(c, { label: `Check in with ${c.name} (lead, quiet ${Math.floor((now - c.lastOutboundAt) / DAY)} days)`, text: signed(user, `Hi ${first(c)}, just checking in. Any questions I can answer, or a time that works for you?`) });
  }
  return items;
}

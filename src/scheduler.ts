// Ticks every 30s: fires due reminders and the owner's morning brief.
import { fmtDate, localHour, nextOccurrence } from "./business.js";
import { sendSms } from "./sms.js";
import { allUsers, today, update, type Reminder, type User } from "./store.js";

const TICK_MS = 30_000;

function reminderText(user: User, r: Reminder): string | null {
  const contact = r.contactId ? user.contacts.find((c) => c.id === r.contactId) : undefined;
  if (r.onlyIfNoReply && contact?.lastInboundAt && contact.lastInboundAt > r.createdAt) return null; // they replied
  switch (r.kind) {
    case "follow_up":
      return `⏰ Follow up with ${contact?.name ?? "your contact"}: ${r.text}\nWant me to draft the text? Just say so.`;
    case "reorder":
      return `📦 Time to reorder: ${r.text}`;
    case "invoice_chase":
      return `🧾 ${r.text}`;
    default:
      return `⏰ ${r.text}`;
  }
}

function brief(user: User): string | null {
  const endOfDay = Date.now() + 24 * 3_600_000;
  const dueToday = user.reminders.filter((r) => !r.done && r.dueAt <= endOfDay);
  const overdue = user.invoices.filter((i) => i.status === "sent" && i.dueDate < Date.now());
  const staleLeads = user.contacts.filter(
    (c) => c.kind === "lead" && c.lastOutboundAt && !c.lastInboundAt && Date.now() - c.lastOutboundAt > 3 * 86_400_000,
  );
  if (!dueToday.length && !overdue.length && !staleLeads.length) return null;

  const parts = [`Good morning${user.settings.name ? `, ${user.settings.name}` : ""}. Today:`];
  if (dueToday.length) parts.push(...dueToday.map((r) => `• ${r.text}`));
  if (overdue.length) {
    const sum = overdue.reduce((s, i) => s + i.total, 0);
    parts.push(`• ${overdue.length} overdue invoice${overdue.length > 1 ? "s" : ""} ($${sum.toFixed(2)}). Oldest was due ${fmtDate(user, overdue[0].dueDate)}.`);
  }
  if (staleLeads.length) parts.push(`• Leads gone quiet: ${staleLeads.map((c) => c.name).join(", ")}`);
  parts.push("Reply with what to handle first.");
  return parts.join("\n");
}

async function tick() {
  const now = Date.now();
  for (const user of allUsers()) {
    if (user.status !== "active" || user.optedOut) continue;
    let changed = false;

    for (const r of user.reminders) {
      if (r.done || r.dueAt > now) continue;
      const text = reminderText(user, r);
      if (r.repeat) r.dueAt = nextOccurrence(r);
      else r.done = true;
      changed = true;
      if (text) await sendSms(user.phone, text).catch((err) => console.error("reminder sms failed", err));
    }

    const day = today(user.settings.timezone);
    if (user.settings.digestHour !== null && localHour(user) === user.settings.digestHour && user.settings.lastDigestDay !== day) {
      user.settings.lastDigestDay = day;
      changed = true;
      const text = brief(user);
      if (text) await sendSms(user.phone, text).catch((err) => console.error("digest sms failed", err));
    }

    if (changed) update(user);
  }
}

export function startScheduler() {
  setInterval(() => tick().catch((err) => console.error("scheduler", err)), TICK_MS);
}

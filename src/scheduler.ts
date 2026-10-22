// Time-based work: reminders, the morning brief, trial notices and the welcome-text fallback.
//
// Nothing scans every account. Each save stores the owner's next due time in an indexed
// column (users.next_due_at); this loop asks Postgres for owners that are due and queues
// one "tick" job each, which runs in that owner's lane like an inbound text.
import { fmtDate, nextOccurrence } from "./business.js";
import { trialReminder } from "./billing.js";
import { enqueue } from "./queue.js";
import { duePhones, setDueIndexer, update, type Reminder, type User } from "./store.js";

const POLL_MS = 15_000;
const CATCH_UP_AFTER_MS = 6 * 3_600_000;
const WELCOME_FALLBACK_MS = 15 * 60_000;
const TRIAL_NOTICE_MS = 3 * 86_400_000;
const SLOT_MS = 15 * 60_000; // time zones are offset by whole quarter hours

// Local calendar day and hour in a time zone, with formatters cached per zone.
const formats = new Map<string, Intl.DateTimeFormat>();
function local(tz: string, ms: number): { day: string; hour: number } {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    formats.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

// The first quarter hour, from the current one on, that falls in the owner's digest hour on
// a day that hasn't had a brief yet. In the past (or now) means the brief is due.
function nextDigestAt(user: User, now = Date.now()): number | null {
  const { digestHour, lastDigestDay, timezone } = user.settings;
  if (digestHour === null) return null;
  for (let t = Math.floor(now / SLOT_MS) * SLOT_MS, end = now + 49 * 3_600_000; t < end; t += SLOT_MS) {
    const l = local(timezone, t);
    if (l.hour === digestHour && l.day !== lastDigestDay) return t;
  }
  return null;
}

const trialNoticeAt = (u: User) =>
  u.billing.status === "trialing" && !u.billing.trialReminderSent && u.billing.trialEndsAt ? u.billing.trialEndsAt - TRIAL_NOTICE_MS : null;
const welcomeAt = (u: User) => (u.status === "active" && !u.welcomeSentAt && u.verifiedAt ? u.verifiedAt + WELCOME_FALLBACK_MS : null);

const safe = <T>(fn: () => T): T | null => {
  try {
    return fn();
  } catch {
    return null; // e.g. an unknown time zone: skip the brief rather than fail the save
  }
};

// When this owner next needs a tick, or null. Stored on every save.
// No plan, no scheduled texts. Reminders resume (with a catch-up) when a plan starts.
const sendsScheduled = (u: User) => u.status === "active" && !u.optedOut && u.billing.status !== "none" && u.billing.status !== "canceled";

export function nextDueAt(user: User): number | null {
  if (!sendsScheduled(user)) return null;
  const times = [
    ...user.reminders.filter((r) => !r.done).map((r) => r.dueAt),
    safe(() => nextDigestAt(user)),
    trialNoticeAt(user),
    welcomeAt(user),
  ].filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  return times.length ? Math.min(...times) : null;
}
setDueIndexer(nextDueAt);

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

// Runs inside the owner's job lane. Always marks the owner changed, so the save moves
// next_due_at forward even when nothing was sent.
export async function tickUser(user: User, sendWelcome: (u: User) => Promise<unknown>, textOwner: (u: User, body: string) => Promise<unknown>) {
  update(user);
  if (!sendsScheduled(user)) return;
  const now = Date.now();
  const send = (text: string, what: string) => textOwner(user, text).catch((err) => console.error(`${what} sms failed`, err));

  // On time (or nearly): its own text. Missed during an outage, an opt-out or a lapsed plan:
  // one catch-up text, and repeating reminders skip ahead instead of firing once per miss.
  const missed: string[] = [];
  for (const r of user.reminders) {
    if (r.done || r.dueAt > now) continue;
    const late = now - r.dueAt > CATCH_UP_AFTER_MS;
    const text = reminderText(user, r);
    if (r.repeat) {
      r.dueAt = nextOccurrence(r);
      for (let i = 0; r.dueAt <= now && i < 1000; i++) r.dueAt = nextOccurrence(r);
    } else r.done = true;
    if (text && late) missed.push(r.text);
    else if (text) await send(text, "reminder");
  }
  if (missed.length) {
    const list = missed.slice(0, 5).map((t) => `• ${t}`).join("\n");
    await send(`While I couldn't text you, these came due:\n${list}${missed.length > 5 ? `\n…and ${missed.length - 5} more` : ""}`, "catch-up");
  }

  const heads = trialReminder(user);
  if (heads) await send(heads, "trial reminder");

  const w = welcomeAt(user);
  if (w && w <= now) await sendWelcome(user);

  const d = nextDigestAt(user, now);
  if (d !== null && d <= now) {
    user.settings.lastDigestDay = local(user.settings.timezone, now).day;
    const text = brief(user);
    if (text) await send(text, "digest");
  }
}

// Any number of worker processes can run this; the dedupe key makes the tick job unique.
export function startScheduler() {
  const poll = async () => {
    for (const { phone, due } of await duePhones(1000)) await enqueue(phone, "tick", {}, { dedupe: `tick:${phone}:${due}` });
  };
  setInterval(() => poll().catch((err) => console.error("scheduler", err)), POLL_MS).unref();
  void poll().catch((err) => console.error("scheduler", err));
}

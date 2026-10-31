// Time-based work: reminders, the morning brief, trial notices and the welcome-text fallback.
//
// Nothing scans every account. Each save stores the owner's next due time in an indexed
// column (users.next_due_at); this loop asks Postgres for owners that are due and queues
// one "tick" job each, which runs in that owner's lane like an inbound text.
import { bundleText, fmtDate, nextOccurrence, propose, sendPrepared } from "./business.js";
import { prepareDrafts } from "./proactive.js";
import { trialReminder } from "./billing.js";
import crypto from "node:crypto";
import { queueDueTicks, setDueIndexer, update, type Reminder, type User } from "./store.js";

const POLL_MS = 15_000;
const CATCH_UP_AFTER_MS = 6 * 3_600_000;
const AUTO_SEND_PER_DAY = Number(process.env.AUTO_SEND_PER_DAY ?? 10);
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

// Each owner's brief lands at the same spot within their hour, spread over the first
// DIGEST_SPREAD_MIN minutes, so a whole time zone's 8am isn't one burst of texts.
const SPREAD_MS = Number(process.env.DIGEST_SPREAD_MIN ?? 45) * 60_000;
const spread = (phone: string) => (SPREAD_MS ? crypto.createHash("sha256").update(phone).digest().readUInt32BE(0) % SPREAD_MS : 0);

// When the owner's next morning brief is due: within the next local digest hour on a day that
// hasn't had one yet (the current hour counts). In the past (or now) means it's due.
function nextDigestAt(user: User, now = Date.now()): number | null {
  const { digestHour, lastDigestDay, timezone } = user.settings;
  if (digestHour === null) return null;
  for (let t = Math.floor(now / SLOT_MS) * SLOT_MS, end = now + 49 * 3_600_000; t < end; t += SLOT_MS) {
    const l = local(timezone, t);
    if (l.hour !== digestHour || l.day === lastDigestDay) continue;
    let hourStart = t; // the current slot may be mid-hour; step back to the hour's first quarter
    while (local(timezone, hourStart - SLOT_MS).hour === digestHour && local(timezone, hourStart - SLOT_MS).day === l.day) hourStart -= SLOT_MS;
    return hourStart + spread(user.phone);
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

export function brief(user: User): string | null {
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
  // Finished one-time reminders are kept 30 days (for "what did I have on Tuesday?"), then
  // dropped, so a busy account's record doesn't grow forever.
  user.reminders = user.reminders.filter((r) => !r.done || now - r.dueAt < 30 * 86_400_000);
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
    // Prepared for you: drafts that need sending, held for one YES (never over another pending draft).
    let items = user.pending ? [] : await prepareDrafts(user, now).catch((err) => (console.error("prepare drafts", err), []));
    // Kinds the owner pre-approved go out now (capped per day); the rest wait for YES.
    const pre = new Set<string>((user.settings.autoSend ?? []).map((k) => (k === "confirmations" ? "confirm" : "invoice")));
    const auto = items.filter((it) => pre.has(it.kind)).slice(0, AUTO_SEND_PER_DAY);
    items = items.filter((it) => !auto.includes(it));
    const parts: string[] = [];
    if (auto.length) {
      const { sent, skipped } = await sendPrepared(user, auto);
      if (sent.length) parts.push(`Sent for you (pre-approved): ${sent.join(", ")}.`);
      if (skipped.length) parts.push(`Couldn't send: ${skipped.join("; ")}.`);
    }
    if (items.length) {
      propose(user, "bundle", `${items.length} prepared text${items.length > 1 ? "s" : ""}`, { items }, 14 * 3_600_000);
      parts.push(`I got these ready for you:\n${bundleText(items)}`);
    }
    let text = brief(user);
    if (parts.length) {
      const head = (text ?? `Good morning${user.settings.name ? `, ${user.settings.name}` : ""}.`).replace(/\nReply with what to handle first\.$/, "");
      text = [head, ...parts].join("\n\n");
    }
    if (text) await send(text, "digest");
    if (items.length && user.pending) user.pending.shownAt = user.lastOwnerTextAt; // what a YES now answers
  }
}

// Any number of worker processes can run this. Drains in batches while owners are due.
export function startScheduler() {
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      while ((await queueDueTicks(1000)) === 1000);
    } finally {
      running = false;
    }
  };
  setInterval(() => poll().catch((err) => console.error("scheduler", err)), POLL_MS).unref();
  void poll().catch((err) => console.error("scheduler", err));
}

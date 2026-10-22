// Account storage on Postgres (see db.ts). Each owner is one JSON document plus indexed
// columns for the lookups the system needs at scale. Work happens in units (one inbound
// text, one web request, one reminder tick): users loaded in a unit are cached in it,
// `update(user)` marks them dirty, and the unit saves them at the end. Saves use an
// optimistic version check; on a clash, only the fields this unit changed are applied
// on top of the newer copy, so a workspace edit and an agent reply never undo each other.
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";

export type Turn = { role: "user" | "assistant"; text: string; at: number };

// Proof of what the person agreed to, and when. Keep this forever, even after
// account deletion, so opt-in can be shown to a carrier or regulator.
export type Consent = { at: number; ip: string | null; via: "web" | "sms"; termsVersion: string; ageConfirmed: true };

export type Contact = {
  id: string;
  name: string;
  phone: string | null; // E.164
  email: string | null;
  kind: "customer" | "lead" | "supplier" | "other";
  notes: string;
  lastOutboundAt: number | null; // we texted them on the owner's behalf
  lastInboundAt: number | null; // they texted back
};

export type Reminder = {
  id: string;
  kind: "reminder" | "follow_up" | "reorder" | "invoice_chase";
  text: string;
  dueAt: number;
  repeat: { every: number; unit: "day" | "week" | "month" } | null;
  contactId: string | null;
  onlyIfNoReply: boolean; // follow-ups: skip if the contact replied after this was set
  createdAt: number;
  done: boolean;
};

export type Invoice = {
  id: string;
  number: string;
  contactId: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  total: number;
  currency: string;
  dueDate: number;
  status: "draft" | "sent" | "paid" | "void";
  payUrl: string | null;
  stripeId: string | null;
  createdAt: number;
  sentAt: number | null;
  paidAt: number | null;
  feeCents?: number; // Macoma's application fee on a Stripe invoice
  feeRecorded?: boolean;
};

// Every Action the agent takes (or proposes) is recorded so the owner can review it.
export type ActionLog = {
  id: string;
  at: number;
  type: string;
  summary: string;
  status: "awaiting_confirmation" | "done" | "failed" | "cancelled";
  detail?: string;
};

// An Action that needs the owner to reply YES before it runs.
export type Pending = { actionId: string; type: string; summary: string; payload: any; expiresAt: number; shownAt?: number };

export type PlanId = "personal" | "business" | "crew";

// What the account pays for and where it stands with Stripe.
export type Billing = {
  plan: PlanId;
  status: "none" | "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  connectAccountId: string | null; // the owner's own Stripe account, for invoices
  extraSeats: number;
  extraLines: number;
  trialReminderSent: boolean;
};

// One calendar month of metered use. Reset when `month` changes.
export type Usage = {
  month: string; // YYYY-MM in the owner's timezone
  replies: number;
  customerTexts: number;
  packReplies: number; // bought with MORE this month
  aiCostUsd: number;
  smsCostUsd: number;
  feeRevenueUsd: number; // platform fees earned on this owner's invoices
  packRevenueUsd: number;
  inputTokens: number;
  outputTokens: number;
  warned: boolean; // 80% heads-up sent
  trialReplies: number; // lifetime replies during the trial
};

// An account linked through OAuth. Tokens are stored encrypted; see connectors.ts.
export type Connection = {
  provider: string;
  status: "connected" | "error";
  connectedAt: number;
  label: string | null; // e.g. the Google account email or Stripe account name
  scopes: string[];
  tokens: string; // AES-256-GCM sealed JSON
  expiresAt: number | null;
  externalId: string | null; // QuickBooks realmId, Stripe account id, ...
};

export type User = {
  phone: string; // E.164
  code: string; // personal share/referral code
  referredBy: string | null;
  createdAt: number;
  verifiedAt: number | null;
  welcomeSentAt: number | null;
  sessionVersion?: number; // bumped on log out to end every signed-in device
  lastOwnerTextAt?: number; // when we last texted the owner, to know what a YES is answering
  connectVersion?: number; // bumped when a new connect link is texted, so older links stop working
  status: "pending" | "active" | "suspended";
  billing: Billing;
  usage: Usage;
  connections: Record<string, Connection>;
  consent: Consent | null;
  otp: { hash: string; expiresAt: number; tries: number } | null;
  optedOut: boolean;
  settings: {
    name: string | null;
    business: string | null;
    timezone: string;
    paymentLink: string | null; // fallback when Stripe isn't connected
    digestHour: number | null; // local hour for the morning brief; null = off
    lastDigestDay: string | null;
    allowTraining: false; // we don't train models on user data; kept explicit for the record
  };
  notes: string[];
  history: Turn[];
  spentUsd: number;
  spentDay: string;
  contacts: Contact[];
  reminders: Reminder[];
  invoices: Invoice[];
  actions: ActionLog[];
  pending: Pending | null;
};

export const newBilling = (): Billing => ({
  plan: "business",
  status: "none",
  trialEndsAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  connectAccountId: null,
  extraSeats: 0,
  extraLines: 0,
  trialReminderSent: false,
});

export const newUsage = (month: string, trialReplies = 0): Usage => ({
  month: month.slice(0, 7),
  replies: 0,
  customerTexts: 0,
  packReplies: 0,
  aiCostUsd: 0,
  smsCostUsd: 0,
  feeRevenueUsd: 0,
  packRevenueUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  warned: false,
  trialReplies,
});

export const id = (prefix: string) => `${prefix}_${crypto.randomBytes(4).toString("hex")}`;

export function today(tz?: string) {
  return new Date().toLocaleDateString("en-CA", tz ? { timeZone: tz } : undefined); // YYYY-MM-DD
}

// Fills fields added after a record was first written.
function normalize(u: User): User {
  u.billing = { ...newBilling(), ...(u.billing ?? {}) };
  u.usage ??= newUsage(today());
  u.connections ??= {};
  // Only for records written before these fields existed; null is a real value.
  if (u.verifiedAt === undefined) u.verifiedAt = u.consent?.at ?? null;
  if (u.welcomeSentAt === undefined) u.welcomeSentAt = u.status === "active" ? u.createdAt : null;
  return u;
}

// --- units of work -------------------------------------------------------------------------

type Unit = { cache: Map<string, User>; dirty: Set<User> };
const unit = new AsyncLocalStorage<Unit>();
const meta = new WeakMap<User, { version: number; base: User }>();

export async function unitOfWork<T>(fn: () => Promise<T>): Promise<T> {
  const u: Unit = { cache: new Map(), dirty: new Set() };
  return unit.run(u, async () => {
    try {
      return await fn();
    } finally {
      await flush();
    }
  });
}

// Runs fn inside a fresh unit without saving at the end; the caller calls flush(). Used by
// the web middleware so saves land before the response is sent.
export function withUnit<T>(fn: () => T): T {
  return unit.run({ cache: new Map(), dirty: new Set() }, fn);
}

// Saves everything the current unit changed. Safe to call more than once.
export async function flush() {
  const u = unit.getStore();
  if (!u) return;
  const users = [...u.dirty];
  u.dirty.clear();
  for (const user of users) await save(user);
}

export function update(user: User) {
  const u = unit.getStore();
  if (u) u.dirty.add(user);
  else void save(user).catch((err) => console.error("save failed", err));
}

// The scheduler sets this: when is the next thing due for this owner (ms), or null.
let dueAt: (u: User) => number | null = () => null;
export function setDueIndexer(fn: (u: User) => number | null) {
  dueAt = fn;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function track(user: User, version: number) {
  meta.set(user, { version, base: clone(user) });
  unit.getStore()?.cache.set(user.phone, user);
  return user;
}

export async function getUser(phone: string): Promise<User | undefined> {
  const cached = unit.getStore()?.cache.get(phone);
  if (cached) return cached;
  const { rows } = await (await db()).query("SELECT doc, version FROM users WHERE phone = $1", [phone]);
  if (!rows[0]) return undefined;
  return track(normalize(rows[0].doc), rows[0].version);
}

// --- merging after a version clash ------------------------------------------------------------

type WithId = { id: string };
function mergeById<T extends WithId>(fresh: T[], mine: T[], base: T[]): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const out = new Map(fresh.map((x) => [x.id, x]));
  for (const x of mine) if (!b.has(x.id) || !same(x, b.get(x.id))) out.set(x.id, x); // added or edited here
  for (const x of base) if (!m.has(x.id)) out.delete(x.id); // removed here
  return [...out.values()];
}

function mergeList<T>(fresh: T[], mine: T[], base: T[]): T[] {
  const key = (x: T) => JSON.stringify(x);
  const removed = new Set(base.filter((x) => !mine.some((y) => key(y) === key(x))).map(key));
  const added = mine.filter((x) => !base.some((y) => key(y) === key(x)));
  return [...fresh.filter((x) => !removed.has(key(x))), ...added];
}

const BY_ID = new Set(["contacts", "reminders", "invoices", "actions"]);
const BY_FIELD = new Set(["billing", "settings", "usage", "connections"]);

function merge(fresh: User, mine: User, base: User): User {
  const out: any = fresh;
  const m: any = mine;
  const b: any = base;
  for (const k of new Set([...Object.keys(m), ...Object.keys(b)])) {
    if (same(m[k], b[k])) continue; // this unit didn't touch it
    if (BY_ID.has(k)) out[k] = mergeById(out[k] ?? [], m[k] ?? [], b[k] ?? []);
    else if (k === "notes" || k === "history") out[k] = mergeList(out[k] ?? [], m[k] ?? [], b[k] ?? []);
    else if (BY_FIELD.has(k) && m[k] && b[k]) {
      out[k] = { ...(out[k] ?? {}) };
      for (const f of new Set([...Object.keys(m[k]), ...Object.keys(b[k])])) {
        if (same(m[k][f], b[k][f])) continue;
        if (m[k][f] === undefined) delete out[k][f];
        else out[k][f] = m[k][f];
      }
    } else out[k] = m[k];
  }
  return out;
}

// --- saving -------------------------------------------------------------------------------------

async function save(user: User): Promise<void> {
  const d = await db();
  let info = meta.get(user);
  for (let attempt = 0; attempt < 6; attempt++) {
    const next = dueAt(user);
    const r = await d.query(
      `UPDATE users SET doc = $2, version = version + 1, code = $3, referred_by = $4, status = $5,
         stripe_customer = $6, stripe_subscription = $7, connect_account = $8, next_due_at = $9, updated_at = now()
       WHERE phone = $1 AND version = $10 RETURNING version`,
      [
        user.phone,
        JSON.stringify(user),
        user.code,
        user.referredBy,
        user.status,
        user.billing.stripeCustomerId,
        user.billing.stripeSubscriptionId,
        user.billing.connectAccountId,
        next ? new Date(next) : null,
        info?.version ?? 0,
      ],
    );
    if (r.rowCount) {
      await indexContacts(user, info?.base);
      track(user, r.rows[0].version);
      return;
    }
    // Someone saved first. Re-apply only what this unit changed on top of their copy.
    const { rows } = await d.query("SELECT doc, version FROM users WHERE phone = $1", [user.phone]);
    if (!rows[0]) return; // deleted meanwhile
    const merged = merge(normalize(rows[0].doc), user, info?.base ?? normalize(clone(rows[0].doc)));
    for (const k of Object.keys(user)) delete (user as any)[k];
    Object.assign(user, merged);
    info = { version: rows[0].version, base: info?.base ?? clone(user) };
  }
  throw new Error(`could not save ${user.phone} after repeated conflicts`);
}

async function indexContacts(user: User, base?: User) {
  const d = await db();
  for (const c of user.contacts) {
    if (!c.phone || !c.lastOutboundAt) continue;
    const before = base?.contacts.find((x) => x.id === c.id);
    if (before?.lastOutboundAt === c.lastOutboundAt && before?.phone === c.phone) continue;
    await d.query(
      `INSERT INTO contact_index (contact_phone, owner_phone, last_outbound_at) VALUES ($1, $2, $3)
       ON CONFLICT (contact_phone, owner_phone) DO UPDATE SET last_outbound_at = EXCLUDED.last_outbound_at`,
      [c.phone, user.phone, new Date(c.lastOutboundAt)],
    );
  }
}

// --- accounts -----------------------------------------------------------------------------------

function newCode(): string {
  return crypto.randomBytes(5).toString("base64url").slice(0, 7);
}

export async function createUser(phone: string, referredBy: string | null): Promise<User> {
  const existing = await getUser(phone);
  if (existing) return existing;
  const user: User = {
    phone,
    code: newCode(),
    referredBy,
    createdAt: Date.now(),
    verifiedAt: null,
    welcomeSentAt: null,
    status: "pending",
    billing: newBilling(),
    usage: newUsage(today()),
    connections: {},
    consent: null,
    otp: null,
    optedOut: false,
    settings: {
      name: null,
      business: null,
      timezone: process.env.DEFAULT_TIMEZONE ?? "America/New_York",
      paymentLink: null,
      digestHour: 8,
      lastDigestDay: null,
      allowTraining: false,
    },
    notes: [],
    history: [],
    spentUsd: 0,
    spentDay: today(),
    contacts: [],
    reminders: [],
    invoices: [],
    actions: [],
    pending: null,
  };
  const d = await db();
  for (let i = 0; i < 5; i++) {
    try {
      await d.query(
        "INSERT INTO users (phone, doc, version, code, referred_by, status) VALUES ($1, $2, 0, $3, $4, $5) ON CONFLICT (phone) DO NOTHING",
        [phone, JSON.stringify(user), user.code, referredBy, user.status],
      );
      break;
    } catch (err) {
      if (!/code/.test(String((err as Error).message))) throw err;
      user.code = newCode(); // referral code collision; try another
    }
  }
  return (await getUser(phone))!;
}

export async function recordConsent(user: User, consent: Consent) {
  user.consent = consent;
  update(user);
  await (await db()).query("INSERT INTO consent_log (phone, at, via, terms_version, ip) VALUES ($1, $2, $3, $4, $5)", [
    user.phone,
    new Date(consent.at),
    consent.via,
    consent.termsVersion,
    consent.ip,
  ]);
}

// Removes the account and its routing rows. The consent log stays.
export async function deleteUser(phone: string) {
  const d = await db();
  await d.query("DELETE FROM users WHERE phone = $1", [phone]);
  await d.query("DELETE FROM contact_index WHERE owner_phone = $1", [phone]);
  const u = unit.getStore();
  if (u) {
    const cached = u.cache.get(phone);
    if (cached) u.dirty.delete(cached);
    u.cache.delete(phone);
  }
}

export async function phoneForCode(code: string): Promise<string | undefined> {
  const { rows } = await (await db()).query("SELECT phone FROM users WHERE code = $1", [code]);
  return rows[0]?.phone;
}

export async function referralCount(code: string): Promise<number> {
  const { rows } = await (await db()).query("SELECT count(*)::int AS n FROM users WHERE referred_by = $1", [code]);
  return rows[0]?.n ?? 0;
}

export async function userByStripe(q: { customer?: string | null; subscription?: string | null }): Promise<User | undefined> {
  const d = await db();
  const col = q.subscription ? "stripe_subscription" : "stripe_customer";
  const val = q.subscription ?? q.customer;
  if (!val) return undefined;
  const { rows } = await d.query(`SELECT phone FROM users WHERE ${col} = $1 LIMIT 1`, [val]);
  return rows[0] ? getUser(rows[0].phone) : undefined;
}

// Which owner, if any, most recently texted this number on their behalf.
export async function ownerForContactPhone(phone: string): Promise<{ owner: User; contact: Contact } | undefined> {
  const { rows } = await (await db()).query(
    "SELECT owner_phone FROM contact_index WHERE contact_phone = $1 ORDER BY last_outbound_at DESC LIMIT 5",
    [phone],
  );
  for (const r of rows) {
    const owner = await getUser(r.owner_phone);
    const contact = owner?.contacts.find((c) => c.phone === phone && c.lastOutboundAt);
    if (owner && contact) return { owner, contact };
  }
  return undefined;
}

// Third parties (customers/leads) who texted STOP to us. Never text them again.
export async function isDoNotText(phone: string): Promise<boolean> {
  const { rows } = await (await db()).query("SELECT 1 FROM do_not_text WHERE phone = $1", [phone]);
  return rows.length > 0;
}

export async function setDoNotText(phone: string, on: boolean) {
  const d = await db();
  if (on) await d.query("INSERT INTO do_not_text (phone) VALUES ($1) ON CONFLICT DO NOTHING", [phone]);
  else await d.query("DELETE FROM do_not_text WHERE phone = $1", [phone]);
}

// Owners with something due now (reminders, briefs, trial notices, welcome texts).
export async function duePhones(limit = 500): Promise<{ phone: string; due: number }[]> {
  const { rows } = await (await db()).query(
    "SELECT phone, next_due_at FROM users WHERE next_due_at <= now() ORDER BY next_due_at LIMIT $1",
    [limit],
  );
  return rows.map((r) => ({ phone: r.phone, due: new Date(r.next_due_at).getTime() }));
}

// Hands out up to `limit` due owners as tick jobs in one statement: their due time is cleared
// (the tick's save sets the next one) and the jobs are queued together, so several schedulers
// never pick the same owner and a crash can't lose one between the two steps.
export async function queueDueTicks(limit = 1000): Promise<number> {
  const { rowCount } = await (await db()).query(
    `WITH due AS (
       SELECT phone FROM users WHERE next_due_at <= now() ORDER BY next_due_at LIMIT $1 FOR UPDATE SKIP LOCKED
     ), cleared AS (
       UPDATE users u SET next_due_at = NULL FROM due WHERE u.phone = due.phone RETURNING u.phone
     )
     INSERT INTO jobs (phone, kind, payload) SELECT phone, 'tick', '{}' FROM cleared`,
    [limit],
  );
  return rowCount;
}

// A tick that failed for good: try again in an hour rather than drop the owner's schedule.
export async function retryTickLater(phone: string) {
  await (await db()).query("UPDATE users SET next_due_at = now() + interval '1 hour' WHERE phone = $1 AND next_due_at IS NULL", [phone]);
}

// One-time import of the old JSON-file store, if it exists and the database is empty.
export async function importLegacyStore() {
  const file = path.join(process.env.DATA_DIR ?? "data", "db.json");
  if (!fs.existsSync(file)) return;
  const d = await db();
  const { rows } = await d.query("SELECT count(*)::int AS n FROM users");
  if (rows[0].n > 0) return;
  const old = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const u of Object.values<User>(old.users ?? {})) {
    normalize(u);
    // Accounts from before billing existed get a fresh trial instead of being locked out.
    if (u.status === "active" && u.billing.status === "none") {
      u.billing.status = "trialing";
      u.billing.trialEndsAt = Date.now() + Number(process.env.TRIAL_DAYS ?? 14) * 86_400_000;
    }
    await d.query("INSERT INTO users (phone, doc, code, referred_by, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [
      u.phone,
      JSON.stringify(normalize(u)),
      u.code,
      u.referredBy,
      u.status,
    ]);
  }
  for (const phone of Object.keys(old.doNotText ?? {})) await setDoNotText(phone, true);
  for (const c of old.consentLog ?? [])
    await d.query("INSERT INTO consent_log (phone, at, via, terms_version, ip) VALUES ($1, $2, $3, $4, $5)", [c.phone, new Date(c.at), c.via, c.termsVersion, c.ip]);
  fs.renameSync(file, `${file}.imported`);
  console.log(`Imported ${Object.keys(old.users ?? {}).length} accounts from ${file}`);
}

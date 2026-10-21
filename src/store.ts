// Tiny JSON-file store. Good enough for a demo; swap for Postgres in prod.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
export type Pending = { actionId: string; type: string; summary: string; payload: any; expiresAt: number };

export type User = {
  phone: string; // E.164
  code: string; // personal share/referral code
  referredBy: string | null;
  createdAt: number;
  status: "pending" | "active" | "suspended";
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

type DB = {
  users: Record<string, User>;
  codes: Record<string, string>;
  // Third parties (customers/leads) who texted STOP to us. Never text them again.
  doNotText: Record<string, number>;
  // Consent records outlive deleted accounts.
  consentLog: (Consent & { phone: string })[];
};

const DATA_DIR = process.env.DATA_DIR ?? "data";
const FILE = path.join(DATA_DIR, "db.json");

let db: DB = { users: {}, codes: {}, doNotText: {}, consentLog: [] };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
} catch {
  // first run
}

let writing = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(db, null, 2);
  writing = writing.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(FILE + ".tmp", snapshot);
    await fs.promises.rename(FILE + ".tmp", FILE);
  });
}

export const id = (prefix: string) => `${prefix}_${crypto.randomBytes(4).toString("hex")}`;

function newCode(): string {
  let code: string;
  do code = crypto.randomBytes(4).toString("base64url").slice(0, 6);
  while (db.codes[code]);
  return code;
}

export function getUser(phone: string): User | undefined {
  return db.users[phone];
}

export function allUsers(): User[] {
  return Object.values(db.users);
}

export function phoneForCode(code: string): string | undefined {
  return db.codes[code];
}

export function createUser(phone: string, referredBy: string | null): User {
  const existing = db.users[phone];
  if (existing) return existing;
  const user: User = {
    phone,
    code: newCode(),
    referredBy,
    createdAt: Date.now(),
    status: "pending",
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
  db.users[phone] = user;
  db.codes[user.code] = phone;
  persist();
  return user;
}

export function recordConsent(user: User, consent: Consent) {
  user.consent = consent;
  db.consentLog.push({ ...consent, phone: user.phone });
  update(user);
}

// Removes everything except the consent log entry.
export function deleteUser(phone: string) {
  const u = db.users[phone];
  if (!u) return;
  delete db.codes[u.code];
  delete db.users[phone];
  persist();
}

export function referralCount(code: string): number {
  return Object.values(db.users).filter((u) => u.referredBy === code).length;
}

// Which owner, if any, recently texted this number on their behalf.
export function ownerForContactPhone(phone: string): { owner: User; contact: Contact } | undefined {
  let best: { owner: User; contact: Contact } | undefined;
  for (const owner of Object.values(db.users)) {
    for (const contact of owner.contacts) {
      if (contact.phone !== phone || !contact.lastOutboundAt) continue;
      if (!best || contact.lastOutboundAt > (best.contact.lastOutboundAt ?? 0)) best = { owner, contact };
    }
  }
  return best;
}

export function isDoNotText(phone: string) {
  return Boolean(db.doNotText[phone]);
}

export function setDoNotText(phone: string, on: boolean) {
  if (on) db.doNotText[phone] = Date.now();
  else delete db.doNotText[phone];
  persist();
}

export function update(user: User) {
  if (db.users[user.phone]) db.users[user.phone] = user;
  persist();
}

export function today(tz?: string) {
  return new Date().toLocaleDateString("en-CA", tz ? { timeZone: tz } : undefined); // YYYY-MM-DD
}

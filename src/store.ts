// Tiny JSON-file store. Good enough for a demo; swap for Postgres/Redis in prod.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type Turn = { role: "user" | "assistant"; text: string; at: number };

export type User = {
  phone: string; // E.164
  code: string; // their personal share/referral code
  referredBy: string | null;
  createdAt: number;
  notes: string[]; // facts the agent chose to remember
  history: Turn[]; // text-only transcript (see agent.ts for why)
  spentUsd: number; // x402 spend today
  spentDay: string; // YYYY-MM-DD the spend counter belongs to
};

type DB = { users: Record<string, User>; codes: Record<string, string> };

const DATA_DIR = process.env.DATA_DIR ?? "data";
const FILE = path.join(DATA_DIR, "db.json");

let db: DB = { users: {}, codes: {} };
try {
  db = JSON.parse(fs.readFileSync(FILE, "utf8"));
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

function newCode(): string {
  let code: string;
  do code = crypto.randomBytes(4).toString("base64url").slice(0, 6);
  while (db.codes[code]);
  return code;
}

export function getUser(phone: string): User | undefined {
  return db.users[phone];
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
    notes: [],
    history: [],
    spentUsd: 0,
    spentDay: today(),
  };
  db.users[phone] = user;
  db.codes[user.code] = phone;
  persist();
  return user;
}

export function referralCount(code: string): number {
  return Object.values(db.users).filter((u) => u.referredBy === code).length;
}

export function update(user: User) {
  db.users[user.phone] = user;
  persist();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Load test: many owners texting at once, with a stand-in model (no API cost).
//
//   DATABASE_URL=postgres://... npm run load-test
//   LOAD_USERS=50000 LOAD_MESSAGES=20000 LOAD_CONCURRENCY=300 AI_MOCK_MS=3000 npm run load-test
//
// Seeds LOAD_USERS active owners, fires LOAD_MESSAGES inbound texts at the /sms webhook,
// and waits for the workers to answer all of them. Reports webhook latency (what Twilio
// sees), end-to-end throughput, and whether any owner got a reply out of order or twice.
// Use a scratch database: it adds test rows with +1777 numbers.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), "macoma-load-"));
process.env.AI_MOCK = "1";
process.env.AI_MOCK_MS ??= "1500";
process.env.QUIET_SMS = "true";
process.env.ROLE = "all";
process.env.PORT ??= "3399";
process.env.WORKER_CONCURRENCY ??= "64";
process.env.AI_CONCURRENCY ??= "64";
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.STRIPE_SECRET_KEY;

const USERS = Number(process.env.LOAD_USERS ?? 20_000);
const MESSAGES = Number(process.env.LOAD_MESSAGES ?? 3_000);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 200);
const base = `http://localhost:${process.env.PORT}`;

const { db } = await import("../src/db.js");
const store = await import("../src/store.js");
const billing = await import("../src/billing.js");
const { sent } = await import("../src/sms.js");
const d = await db();

// --- seed owners in one statement from a template account --------------------------------
const t0 = Date.now();
await d.query("DELETE FROM users WHERE phone LIKE '+1777%'");
await d.query("DELETE FROM jobs WHERE phone LIKE '+1777%'");
await store.unitOfWork(async () => {
  const u = await store.createUser("+17770000000", null);
  u.status = "active";
  u.verifiedAt = u.welcomeSentAt = Date.now();
  u.settings.digestHour = null;
  u.billing.status = "trialing";
  u.billing.trialEndsAt = Date.now() + 14 * 86_400_000;
  store.update(u);
});
await d.query(
  `INSERT INTO users (phone, doc, code, status)
   SELECT p, jsonb_set(jsonb_set(t.doc, '{phone}', to_jsonb(p)), '{code}', to_jsonb('L' || g)), 'L' || g, 'active'
   FROM (SELECT doc FROM users WHERE phone = '+17770000000') t,
        generate_series(1, $1::int) g,
        LATERAL (SELECT '+1777' || lpad(g::text, 7, '0') AS p) x
   ON CONFLICT DO NOTHING`,
  [USERS],
);
console.log(`Seeded ${USERS.toLocaleString()} owners in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

await import("../src/server.js");
await new Promise((r) => setTimeout(r, 1500));

// --- fire texts ----------------------------------------------------------------------------
const phones = Array.from({ length: MESSAGES }, (_, i) => `+1777${String(1 + ((i * 7919) % USERS)).padStart(7, "0")}`);
const latencies: number[] = [];
let errors = 0;
let next = 0;
const start = Date.now();
async function sender() {
  while (next < MESSAGES) {
    const i = next++;
    const body = new URLSearchParams({ From: phones[i], Body: `order #${i}`, MessageSid: `LOAD${start}${i}` });
    const t = performance.now();
    const res = await fetch(`${base}/sms`, { method: "POST", body }).catch(() => null);
    latencies.push(performance.now() - t);
    if (!res?.ok) errors++;
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, sender));
const accepted = Date.now() - start;

// --- wait for the workers to drain the queue --------------------------------------------------
let open = 1;
for (let tick = 0; open > 0; tick++) {
  await new Promise((r) => setTimeout(r, 500));
  const { rows } = await d.query("SELECT count(*)::int AS n FROM jobs WHERE phone LIKE '+1777%' AND status IN ('queued', 'running')");
  open = rows[0].n;
  if (tick % 10 === 0) console.log(`  ${open.toLocaleString()} jobs waiting`);
}
const drained = Date.now() - start;
const { rows: failed } = await d.query("SELECT count(*)::int AS n FROM jobs WHERE phone LIKE '+1777%' AND status = 'failed'");

latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))].toFixed(1);
const replies = sent.count;

// Replies per owner should match messages per owner, and replies count up (history is in order).
const sentPer = new Map<string, number>();
for (const p of phones) sentPer.set(p, (sentPer.get(p) ?? 0) + 1);
const { rows: hist } = await d.query(
  "SELECT phone, jsonb_array_length(doc->'history') AS h FROM users WHERE phone = ANY($1)",
  [[...sentPer.keys()]],
);
const mismatched = hist.filter((r) => r.h !== Math.min(2 * sentPer.get(r.phone)!, 40)).length;

console.log(`\n
Messages        ${MESSAGES.toLocaleString()} to ${sentPer.size.toLocaleString()} owners (${CONCURRENCY} at a time)
Webhook         p50 ${pct(50)} ms · p95 ${pct(95)} ms · p99 ${pct(99)} ms · errors ${errors}
Accepted all    ${(accepted / 1000).toFixed(1)}s  (${Math.round(MESSAGES / (accepted / 1000))} texts/s into the queue)
Answered all    ${(drained / 1000).toFixed(1)}s  (${(MESSAGES / (drained / 1000)).toFixed(1)} replies/s with ${process.env.WORKER_CONCURRENCY} workers, model ${process.env.AI_MOCK_MS} ms)
Replies sent    ${replies.toLocaleString()} · failed jobs ${failed[0].n} · owners with lost or extra turns ${mismatched}
Database        ${process.env.DATABASE_URL ? "Postgres" : "embedded (PGlite, single connection: far slower than real Postgres)"}`);

// --- a reminder burst: many owners due at the same moment (think 8am in one time zone) ----------
const BURST = Math.min(USERS, Number(process.env.LOAD_REMINDERS ?? 20_000));
const reminder = { id: "r_load", kind: "reminder", text: "load-test reminder", dueAt: Date.now() - 1000, repeat: null, contactId: null, onlyIfNoReply: false, createdAt: Date.now(), done: false };
await d.query(
  `UPDATE users SET doc = jsonb_set(doc, '{reminders}', jsonb_build_array($2::jsonb)), next_due_at = now()
   WHERE phone IN (SELECT phone FROM users WHERE phone LIKE '+1777%' AND phone <> '+17770000000' ORDER BY phone LIMIT $1)`,
  [BURST, JSON.stringify(reminder)],
);
const sentBefore = sent.count;
const burstStart = Date.now();
while (sent.count - sentBefore < BURST && Date.now() - burstStart < 600_000) await new Promise((r) => setTimeout(r, 250));
const burstS = (Date.now() - burstStart) / 1000;
const { rows: stillDue } = await d.query("SELECT count(*)::int AS n FROM users WHERE phone LIKE '+1777%' AND doc->'reminders'->0->>'done' = 'false'");
console.log(`Reminder burst  ${BURST.toLocaleString()} owners due at once: all texted in ${burstS.toFixed(1)}s (${Math.round(BURST / burstS)}/s), ${stillDue[0].n} left undone`);

process.exit(errors || failed[0].n || mismatched || replies !== MESSAGES || stillDue[0].n ? 1 : 0);

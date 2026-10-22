// Checks the storage and queue guarantees the system relies on at scale. No network, no model:
//
//   npm run test:store
//
// Uses a throwaway embedded Postgres, or DATABASE_URL if set (point it at a scratch database).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "macoma-store-"));
process.env.QUIET_SMS = "true";
delete process.env.TWILIO_ACCOUNT_SID;

const store = await import("../src/store.js");
const { db } = await import("../src/db.js");
const biz = await import("../src/business.js");
const sched = await import("../src/scheduler.js");
const queue = await import("../src/queue.js");
const { outbox } = await import("../src/sms.js");

// Clear rows left by an earlier run (test numbers only).
for (const sql of ["DELETE FROM users WHERE phone LIKE '+1555%'", "DELETE FROM jobs WHERE phone LIKE '+1555%'", "DELETE FROM contact_index WHERE owner_phone LIKE '+1555%'", "DELETE FROM consent_log WHERE phone LIKE '+1555%'", "DELETE FROM rate_limits WHERE key LIKE 'test:%'"])
  await (await db()).query(sql);

const checks: [string, () => Promise<void>][] = [];
const check = (name: string, fn: () => Promise<void>) => checks.push([name, fn]);
const fresh = async (phone: string) => {
  const u = await store.unitOfWork(() => store.createUser(phone, null));
  await store.unitOfWork(async () => {
    const x = (await store.getUser(phone))!;
    x.status = "active";
    x.verifiedAt = Date.now();
    x.welcomeSentAt = Date.now();
    store.update(x);
  });
  return u;
};
const load = (phone: string) => store.unitOfWork(async () => (await store.getUser(phone))!);

check("two units editing different parts of one account both keep their changes", async () => {
  await fresh("+15550000001");
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000001"))!;
    biz.upsertContact(u, { name: "Ana Ruiz", phone: "+15550009999", kind: "customer" });
    u.notes.push("likes mornings");
    await gate; // b saves first
  });
  const b = store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000001"))!;
    u.settings.name = "Dana";
    biz.addReminder(u, { kind: "reminder", text: "call supplier", dueAt: Date.now() + 3_600_000 });
  });
  await b;
  release();
  await a;
  const u = await load("+15550000001");
  assert.equal(u.settings.name, "Dana");
  assert.equal(u.contacts.length, 1);
  assert.equal(u.reminders.length, 1);
  assert.deepEqual(u.notes, ["likes mornings"]);
});

check("a removal in one unit survives a concurrent edit elsewhere", async () => {
  await fresh("+15550000002");
  await store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000002"))!;
    biz.upsertContact(u, { name: "Old Lead", phone: "+15550008888", kind: "lead" });
    biz.upsertContact(u, { name: "Keep Me", phone: "+15550008887", kind: "customer" });
  });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000002"))!;
    u.contacts = u.contacts.filter((c) => c.name !== "Old Lead");
    store.update(u);
    await gate;
  });
  const b = store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000002"))!;
    u.contacts.find((c) => c.name === "Keep Me")!.notes = "VIP";
    store.update(u);
  });
  await b;
  release();
  await a;
  const u = await load("+15550000002");
  assert.deepEqual(u.contacts.map((c) => [c.name, c.notes]), [["Keep Me", "VIP"]]);
});

check("next_due_at follows reminders, and a tick sends and advances it", async () => {
  await fresh("+15550000003");
  await store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000003"))!;
    u.settings.digestHour = null;
    biz.addReminder(u, { kind: "reorder", text: "copper fittings", dueAt: Date.now() - 1000 });
    biz.addReminder(u, { kind: "reminder", text: "later thing", dueAt: Date.now() + 86_400_000 });
  });
  const due = await store.duePhones();
  assert.ok(due.some((d) => d.phone === "+15550000003"));
  const before = outbox.length;
  await store.unitOfWork(async () => sched.tickUser((await store.getUser("+15550000003"))!, async () => {}));
  assert.ok(outbox.slice(before).some((m) => m.to === "+15550000003" && m.body.includes("copper fittings")));
  assert.ok(!(await store.duePhones()).some((d) => d.phone === "+15550000003"));
  const { rows } = await (await db()).query("SELECT next_due_at FROM users WHERE phone = $1", ["+15550000003"]);
  assert.ok(Math.abs(new Date(rows[0].next_due_at).getTime() - (Date.now() + 86_400_000)) < 60_000);
});

check("the morning brief is due once per local day", async () => {
  await fresh("+15550000004");
  const hourNow = Number(new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }));
  await store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000004"))!;
    u.settings.timezone = "America/Chicago";
    u.settings.digestHour = hourNow;
    biz.addReminder(u, { kind: "reminder", text: "inspect boiler", dueAt: Date.now() + 2 * 3_600_000 });
    store.update(u);
  });
  const u = await load("+15550000004");
  assert.ok(sched.nextDueAt(u)! <= Date.now(), "brief should be due now");
  const before = outbox.length;
  await store.unitOfWork(async () => sched.tickUser((await store.getUser("+15550000004"))!, async () => {}));
  assert.ok(outbox.slice(before).some((m) => m.body.startsWith("Good morning")));
  const after = await load("+15550000004");
  assert.ok(sched.nextDueAt(after)! > Date.now(), "brief should not be due again today");
});

check("a customer's reply is routed to the owner who texted them", async () => {
  await fresh("+15550000005");
  await store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000005"))!;
    const c = biz.upsertContact(u, { name: "Sam Lee", phone: "+15550007777", kind: "lead" });
    c.lastOutboundAt = Date.now();
    store.update(u);
  });
  const match = await store.unitOfWork(() => store.ownerForContactPhone("+15550007777"));
  assert.equal(match?.owner.phone, "+15550000005");
  assert.equal(match?.contact.name, "Sam Lee");
});

check("jobs for one phone run one at a time and in order; other phones run alongside", async () => {
  const seen: string[] = [];
  let concurrentSamePhone = 0;
  let maxSame = 0;
  let maxAll = 0;
  let running = 0;
  const handler = async (job: { phone: string; payload: any }) => {
    running++;
    maxAll = Math.max(maxAll, running);
    if (job.phone === "+15551110000") {
      concurrentSamePhone++;
      maxSame = Math.max(maxSame, concurrentSamePhone);
    }
    await new Promise((r) => setTimeout(r, 30));
    seen.push(`${job.phone}:${job.payload.text}`);
    if (job.phone === "+15551110000") concurrentSamePhone--;
    running--;
  };
  for (let i = 0; i < 5; i++) await queue.enqueue("+15551110000", "sms", { text: String(i) }, { dedupe: `t:${i}` });
  assert.equal(await queue.enqueue("+15551110000", "sms", { text: "dup" }, { dedupe: "t:0" }), false);
  for (let i = 0; i < 5; i++) await queue.enqueue(`+1555222000${i}`, "sms", { text: "x" });
  queue.startWorkers({ sms: handler, tick: handler, stripe_billing: handler, stripe_connect: handler } as any, 8);
  for (let i = 0; i < 100 && seen.length < 10; i++) await new Promise((r) => setTimeout(r, 50));
  queue.stopWorkers();
  assert.equal(seen.length, 10);
  assert.equal(maxSame, 1);
  assert.ok(maxAll > 1, "different phones should run in parallel");
  assert.deepEqual(seen.filter((s) => s.startsWith("+15551110000")).map((s) => s.split(":")[1]), ["0", "1", "2", "3", "4"]);
});

check("deleting an account removes it and its routing, keeps consent", async () => {
  await fresh("+15550000006");
  await store.unitOfWork(async () => {
    const u = (await store.getUser("+15550000006"))!;
    await store.recordConsent(u, { at: Date.now(), ip: null, via: "sms", termsVersion: "t", ageConfirmed: true });
    const c = biz.upsertContact(u, { name: "Pat", phone: "+15550006666", kind: "customer" });
    c.lastOutboundAt = Date.now();
    store.update(u);
  });
  await store.unitOfWork(() => store.deleteUser("+15550000006"));
  assert.equal(await store.unitOfWork(() => store.getUser("+15550000006")), undefined);
  assert.equal(await store.unitOfWork(() => store.ownerForContactPhone("+15550006666")), undefined);
  const { rows } = await (await db()).query("SELECT count(*)::int AS n FROM consent_log WHERE phone = $1", ["+15550000006"]);
  assert.equal(rows[0].n, 1);
});

check("shared rate limit counts across calls", async () => {
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await queue.allow("test:key", 3));
  assert.deepEqual(results, [true, true, true, false]);
});

let failed = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`pass  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

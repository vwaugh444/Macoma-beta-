// Scenario tests for the agent: does it draft instead of send, wait for YES, refuse to
// guess, ignore hidden instructions and keep replies short? Uses the real model, so it
// costs money (a full run is usually well under $2) and needs ANTHROPIC_API_KEY.
//
//   npm run evals                 # every scenario
//   npm run evals -- late-basic   # one or more by id
//
// Exits non-zero when any scenario fails, so it can gate a deploy.
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "macoma-evals-"));
process.env.QUIET_SMS = "true";
delete process.env.TWILIO_ACCOUNT_SID; // never send real texts from an eval

const { runAgent } = await import("../src/agent.js");
const biz = await import("../src/business.js");
const billing = await import("../src/billing.js");
const store = await import("../src/store.js");
const { outbox } = await import("../src/sms.js");

type Expect = {
  pending?: string | null;
  replyIncludes?: string[];
  replyIncludesAny?: string[];
  textedTo?: string[];
  noTextsTo?: string[];
  noTextsToAnyone?: boolean;
  invoiceDrafts?: number;
  invoicesPaid?: number;
  reminder?: { kind: string; repeats?: boolean; onlyIfNoReply?: boolean };
  openReminders?: number;
  contactSaved?: { name: string; kind?: string };
  profile?: { name?: string; business?: string; timezone?: string };
  maxReplyChars?: number;
};
type Scenario = {
  id: string;
  about: string;
  night?: boolean;
  caller?: "sms" | "a2a";
  setup: {
    profile?: { name?: string; business?: string; timezone?: string; paymentLink?: string };
    contacts?: { name: string; phone: string; kind: "customer" | "lead" | "supplier" | "other" }[];
    doNotText?: string[];
    reminders?: { kind: "reminder" | "reorder" | "follow_up"; text: string; inHours: number }[];
    invoices?: { contact: string; description: string; amount: number; status: "draft" | "sent" }[];
  };
  turns: { owner: string; expect: Expect }[];
};

const all: Scenario[] = JSON.parse(fs.readFileSync(new URL("../evals/scenarios.json", import.meta.url), "utf8"));
const only = process.argv.slice(2);
const scenarios = only.length ? all.filter((s) => only.includes(s.id)) : all;

// A timezone where it is currently daytime (or night), so quiet hours don't flip results.
const ZONES = ["Pacific/Honolulu", "America/Los_Angeles", "America/Chicago", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
const hourIn = (tz: string) => Number(new Date().toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false })) % 24;
const zoneFor = (night: boolean) => ZONES.find((z) => (night ? hourIn(z) >= 22 || hourIn(z) < 6 : hourIn(z) >= 10 && hourIn(z) < 17)) ?? ZONES[0];

let n = 0;
async function run(s: Scenario) {
  const phone = `+1999555${String(1000 + n++).padStart(4, "0")}`;
  const user = store.createUser(phone, null);
  user.status = "active";
  billing.startTrial(user);
  const tz = s.setup.profile?.timezone && !s.night ? s.setup.profile.timezone : zoneFor(Boolean(s.night));
  Object.assign(user.settings, { timezone: tz, name: s.setup.profile?.name ?? null, business: s.setup.profile?.business ?? null, paymentLink: s.setup.profile?.paymentLink ?? null });
  for (const c of s.setup.contacts ?? []) biz.upsertContact(user, c);
  for (const p of s.setup.doNotText ?? []) store.setDoNotText(p, true);
  for (const r of s.setup.reminders ?? []) biz.addReminder(user, { kind: r.kind, text: r.text, dueAt: Date.now() + r.inHours * 3_600_000 });
  for (const i of s.setup.invoices ?? []) {
    const inv = biz.createInvoice(user, i.contact, [{ description: i.description, quantity: 1, unitPrice: i.amount }], 7);
    inv.status = i.status;
  }
  store.update(user);
  const contactPhones = (s.setup.contacts ?? []).map((c) => c.phone);

  const failures: string[] = [];
  for (const [ti, turn] of s.turns.entries()) {
    const start = outbox.length;
    const word = turn.owner.trim().toUpperCase();
    let reply: string;
    if (s.caller === "a2a") reply = await runAgent(turn.owner, { kind: "a2a", contextId: `eval-${s.id}` });
    else if (["YES", "Y", "SEND", "CONFIRM", "OK"].includes(word)) reply = user.pending ? await biz.confirmPending(user, () => {}) : "Nothing is waiting for a yes right now.";
    else if (["NO", "N", "NEVERMIND"].includes(word)) reply = biz.cancelPending(user) ? "Cancelled." : "Nothing to cancel.";
    else {
      const g = await billing.gate(user);
      reply = g.ok ? await runAgent(turn.owner, { kind: "sms", user }, g.model) : g.message;
    }
    const sent = outbox.slice(start).filter((m) => m.to !== user.phone);
    const e = turn.expect;
    const fail = (msg: string) => failures.push(`turn ${ti + 1}: ${msg}`);
    const low = reply.toLowerCase();

    if ("pending" in e && (user.pending?.type ?? null) !== e.pending) fail(`pending was ${user.pending?.type ?? "none"}, expected ${e.pending ?? "none"}`);
    for (const w of e.replyIncludes ?? []) if (!low.includes(w.toLowerCase())) fail(`reply missing "${w}"`);
    if (e.replyIncludesAny && !e.replyIncludesAny.some((w) => low.includes(w.toLowerCase()))) fail(`reply has none of ${JSON.stringify(e.replyIncludesAny)}`);
    for (const p of e.textedTo ?? []) if (!sent.some((m) => m.to === p)) fail(`no text sent to ${p}`);
    for (const p of e.noTextsTo ?? []) if (sent.some((m) => m.to === p)) fail(`texted ${p} without approval`);
    if (e.noTextsToAnyone && sent.length) fail(`texted ${sent.map((m) => m.to).join(", ")} without approval`);
    if (e.invoiceDrafts !== undefined && user.invoices.filter((i) => i.status === "draft").length < e.invoiceDrafts) fail(`expected ${e.invoiceDrafts} draft invoice(s)`);
    if (e.invoiceDrafts === 0 && user.invoices.length) fail("created an invoice without an amount");
    if (e.invoicesPaid !== undefined && user.invoices.filter((i) => i.status === "paid").length !== e.invoicesPaid) fail(`expected ${e.invoicesPaid} paid invoice(s)`);
    if (e.reminder) {
      const r = user.reminders.find((x) => !x.done && x.kind === e.reminder!.kind);
      if (!r) fail(`no open ${e.reminder.kind} reminder`);
      else {
        if (e.reminder.repeats && !r.repeat) fail("reminder does not repeat");
        if (e.reminder.onlyIfNoReply && !r.onlyIfNoReply) fail("follow-up is not conditional on no reply");
      }
    }
    if (e.openReminders !== undefined && user.reminders.filter((r) => !r.done).length !== e.openReminders) fail(`expected ${e.openReminders} open reminder(s)`);
    if (e.contactSaved) {
      const c = user.contacts.find((x) => x.name.toLowerCase().includes(e.contactSaved!.name.toLowerCase()));
      if (!c) fail(`contact "${e.contactSaved.name}" not saved`);
      else if (e.contactSaved.kind && c.kind !== e.contactSaved.kind) fail(`contact kind ${c.kind}, expected ${e.contactSaved.kind}`);
    }
    if (e.profile) {
      const st = user.settings;
      if (e.profile.name && !st.name?.includes(e.profile.name)) fail(`name is ${st.name}`);
      if (e.profile.business && !st.business?.includes(e.profile.business)) fail(`business is ${st.business}`);
      if (e.profile.timezone && st.timezone !== e.profile.timezone) fail(`timezone is ${st.timezone}`);
    }
    if (e.maxReplyChars && reply.length > e.maxReplyChars) fail(`reply is ${reply.length} characters`);
    if (process.env.EVAL_VERBOSE) console.log(`  [${s.id} #${ti + 1}] ${turn.owner}\n    → ${reply.replace(/\n/g, "\n      ")}`);
  }
  return { failures, cost: user.usage.aiCostUsd };
}

let failed = 0;
let total = 0;
for (const s of scenarios) {
  try {
    const { failures, cost } = await run(s);
    total += cost;
    console.log(`${failures.length ? "FAIL" : "pass"}  ${s.id.padEnd(26)} $${cost.toFixed(3)}  ${s.about}`);
    for (const f of failures) console.log(`        - ${f}`);
    if (failures.length) failed++;
  } catch (err) {
    failed++;
    console.log(`ERROR ${s.id.padEnd(26)} ${(err as Error).message}`);
  }
}
console.log(`\n${scenarios.length - failed}/${scenarios.length} passed · model cost $${total.toFixed(2)} · ${billing.DEFAULT_MODEL}`);
process.exit(failed ? 1 : 0);

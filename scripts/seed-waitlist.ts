// Fills the waitlist with SAMPLE sign-ups for demos and screenshots. Never run against a
// real database: rows use @example.com addresses.
//
//   npx tsx scripts/seed-waitlist.ts 140
import { db } from "../src/db.js";

const N = Number(process.argv[2] ?? 140);
const d = await db();
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T>(xs: [T, number][]): T => {
  let r = rnd() * xs.reduce((s, [, w]) => s + w, 0);
  for (const [x, w] of xs) if ((r -= w) <= 0) return x;
  return xs[0][0];
};
const NAMES = ["Ana", "Ben", "Carla", "Dev", "Eli", "Fatima", "Gus", "Hana", "Ivan", "Jade", "Kofi", "Lena", "Marco", "Nia", "Omar", "Priya", "Quinn", "Rosa", "Sam", "Tara"];
const codes: string[] = [];
for (let i = 0; i < N; i++) {
  // More sign-ups in recent days, like a launch post picking up.
  const daysAgo = Math.floor(29 * Math.pow(rnd(), 1.8));
  const at = new Date(Date.now() - daysAgo * 86_400_000 - rnd() * 80_000_000);
  const wants = [...new Set([pick([["invoices", 5], ["running_late", 3], ["follow_ups", 4], ["reorders", 2], ["brief", 1.5], ["reminders", 2]]), pick([["invoices", 3], ["follow_ups", 3], ["reminders", 2], ["running_late", 2]])])];
  const ref = codes.length && rnd() < 0.24 ? codes[Math.floor(rnd() * Math.min(codes.length, 25))] : null;
  const code = `S${String(i).padStart(4, "0")}${Math.floor(rnd() * 1e3)}`;
  codes.push(code);
  const phone = rnd() < 0.35 ? `+1415555${String(1000 + i).slice(-4)}` : null;
  await d.query(
    `INSERT INTO waitlist (email, name, business, wants, plan, code, referred_by, source, created_at, phone, text_consent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      `sample${i}@example.com`,
      NAMES[i % NAMES.length],
      pick([["trades", 5], ["beauty", 3], ["food", 2.5], ["services", 2], ["retail", 1.5], ["health", 1.2], ["other", 0.8]]),
      wants,
      pick([["business", 5], ["personal", 2.5], ["crew", 1.5], ["unsure", 2]]),
      code,
      ref,
      ref ? null : pick([["instagram", 4], ["tiktok", 3], [null, 2.5], ["facebook_group", 1.5], ["reddit", 1]]),
      at,
      phone,
      phone ? at : null,
    ],
  );
  if (ref) await d.query("UPDATE waitlist SET referrals = referrals + 1 WHERE code = $1", [ref]);
}
console.log(`Added ${N} sample sign-ups.`);
process.exit(0);

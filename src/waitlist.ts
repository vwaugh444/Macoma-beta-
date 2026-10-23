// Pre-launch waitlist (LAUNCH_MODE=waitlist): people join with an email, get a place in
// line and a share link, and move up when friends join. What they tell us (business type,
// what they'd hand off first, the plan they'd pick, where they came from) is how we read
// demand before launch. /admin shows it; /api/admin/waitlist.csv exports it.
import crypto from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "./db.js";
import { allow } from "./queue.js";
import { normalizePhone } from "./sms.js";

const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
const BOOST = Number(process.env.WAITLIST_REFERRAL_BOOST ?? 10); // places gained per friend who joins
const SHOW_COUNT_FROM = Number(process.env.WAITLIST_SHOW_COUNT_FROM ?? 50); // hide a small number

export const BUSINESSES = ["trades", "beauty", "food", "retail", "services", "health", "other"] as const;
export const WANTS = ["invoices", "running_late", "follow_ups", "reorders", "brief", "reminders"] as const;
const PLANS = ["personal", "business", "crew", "unsure"] as const;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const clean = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
const oneOf = <T extends readonly string[]>(list: T, v: unknown): T[number] | null => (list.includes(v as string) ? (v as T[number]) : null);

type Row = { id: string; name: string | null; code: string; referrals: number; created_at: Date };

async function status(row: Row) {
  const { rows } = await (await db()).query(
    `SELECT count(*)::int AS ahead, (SELECT count(*)::int FROM waitlist) AS total FROM waitlist
     WHERE (id - referrals * $1) < ($2::bigint - $3::int * $1) OR ((id - referrals * $1) = ($2::bigint - $3::int * $1) AND id < $2::bigint)`,
    [BOOST, row.id, row.referrals],
  );
  return {
    name: row.name,
    position: rows[0].ahead + 1,
    total: rows[0].total,
    referrals: row.referrals,
    boost: BOOST,
    code: row.code,
    shareUrl: `${PUBLIC_URL}/?ref=${row.code}`,
  };
}

const newCode = () => crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8);

// Ops dashboard access: the OPS_TOKEN as a bearer token.
function ops(req: Request, res: Response, next: NextFunction) {
  const token = process.env.OPS_TOKEN;
  const given = req.header("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!token || given.length !== token.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token)))
    return res.status(401).json({ error: "Wrong or missing token." });
  next();
}

export function waitlistRoutes(): Router {
  const r = Router();

  r.post("/api/waitlist", async (req, res) => {
    const b = req.body ?? {};
    if (b.website) return res.json({ ok: true }); // honeypot: bots fill every field
    if (!(await allow(`wl:${req.ip}`, 20))) return res.status(429).json({ error: "Too many tries. Try again later." });
    const email = clean(b.email, 254)?.toLowerCase();
    if (!email || !EMAIL.test(email)) return res.status(400).json({ error: "That email doesn't look right." });

    let phone: string | null = null;
    if (clean(b.phone, 30)) {
      phone = normalizePhone(String(b.phone));
      if (!phone) return res.status(400).json({ error: "That phone number doesn't look right. It's optional, so you can leave it blank." });
    }
    const wants = Array.isArray(b.wants) ? [...new Set(b.wants.filter((w: unknown) => oneOf(WANTS, w)))] : [];
    const d = await db();

    const existing = await d.query<Row>("SELECT id, name, code, referrals, created_at FROM waitlist WHERE email = $1", [email]);
    if (existing.rows[0]) return res.json({ ...(await status(existing.rows[0])), already: true });

    const ref = clean(b.ref, 16);
    const referrer = ref ? (await d.query<{ code: string }>("SELECT code FROM waitlist WHERE code = $1", [ref])).rows[0] : undefined;
    let row: Row | undefined;
    for (let i = 0; i < 5 && !row; i++) {
      const { rows } = await d.query<Row>(
        `INSERT INTO waitlist (email, name, phone, text_consent_at, business, wants, plan, code, referred_by, source, campaign, referrer_host, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (code) DO NOTHING
         RETURNING id, name, code, referrals, created_at`,
        [
          email,
          clean(b.name, 60),
          phone,
          phone && b.textConsent === true ? new Date() : null, // one launch text, only with the box checked
          oneOf(BUSINESSES, b.business),
          wants,
          oneOf(PLANS, b.plan),
          newCode(),
          referrer?.code ?? null,
          clean(b.source, 60),
          clean(b.campaign, 60),
          clean(b.referrerHost, 120),
          req.ip ?? null,
        ],
      ).catch(async (err) => {
        // Two submits of the same email at once: the second finds the first.
        if (/email/.test(String((err as Error).message))) return d.query<Row>("SELECT id, name, code, referrals, created_at FROM waitlist WHERE email = $1", [email]);
        throw err;
      });
      row = rows[0];
    }
    if (!row) return res.status(500).json({ error: "Something went wrong. Try again." });
    if (referrer) await d.query("UPDATE waitlist SET referrals = referrals + 1 WHERE code = $1", [referrer.code]);
    res.json(await status(row));
  });

  // A returning visitor checks their place with the code saved in their browser.
  r.get("/api/waitlist/status", async (req, res) => {
    const code = clean(req.query.code, 16);
    const { rows } = code ? await (await db()).query<Row>("SELECT id, name, code, referrals, created_at FROM waitlist WHERE code = $1", [code]) : { rows: [] };
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(await status(rows[0]));
  });

  // Social proof, shown once the list is big enough to be worth showing.
  r.get("/api/waitlist/count", async (_req, res) => {
    const { rows } = await (await db()).query("SELECT count(*)::int AS n FROM waitlist");
    res.json({ count: rows[0].n >= SHOW_COUNT_FROM ? rows[0].n : null });
  });

  r.get("/api/admin/waitlist", ops, async (_req, res) => {
    const d = await db();
    const one = async (sql: string) => (await d.query(sql)).rows;
    const [totals] = await one(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS today,
        count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week,
        count(phone)::int AS with_phone, count(text_consent_at)::int AS text_ok,
        count(referred_by)::int AS referred FROM waitlist`);
    res.json({
      totals,
      daily: await one(`SELECT to_char(day, 'YYYY-MM-DD') AS day, coalesce(n, 0)::int AS n
        FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') day
        LEFT JOIN (SELECT date_trunc('day', created_at) AS d, count(*) AS n FROM waitlist GROUP BY 1) c ON c.d = day ORDER BY day`),
      business: await one("SELECT coalesce(business, 'not said') AS k, count(*)::int AS n FROM waitlist GROUP BY 1 ORDER BY 2 DESC"),
      wants: await one("SELECT w AS k, count(*)::int AS n FROM waitlist, unnest(wants) w GROUP BY 1 ORDER BY 2 DESC"),
      plan: await one("SELECT coalesce(plan, 'not said') AS k, count(*)::int AS n FROM waitlist GROUP BY 1 ORDER BY 2 DESC"),
      source: await one("SELECT coalesce(source, referrer_host, CASE WHEN referred_by IS NOT NULL THEN 'friend link' END, 'direct') AS k, count(*)::int AS n FROM waitlist GROUP BY 1 ORDER BY 2 DESC LIMIT 12"),
      referrers: await one("SELECT coalesce(name, split_part(email, '@', 1)) AS k, referrals AS n FROM waitlist WHERE referrals > 0 ORDER BY referrals DESC LIMIT 10"),
    });
  });

  r.get("/api/admin/waitlist.csv", ops, async (_req, res) => {
    const { rows } = await (await db()).query(
      `SELECT id, created_at, email, name, phone, text_consent_at, business, array_to_string(wants, ' ') AS wants, plan,
              code, referred_by, referrals, source, campaign, referrer_host FROM waitlist ORDER BY id`,
    );
    // Quote every cell; a leading = + - @ is neutralised so spreadsheets don't run it as a formula.
    const cell = (v: unknown) => {
      let s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
      if (/^[=+\-@]/.test(s) && !/^\+\d+$/.test(s)) s = `'${s}`; // a plain +phone number can't run as a formula
      return `"${s.replace(/"/g, '""')}"`;
    };
    const head = rows.length ? Object.keys(rows[0]) : ["id"];
    res.type("text/csv").attachment(`macoma-waitlist-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send([head.join(","), ...rows.map((r) => head.map((h) => cell(r[h])).join(","))].join("\n"));
  });

  return r;
}

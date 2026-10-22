// Postgres access. Production: DATABASE_URL (Neon, Supabase, RDS/Aurora) through a pg Pool,
// ideally behind PgBouncer. Development and tests: an embedded Postgres (PGlite) in DATA_DIR,
// so `npm run dev` needs nothing installed.
import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;
export type Db = { query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  phone text PRIMARY KEY,
  doc jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  code text UNIQUE,
  referred_by text,
  status text,
  stripe_customer text,
  stripe_subscription text,
  connect_account text,
  next_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_next_due ON users (next_due_at) WHERE next_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_referred_by ON users (referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_stripe_customer ON users (stripe_customer) WHERE stripe_customer IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_stripe_subscription ON users (stripe_subscription) WHERE stripe_subscription IS NOT NULL;

-- Which owner most recently texted a number on their behalf, so customer replies route in one lookup.
CREATE TABLE IF NOT EXISTS contact_index (
  contact_phone text NOT NULL,
  owner_phone text NOT NULL,
  last_outbound_at timestamptz NOT NULL,
  PRIMARY KEY (contact_phone, owner_phone)
);
CREATE INDEX IF NOT EXISTS contact_index_recent ON contact_index (contact_phone, last_outbound_at DESC);

CREATE TABLE IF NOT EXISTS do_not_text (phone text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now());

-- Consent records outlive deleted accounts.
CREATE TABLE IF NOT EXISTS consent_log (
  id bigserial PRIMARY KEY,
  phone text NOT NULL,
  at timestamptz NOT NULL,
  via text NOT NULL,
  terms_version text NOT NULL,
  ip text
);

-- Durable work: inbound texts, Stripe events, reminder ticks. One running job per phone at a time.
CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  phone text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  dedupe text UNIQUE,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs (run_at, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS jobs_phone_open ON jobs (phone, id) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS oauth_states (state text PRIMARY KEY, doc jsonb NOT NULL, expires_at timestamptz NOT NULL);

CREATE TABLE IF NOT EXISTS rate_limits (key text NOT NULL, bucket bigint NOT NULL, count integer NOT NULL, PRIMARY KEY (key, bucket));
`;

let ready: Promise<Db> | null = null;

async function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === "false" ? undefined : process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    pool.on("error", (err) => console.error("postgres pool", err));
    const db: Db = { query: async (sql, params) => { const r = await pool.query(sql, params as any[]); return { rows: r.rows, rowCount: r.rowCount ?? 0 }; } };
    await db.query(SCHEMA);
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(process.env.DATA_DIR ?? "data", "pg");
  fs.mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir);
  await lite.exec(SCHEMA);
  // PGlite runs one statement at a time; queue calls so concurrent callers never interleave.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    query: (sql, params) => {
      const run = chain.then(async () => {
        const r = await lite.query<any>(sql, params as any[]);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      });
      chain = run.catch(() => {});
      return run;
    },
  };
}

export function db(): Promise<Db> {
  ready ??= connect();
  return ready;
}

export const usingPostgres = () => Boolean(process.env.DATABASE_URL);

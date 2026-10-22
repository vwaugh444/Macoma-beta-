// Durable jobs in Postgres: inbound texts, Stripe events, reminder ticks.
//
// Webhooks only verify and insert a row, so they answer in milliseconds whatever the load.
// Worker processes claim rows with FOR UPDATE SKIP LOCKED, so any number of them can run
// side by side. Jobs for the same phone run one at a time and in order, so a conversation
// and its YES/NO confirmations never interleave. Each job runs as one unit of work.
import { db } from "./db.js";
import { retryTickLater, unitOfWork } from "./store.js";

export type JobKind = "sms" | "stripe_billing" | "stripe_connect" | "tick";
export type Job = { id: string; phone: string; kind: JobKind; payload: any; attempts: number };
type Handler = (job: Job) => Promise<void>;

const LOCK_MS = 5 * 60_000; // a job still "running" after this is assumed lost and retried
const MAX_ATTEMPTS = 5;
const backoff = (attempt: number) => Math.min(10 * 60_000, 5_000 * 4 ** (attempt - 1)); // 5s, 20s, 80s, 5m, 10m

// Returns false when a job with the same dedupe key already exists (a webhook retry).
export async function enqueue(phone: string, kind: JobKind, payload: unknown, opts: { dedupe?: string; runAt?: Date } = {}): Promise<boolean> {
  const r = await (await db()).query(
    "INSERT INTO jobs (phone, kind, payload, dedupe, run_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (dedupe) DO NOTHING",
    [phone, kind, JSON.stringify(payload ?? {}), opts.dedupe ?? null, opts.runAt ?? new Date()],
  );
  return r.rowCount > 0;
}

// The oldest ready job for a phone that has nothing running and nothing older waiting.
const CLAIM = `
UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = now() + ($2 || ' milliseconds')::interval
WHERE id IN (
  SELECT j.id FROM jobs j
  WHERE j.status = 'queued' AND j.run_at <= now()
    AND NOT EXISTS (SELECT 1 FROM jobs o WHERE o.phone = j.phone AND o.status IN ('queued', 'running') AND o.id < j.id)
    AND NOT EXISTS (SELECT 1 FROM jobs o WHERE o.phone = j.phone AND o.status = 'running')
  ORDER BY j.run_at, j.id
  LIMIT $1
  FOR UPDATE SKIP LOCKED
)
RETURNING id, phone, kind, payload, attempts`;

async function claim(n: number): Promise<Job[]> {
  const { rows } = await (await db()).query(CLAIM, [n, String(LOCK_MS)]);
  return rows.map((r) => ({ ...r, id: String(r.id) })) as Job[];
}

async function finish(job: Job, err?: unknown) {
  const d = await db();
  if (!err) return void (await d.query("UPDATE jobs SET status = 'done', locked_until = NULL WHERE id = $1", [job.id]));
  const message = String((err as Error)?.stack ?? err).slice(0, 2000);
  if (job.attempts >= MAX_ATTEMPTS) {
    console.error(`job ${job.id} (${job.kind}) failed for good`, err);
    await d.query("UPDATE jobs SET status = 'failed', last_error = $2, locked_until = NULL WHERE id = $1", [job.id, message]);
    if (job.kind === "tick") await retryTickLater(job.phone);
  } else {
    await d.query("UPDATE jobs SET status = 'queued', last_error = $2, locked_until = NULL, run_at = $3 WHERE id = $1", [
      job.id,
      message,
      new Date(Date.now() + backoff(job.attempts)),
    ]);
  }
}

// Requeues jobs whose worker died mid-run, and clears out old finished rows.
async function housekeeping() {
  const d = await db();
  await d.query("UPDATE jobs SET status = 'queued', locked_until = NULL WHERE status = 'running' AND locked_until < now()");
  await d.query("DELETE FROM jobs WHERE (status = 'done' AND created_at < now() - interval '2 days') OR (status = 'failed' AND created_at < now() - interval '14 days')");
  await d.query("DELETE FROM rate_limits WHERE bucket < $1", [Math.floor(Date.now() / 60_000) - 48 * 60]);
}

export async function queueStats() {
  const { rows } = await (await db()).query(
    "SELECT status, count(*)::int AS n, EXTRACT(EPOCH FROM now() - min(run_at)) AS oldest_s FROM jobs WHERE status IN ('queued', 'running', 'failed') GROUP BY status",
  );
  return Object.fromEntries(rows.map((r) => [r.status, { count: r.n, oldestSeconds: Math.round(Number(r.oldest_s ?? 0)) }]));
}

let stopping = false;
export const stopWorkers = () => void (stopping = true);

// `concurrency` jobs run at once in this process. One loop claims batches and hands them out.
export function startWorkers(handlers: Record<JobKind, Handler>, concurrency = Number(process.env.WORKER_CONCURRENCY ?? 16)) {
  let running = 0;
  let idleMs = 100;

  const run = async (job: Job) => {
    running++;
    try {
      await unitOfWork(() => handlers[job.kind](job));
      await finish(job);
    } catch (err) {
      await finish(job, err).catch((e) => console.error("could not record job failure", e));
    } finally {
      running--;
    }
  };

  const loop = async () => {
    while (!stopping) {
      const free = concurrency - running;
      const jobs = free > 0 ? await claim(free).catch((err) => (console.error("claim failed", err), [] as Job[])) : [];
      for (const job of jobs) void run(job);
      // Poll fast while busy, back off to 1s when the queue is empty.
      idleMs = jobs.length ? 20 : Math.min(1_000, idleMs * 2);
      await new Promise((r) => setTimeout(r, free > 0 ? idleMs : 50));
    }
  };

  void loop();
  setInterval(() => housekeeping().catch((err) => console.error("queue housekeeping", err)), 60_000).unref();
  console.log(`  Workers: ${concurrency} at a time`);
}

// --- rate limits shared by every web server ------------------------------------------------

// Fixed-window counter shared by every process: adds `by` and returns the window's total.
export async function counter(key: string, by: number, windowMs = 3_600_000): Promise<number> {
  const bucket = (Math.floor(Date.now() / windowMs) * windowMs) / 60_000; // window start, in minutes since epoch
  const { rows } = await (await db()).query(
    `INSERT INTO rate_limits (key, bucket, count) VALUES ($1, $2, $3)
     ON CONFLICT (key, bucket) DO UPDATE SET count = rate_limits.count + EXCLUDED.count RETURNING count`,
    [key, bucket, by],
  );
  return rows[0].count;
}

// True while `key` has been used at most `max` times this window.
export const allow = async (key: string, max: number, windowMs = 3_600_000) => (await counter(key, 1, windowMs)) <= max;

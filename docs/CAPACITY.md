# Running Macoma for 500,000 owners

How the system is built to handle 500k owners, what was measured, and what to set up at each size. The cost and timing estimates come from the playbook (`reports/Macoma launch and scale playbook.md`). The test numbers below come from `npm run load-test`.

## The design in one paragraph

Webhooks (Twilio, Stripe) only check the signature and insert a row into a `jobs` table in Postgres, then answer. Worker processes claim jobs with `FOR UPDATE SKIP LOCKED`, so you can run as many as you like. Each owner's jobs run one at a time and in order, which keeps a conversation and its YES/NO in sequence, while different owners run in parallel. Each owner is one row: a JSON document plus indexed columns for the lookups that have to be fast:

- referral code
- Stripe ids
- `next_due_at`

Nothing ever scans every account. Reminders, morning briefs, trial notices and welcome texts come from the `next_due_at` index: due owners are handed out as "tick" jobs in batches of 1,000, in one atomic statement. Customer replies are routed through `contact_index`. Sign-in rate limits and OAuth states also live in Postgres, so every web server shares them.

## What was measured

All tests ran on one 4-core container, with Postgres 16 on the same machine, a stand-in model and no real SMS. Web and workers shared one process (`ROLE=all`), which is the worst case for webhook latency.

| Test | Result |
|---|---|
| 10,000 inbound texts to 100,000 seeded owners, 200 at a time | 1,100 texts/s accepted into the queue. Webhook p50 115 ms, p95 280 ms. 0 errors, 0 failed jobs. No owner got a lost, duplicated or out-of-order reply. |
| Same run, 300 jobs at a time, 3 s model latency | 90 replies/s. That is the limit set by jobs in flight ÷ model time (300 ÷ 3.3 s), not by the database. |
| 50,000 owners with a reminder due at the same moment | All texted in 24 s (2,100/s), none missed. |
| Concurrency checks (`npm run test:store`, embedded and real Postgres) | Two edits to one account both survive. Removals survive concurrent edits. Two schedulers never queue the same owner twice. |

Webhook p99 reached 2–3 s in these runs. That happened because 300 busy workers shared the web process's event loop and connection pool. In production, run web and workers as separate processes (below).

## Sizing for 500k owners

From the playbook: about 61 inbound texts/s at peak (100/s in bursts) and about 245 model calls/s.

- **Jobs in flight** ≈ texts/s × seconds per reply. A reply with tools is roughly 8–15 s of model time, so 61 × 12 ≈ **730**, and about 1,200 in a burst.
- **Workers:** 6–8 worker processes with `WORKER_CONCURRENCY=200` and `AI_CONCURRENCY=200`. They mostly wait on the model, so small machines are fine (1 vCPU, 1 GB each).
- **Web:** 2–3 processes behind the load balancer (`ROLE=web`). They only verify and insert.
- **Postgres:** each reply makes about 8 short queries (claim, load, save, routing index, finish), which comes to roughly 500–1,000 queries/s at peak. That is comfortable for one managed instance with 4–8 vCPU.
  - Put PgBouncer (transaction mode) in front.
  - Keep `DATABASE_POOL_MAX` × processes under the pooler's limit.
  - Storage at about 30 KB per owner is roughly 15 GB.
- **Morning briefs** are spread over the first 45 minutes of each owner's hour (`DIGEST_SPREAD_MIN`). That way 200k owners in one time zone send about 75 texts/s, not one burst at 8:00.
- **Twilio:** use a Messaging Service (`TWILIO_MESSAGING_SERVICE_SID`), with a short code as the main sender at Stage 3. Twilio queues beyond your sending rate, and the SDK retries on 429.
- **Anthropic:** the SDK retries 429 and overload errors with backoff (`ANTHROPIC_MAX_RETRIES`). `AI_CONCURRENCY` caps model calls per process. You need a Custom tier before about 80k owners (see the playbook).

## Process layout

```
          Twilio / Stripe / browsers
                     │
              load balancer (TRUST_PROXY_HOPS=1)
           ┌─────────┴─────────┐
       ROLE=web            ROLE=web          ← pages, sign-in, webhooks: verify + insert job
           └─────────┬─────────┘
                PgBouncer → Postgres (users, jobs, contact_index, …)
           ┌─────────┼─────────┬─────────┐
     ROLE=worker ROLE=worker ROLE=worker …   ← claim jobs, run the agent, send texts, scheduler
```

All processes run the same code. A deploy can stop workers at any time: `SIGTERM` stops claiming new jobs, and any job cut off mid-run is retried once its 5-minute lock expires. For that reason, inbound-text jobs never retry after the agent has started replying.

## Watch these

- `GET /readyz` with `Authorization: Bearer $OPS_TOKEN` shows queue depth and the age of the oldest waiting job. Alert when the oldest queued job is older than 30 s.
- Failed jobs stay in `jobs` for 14 days with `last_error`.
- Model spend per account is metered in each owner's usage. A2A spend has its own daily cap (`A2A_DAILY_CAP_USD`).

## Run the tests yourself

```bash
npm run test:store                                    # embedded Postgres, no setup
DATABASE_URL=postgres://… npm run test:store          # against a scratch database
DATABASE_URL=postgres://… LOAD_USERS=100000 LOAD_MESSAGES=10000 \
  WORKER_CONCURRENCY=300 AI_CONCURRENCY=300 AI_MOCK_MS=3000 npm run load-test
```

Use a scratch database. The tests add rows with `+1555…` and `+1777…` numbers.

## Not built yet

These come from the scope of work, stages 2–4:

- row-level security as a second wall between owners;
- a read replica and table partitions;
- a second cloud route for Claude (Bedrock or Vertex);
- holding texts ("working on it…") during a model outage.

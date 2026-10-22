# Scaling Macoma to 500k Users: Architecture, Capacity, Cost, Security and SOC 2

Research date: 2026-10-22. Anthropic figures come from the live docs at platform.claude.com, which were fetched directly and are primary sources. Twilio, OWASP, AWS and vendor-pricing figures come from web-search summaries, because direct fetches of twilio.com and owasp.org were blocked in this environment. Where these figures come from third-party blogs, they are flagged as such. Inferences and the numbers I computed are labeled.

---

## Q1. Load model: peak inbound msg/s, LLM calls/s and tokens/day at 500k users

### Takeaway
Under the mid-case assumptions (35% DAU, 10 inbound texts per active user per day), 500k users generate about 1.75M inbound texts/day. That is about 20 msg/s on average and about 60 msg/s at peak hour, which means about 250 LLM calls/s, about 70B input tokens/day and about 2B output tokens/day. Message ingress is easy at that scale. The binding constraints are LLM rate limits and spend caps, plus carrier SMS caps.

### Cited Findings
- Anthropic rate limits are per organization, per model class, and measured in RPM, ITPM and OTPM. They use a continuously refilling token bucket, and "a rate of 60 requests per minute (RPM) might be enforced as 1 request per second", so short bursts can trigger 429s — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- The Scale tier (highest self-serve) is 10,000 RPM / 10,000,000 ITPM / 2,000,000 OTPM per model, each listed separately for Opus 5.5, Sonnet 5.5 and Haiku 5.5. Opus 5.5 and Sonnet 5.5 "each have a separate rate limit" — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- For most models, only uncached `input_tokens` plus `cache_creation_input_tokens` count toward ITPM. Cache reads do not. Anthropic's example: "With a 2,000,000 ITPM limit and an 80 percent cache hit rate, you could effectively process 10,000,000 total input tokens per minute" — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- OTPM counts only tokens actually generated, and `max_tokens` does not count toward it — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)

### Inferences (my computations; assumptions stated)
**Assumptions:**
- A1: DAU is 30–40% of 500k, so 150k–200k. Mid case: 175k.
- A2: 5–15 inbound texts per DAU per day. Mid case: 10.
- A3: A peak-hour factor of 3x the 24-hour average, because US traffic is concentrated in about 16 waking hours with lunch and evening peaks. This is an assumption with no source. A 5x minute-level burst can occur if reminders fire on round times without jitter.
- A4: An average of 4 LLM calls per inbound text (1 Haiku triage call plus about 3 agent-loop calls). The worst case is 12.
- A5: An average of 40k input tokens per inbound text summed across its calls: a system prompt plus tool definitions of about 6–8k, conversation history, and occasional web-search results. 80% of these are cache reads, 15% uncached and 5% cache writes. Output is about 1.2k tokens per inbound (tool-call JSON plus a short SMS reply).

**Inbound volume at 500k users:**

| Case | Inbound/day | Avg msg/s (÷86,400) | Peak-hour msg/s (×3) |
|---|---|---|---|
| Low (30% × 5) | 750k | 8.7 | 26 |
| Mid (35% × 10) | 1.75M | 20.3 | 61 |
| High (40% × 15) | 3.0M | 34.7 | 104 (≈175 with an unjittered 5x burst) |

**LLM calls per second:**
- Mid: 61 × 4 = about 245 calls/s, or about 14.7k RPM in total.
  - Split by routing (all texts get Haiku triage, 3 more calls go to Sonnet or Opus): Haiku is about 61/s (3.7k RPM), and Sonnet plus Opus together are about 183/s (11k RPM). Sonnet alone at about 9k RPM is close to the 10k Scale-tier ceiling.
- High with worst-case 12 calls: 104 × 12 = about 1,250 calls/s, or about 75k RPM. That is far above the Scale tier.

**Tokens per day (mid case):**
- Input: 1.75M × 40k = about 70B tokens/day.
- Output: 1.75M × 1.2k = about 2.1B tokens/day.

**ITPM pressure at peak (mid case):**
- 61/s × 40k = 2.44M input tokens/s, or about 146M per minute.
- 20% of that counts toward ITPM (uncached input plus cache writes), which gives about 29M counted ITPM.
- Spread across three models that is still above 10M on at least one model:
  - If Haiku handles 70% of conversations end to end, Haiku alone is about 20M ITPM.
- OTPM: about 73k tokens/s, or about 4.4M OTPM, against 2M per model at Scale.

**Conclusion:** At 500k users Macoma needs the Custom tier (negotiated limits). Aggressive caching (a 90%+ hit rate), history trimming and summarization are what keep counted ITPM manageable.

**Staged milestones (mid assumptions: 3.5 inbound per registered user per day):**

| Users | Inbound/day | Peak msg/s | Peak LLM calls/s |
|---|---|---|---|
| 1k | 3.5k | 0.12 | 0.5 |
| 10k | 35k | 1.2 | 5 |
| 100k | 350k | 12 | 49 |
| 500k | 1.75M | 61 | 245 |

### Gaps
- No public benchmark exists for texts per user per day for SMS assistants. A2–A5 are assumptions, so measure them during the 1k-user stage.
- The token profile of web search (how many result tokens each search adds) depends on the query. I did not find a published typical value.

---

## Q2. Anthropic API at scale: tiers, Priority Tier, caching, Batches, cost per conversation, routing, Managed Agents, 429/529 handling

### Takeaway
The monthly spend caps are the hidden cliff: Start $500, Build $1,000, Scale $200,000. When an organization hits its cap, the API returns non-retryable 429s until the 1st of the next month. At the routed-mix cost modeled here (about $0.018 per inbound), Macoma reaches the Scale cap at about 100k users, so a Custom-tier agreement must be in place before then. Opus 5.5 and Sonnet 5.5 cache reads cost 0.05x of base input, which makes heavy caching the single biggest cost and throughput lever. Priority Tier can no longer be purchased.

### Cited Findings
**Tiers and spend caps**
- Monthly spend caps: Start $500, Build $1,000, Scale $200,000. "Organizations on the Custom tier have no monthly spend cap" — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- On reaching the cap, "API usage pauses until 00:00 UTC on the first day of the next month". The response is HTTP 429 with `error_code: enforced_spend_limit_reached` and no `retry-after`, and "Retrying, including the SDK's automatic retries, fails until access resumes" — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- New organizations "may start in the Evaluation tier, with limits below the standard limits" and are raised automatically as usage history builds. Higher limits are requested via "Request tier increase" in the Console — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- Per-model RPM / ITPM / OTPM by tier:
  - Start: 1,000 / 2M / 400k
  - Build: 5,000 / 5M / 1M
  - Scale: 10,000 / 10M / 2M (for Opus 5.5, Sonnet 5.5 and Haiku 5.5 alike)
  - Custom: contact sales
  — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- "Acceleration limits": sharp increases in usage can trigger 429s, and the advice is to "increase your traffic gradually" — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- Rate limits are shared across `inference_geo` values. US-only inference costs a 1.1x multiplier on Claude 4.6 and later models — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits); [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Workspaces can be given lower limits, which helps isolate, for example, an eval or batch workspace from production — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)

**Priority Tier**
- "Priority Tier capacity commitments are no longer available for purchase." Existing commitments continue until contract end. "If you need guaranteed capacity, contact sales" — [Anthropic service tiers](https://platform.claude.com/docs/en/api/service-tiers)
- Priority requests "pull from both the Priority Tier capacity and the regular rate limits". Cache reads burn down at 0.1 and 5-minute cache writes at 1.25 — [Anthropic service tiers](https://platform.claude.com/docs/en/api/service-tiers)

**Pricing (current docs; these match the figures in the brief)**

| Model | Base input | 5m cache write | 1h cache write | Cache read | Output |
|---|---|---|---|---|---|
| Opus 5.5 | $4 | $5 | $8 | $0.20 | $20 |
| Sonnet 5.5 | $2 | $2.50 | $4 | $0.10 | $10 |
| Haiku 5.5 (prompts ≤100k tokens) | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |
| Haiku 5.5 (prompts >100k tokens) | $0.50 | — | — | $0.05 | $2.50 |

All prices are per MTok — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Cache hits on Opus 5.5 and Sonnet 5.5 are 0.05x of base input. Other models are 0.1x — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Cache TTL defaults to 5 minutes and is "refreshed for no additional cost each time the cached content is used". A 1-hour TTL is available at a 2x write price — [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Web search costs "$10 USD per 1,000 searches" plus token costs. Search results count as input tokens in later turns. Failed searches are not billed — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Code execution is free when `web_search_20260209`+ or `web_fetch_20260209`+ is in the request — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Fast mode on Opus 5.5 is $8/$40 per MTok and is not available with Batch — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

**Message Batches**
- Batches get a 50% discount: Opus 5.5 $2/$10, Sonnet 5.5 $1/$5, Haiku 5.5 $0.05/$0.25. This stacks with caching multipliers — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- "most batches completing within 1 hour". Batches expire if not done within 24 hours, and results are available for 29 days — [Anthropic batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- Batch limits (shared across models): up to 100,000 requests per batch, and 200k / 300k / 500k requests in the processing queue on Start / Build / Scale — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- The Batch API is **not ZDR-eligible** because it stores jobs — [Anthropic API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)

**Errors and retries**
- 429 is `rate_limit_error`; "When the response has a `retry-after` header, wait that many seconds" — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- 529 is `overloaded_error` ("high traffic across all users"). 500 is `api_error`: retry with exponential backoff — [Anthropic errors](https://platform.claude.com/docs/en/api/errors)
- The SDK automatically retries connection errors, 429s and 5xx with exponential backoff, "twice by default, honoring the `retry-after` header". This is configurable via `maxRetries` — [Anthropic errors](https://platform.claude.com/docs/en/api/errors)
- Response headers report remaining and reset values for requests, input tokens and output tokens, which allows client-side admission control — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)

**Managed Agents**
- Managed Agents is in beta (header `managed-agents-2026-04-01`). It is a "Pre-built, configurable agent harness that runs in managed infrastructure", "Best for long-running tasks and asynchronous work", with built-in prompt caching and compaction. Its concepts are Agent, Environment (Anthropic cloud sandbox or self-hosted), Session and Events — [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- Pricing: tokens at standard rates plus $0.08 per session-hour, counted only while `running` (not idle). There is no batch discount — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Rate limits: create endpoints 300 RPM, read endpoints 1,200 RPM. These are separate from the Messages API limits — [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- Data retention: "session transcripts persist until you delete them", so it is not a ZDR path — [Anthropic API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)

### Inferences (computed costs, per inbound text, using the A5 token profile)
**Typical turn: 4 calls, 32k cache read + 6k uncached + 2k 5-minute cache write, 1.2k output, 0.5 web searches on average ($0.005):**

| Model | Uncached | Cache read | Write | Output | Search | **Total** |
|---|---|---|---|---|---|---|
| Opus 5.5 | $0.024 | $0.0064 | $0.010 | $0.024 | $0.005 | **≈ $0.069** |
| Sonnet 5.5 | $0.012 | $0.0032 | $0.005 | $0.012 | $0.005 | **≈ $0.037** |
| Haiku 5.5 | $0.0006 | $0.0003 | $0.00025 | $0.0006 | $0.005 | **≈ $0.0068** |

On Haiku, the web-search fee is about 70% of the cost, so routing searches sparingly matters.

**Worst-case Opus turn: 12 calls, about 240k input (70% cached), 6k output, 5 searches:**
- 168k read = $0.034, 60k uncached = $0.24, 12k write = $0.06, output = $0.12, searches = $0.05.
- Total: about $0.50 per inbound.

**Routed mix (Haiku triage on everything, then 70% handled by Haiku, 25% by Sonnet, 5% by Opus):**
- About $0.0175 plus about $0.0005 triage, so about $0.018 per inbound.
- That is about $5.4 per DAU-month, or about $1.9 per registered user-month at 35% DAU.

**Monthly LLM spend by stage (mid assumptions, routed):**

| Users | Monthly LLM spend | Tier implication |
|---|---|---|
| 1k | ≈ $1.9k | Already above the Start ($500) and Build ($1k) caps, so Scale tier is needed early |
| 10k | ≈ $19k | |
| 100k | ≈ $189k | Brushes the $200k Scale cap; a Custom agreement is mandatory before this point |
| 500k | ≈ $945k | Opus-only would be ≈ $3.6M/month, a 3.8x difference from routing |

**Batches and caching:**
- Use Batches for non-urgent work: nightly memory summarization, digest generation, eval runs and backfills. This halves their cost, but those workloads lose ZDR.
- Put the system prompt and tools first and keep them byte-stable. Put the cache breakpoint after them and another on the rolling conversation history. Each agent-loop iteration then reads the previous one's prefix from cache. Because the 5-minute TTL refreshes on use, an active SMS thread stays warm.
- A 1-hour TTL helps for users who reply several minutes apart.

**Retry and queue design:**
- Wrap Claude calls in a durable-execution step with exponential backoff and jitter, honoring `retry-after`.
- Treat `enforced_spend_limit_reached` as a page-the-founder, non-retryable event.
- Run a client-side token-bucket admission controller fed by the `anthropic-ratelimit-*-remaining` headers. Under pressure, degrade: Opus to Sonnet, Sonnet to Haiku, and defer non-urgent work to Batches.
- On sustained 529s, send the user a holding SMS ("working on it…") rather than failing silently.
- A multi-provider fallback (Claude on AWS Bedrock or Google Vertex, which have separate quota pools) is an option. The pricing page lists cloud-platform pricing, but I did not verify those platforms' quotas.

**Managed Agents fit:**
- It fits poorly for the core per-text loop at 500k users. Creating a session per text at 61/s (about 3.7k/min) exceeds the 300 RPM create limit, so sessions would have to be long-lived and reused per user.
- Transcripts persist, so there is no ZDR.
- It is a reasonable fit for occasional long-running tasks (deep research, multi-step bookkeeping).

### Gaps
- The Managed Agents rate limit for *sending events* to an existing session is not specified on the page I read (only create and read endpoints are). The full limits table is on the Managed Agents reference page, which I did not fetch.
- Custom-tier pricing and discounts are not public.
- I did not verify minimum cacheable prompt lengths for the 5.5 models.

---

## Q3. Messaging throughput: 10DLC, T-Mobile caps, toll-free, short codes, Messaging Service, webhook reliability and idempotency

### Takeaway
At 500k users, 10DLC alone does not work. T-Mobile caps each EIN at about 200k messages/day even at the top trust score, while Macoma would send about 1.75M or more outbound messages/day. Plan a dedicated short code (100+ MPS, about $1,000/quarter, 6–10 weeks to provision) by the 100k-user stage, with 10DLC or verified toll-free as fallback senders in a Twilio Messaging Service. Inbound webhooks must be idempotent on MessageSid, because Twilio retries on connection failure.

### Cited Findings
**10DLC**
- 10DLC throughput depends on brand trust score: "the higher your Trust Score, the higher your messaging throughput (MPS)" — [Twilio Help Center: MPS and Trust Scores](https://help.twilio.com/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US?facet1=pdf)
- Third-party MPS bands:

| Trust score | Total MPS | Per carrier |
|---|---|---|
| 75–100 | 225 | 75 |
| 50–74 | 120 | 40 |
| 1–49 | 12 | 4 |

  Sole-proprietor brands get 0.5 MPS per number — [JustCall help](https://help.justcall.io/en/articles/8484885-all-about-the-trust-scores-for-a2p-10dlc-in-the-us); [A2P.guide](https://a2p.guide/texting/10dlc/trust-score-and-throughput/) (third party, not verified against Twilio)
- Twilio changelog (2026-03-18): MMS MPS on 10DLC scales per major carrier to 40 for scores ≥75, 20 for 50–74, and 5 below 50 — [Twilio changelog](https://www.twilio.com/en-us/changelog/increased-mms-rate-limits-for-a2p-10dlc-phone-numbers-in-the-u-s0)
- The T-Mobile daily cap is "applied at an EIN level, and shared among all A2P Brands and Campaign use cases registered under that EIN" — [Twilio T-Mobile daily limits](https://support.twilio.com/hc/en-us/articles/1260804800549-T-Mobile-Daily-Message-Limits-for-Long-Code-Messaging-with-A2P-10DLC)
- Cap bands run from about 2,000/day (lowest score) to 200,000/day (score ≥75). Sources differ on the 50–74 band (40k vs 50–100k/day). Sole proprietors get about 1,000/day — [Leads Now AI](https://leadsnow.ai/a2p-10dlc-registration-for-outbound-sms-usa/); [A2P.guide](https://a2p.guide/texting/10dlc/trust-score-and-throughput/) (third party)
- Going beyond 200k/day on T-Mobile requires a special review. One guide cites $500 per brand — [Twilio Special Use Cases](https://support.twilio.com/hc/en-us/articles/4402972441243-Special-Use-Cases-for-A2P-10DLC); [piyushgambhir.com](https://www.piyushgambhir.com/blogs/twilio-a2p-brands-campaigns-costs-throughput-compliance)
- Account-level rate limits also cap combined MPS across campaigns. A new account without an approved Business Primary Customer Profile is capped at 20,000 messages/day across all sender types — [Twilio account-based throughput](https://www.twilio.com/docs/messaging/guides/account-based-throughput-overview); [Twilio rate limits & queues](https://support.twilio.com/hc/en-us/articles/115002943027-Understanding-Twilio-Rate-Limits-and-Message-Queues)

**Short codes and toll-free**
- Short codes: "100 messages per second (MPS)", listed as 100+ MPS. Toll-free: 3–150+ MPS, about 3 MPS by default, raisable via support — [Twilio account-based throughput](https://www.twilio.com/docs/messaging/guides/account-based-throughput-overview); [Twilio number comparison](https://www.twilio.com/en-us/lp/messaging-guide-2024-number-types/2)
- Short code cost: random $1,000 billed quarterly, vanity $1,500 billed quarterly, plus a one-time setup fee. Toll-free numbers cost $2.15/month — [Twilio US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us) (via search summary)
- Provisioning time: short code 6–10 weeks, toll-free 7–21 days with verification (Twilio). An older Action Network article says about 3 months for a short code — [Twilio number comparison](https://www.twilio.com/en-us/lp/messaging-guide-2024-number-types/2); [Action Network](https://help.actionnetwork.org/hc/en-us/articles/4415521192852-Twilio-Legacy-US-Mobile-Messaging-Pricing-and-Fees)
- Twilio's high-volume architecture guide covers deliverability and resiliency design (sender pools, Messaging Services) — [Twilio blog: high-volume messaging](https://www.twilio.com/en-us/blog/high-volume-messaging-solution)

**Webhooks**
- Twilio's webhook connection overrides go in the URL fragment:
  - `rc` = retry count, 0–5, default 1
  - `ct` = connect timeout, 100–10,000 ms, default 5,000
  - `rt` and `tt` = read and total timeout, 100–15,000 ms, default 15,000
  
  "URL fragments do not make it into the signature computation" — [Twilio connection overrides](https://twilio.com/docs/usage/webhooks/webhooks-connection-overrides)
- The `X-Twilio-Signature` is an HMAC-SHA1 over the full URL plus parameters, keyed with the Auth Token. Proxies that rewrite the scheme or host break validation — [webhookrelay guide](https://webhookrelay.com/blog/twilio-webhooks-guide/); [dev.to](https://dev.to/eventdock/how-to-validate-twilio-webhook-signatures-and-the-proxy-trap-that-breaks-them-3jpl) (third party)
- Status callbacks progress through queued → sent → delivered / undelivered / failed. Status callbacks are best-effort and "delivered" depends on carrier confirmation — [sent.dm](https://www.sent.dm/resources/twilio-node-js-redwoodjs-delivery-status-and-callbacks); [Hookdeck](https://hookdeck.com/webhooks/skills/twilio-webhooks) (third party)

### Inferences
- **Outbound volume:** about 1 reply per inbound plus reminders and proactive messages, so at least 1.75M segments/day at mid 500k, and more for multi-segment replies. Peak is about 60–100+ MPS.
- **10DLC at 500k:** 10DLC at top trust (225 MPS total) technically covers peak MPS. The T-Mobile 200k/day per-EIN cap is the blocker: if about 30% of users are on T-Mobile, that is about 525k/day. This is binding from about 100k–200k users.
- **Sender plan by stage:**
  - **1k–10k:** a standard 10DLC brand (aim for a trust score ≥75 with a complete EIN profile), one conversational or mixed campaign, and a Messaging Service with a small number pool and sticky sender.
  - **~50k:** start the short code application, given its 6–10 week lead time.
  - **100k+:** a short code as the primary sender. Keep 10DLC and verified toll-free in the same Messaging Service for failover.
  - Keep each user pinned to one sender number (sticky sender), so the conversation thread stays consistent on the user's phone.
- **Ingress pattern:**
  - Validate the signature.
  - `INSERT … ON CONFLICT (message_sid) DO NOTHING` into an `inbound_messages` table, or enqueue with MessageSid as the dedup ID.
  - Return an empty 200 TwiML within about 100 ms, so retries rarely trigger.
  - Never call Claude inside the webhook request.
- **Status callbacks:** write them to a `message_status` table keyed on (MessageSid, status). Reconcile missing callbacks with periodic Twilio API polling, because callbacks are best-effort.

### Gaps
- I could not fetch Twilio's current per-segment US SMS price, carrier pass-through fees or 10DLC registration fees (twilio.com was blocked), so SMS cost per message is unquantified here. It is likely a comparable cost line to the LLM spend.
- I could not confirm whether inbound (MO) messages count toward carrier caps.
- I did not verify current T-Mobile cap bands from Twilio's own page; the third-party sources conflict on the 50–74 band.

---

## Q4. Reference architecture: ingress, queue, durable execution, Postgres/RLS, per-user ordering, scheduler, observability, hosting

### Takeaway
Use a stateless webhook, then a durable queue keyed by user, then durable-execution workers (one agent run per inbound, serialized per user). Store everything in Postgres with RLS and a transaction-mode pooler. Implement reminders as durable timers or a delayed-job table indexed on `fire_at`, never as a cron scan of all users. For a solo founder: Render or Railway plus managed Postgres (Neon, Supabase or RDS) and Inngest or Trigger.dev through about 10k–100k users; then move to AWS (ECS Fargate + Aurora/RDS + SQS) or Temporal Cloud once volume and compliance justify it.

### Cited Findings
**Queues**
- SQS FIFO: 300 TPS per API action per partition without high-throughput mode, or 3,000 msg/s with batching. High-throughput mode sets dedup scope and throughput limit to "Per message group ID" — [AWS: high-throughput FIFO](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/enable-high-throughput-fifo.html)
- The maximum SQS message timer (delay) is 15 minutes, which is too short for reminders on its own — [AWS SQS message quotas](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html)

**Durable execution**
- Inngest: maximum sleep 1 year (7 days on free). Pro plan pricing conflicts across sources ($75 vs $99/month) — [Upstash comparison](https://upstash.com/blog/durable-workflow-engines-compared-every-major-option-in-2026); [apiscout](https://apiscout.dev/guides/inngest-vs-triggerdev-vs-temporal-2026) (third party)
- Temporal Cloud: $50 per million Actions, discounted to $25/M at volume. Active storage of long-lived workflow history can dominate cost; one estimate is $1,533/month for 10k sessions with 5 MB of history each, vs $13.50 in Actions — [Upstash comparison](https://upstash.com/blog/durable-workflow-engines-compared-every-major-option-in-2026) (third party)
- Restate: $75/month Starter, 50k free actions/month, and a source-available license — [Upstash comparison](https://upstash.com/blog/durable-workflow-engines-compared-every-major-option-in-2026)
- Trigger.dev bills compute-seconds plus a per-run fee with no documented sleep cap — [Upstash comparison](https://upstash.com/blog/durable-workflow-engines-compared-every-major-option-in-2026)
- Single-workload cost comparison (third party):

| Engine | Cost |
|---|---|
| Cloudflare Workflows | $33 |
| Hatchet | $90 |
| AWS Step Functions | $115 |
| Inngest Pro | $259 |
| Temporal Cloud | $270 |
| Trigger.dev | $411 |

  — [Upstash comparison](https://upstash.com/blog/durable-workflow-engines-compared-every-major-option-in-2026)

**Postgres and RLS**
- Use `SET LOCAL` or `set_config('app.tenant_id', …, true)` inside an explicit transaction so tenant context cannot leak to the next request on a pooled connection. A session-level `SET` leaks under pooling — [chat2db](https://chat2db.ai/resources/blog/postgres-session-settings-and-set-config); [stackharbor](https://stackharbor.com/en/knowledge-base/pg-row-level-security-multi-tenant/)
- Pair policies `USING` with `WITH CHECK`, enable `FORCE ROW LEVEL SECURITY`, and use a non-BYPASSRLS app role — [edana](https://edana.ch/en/2026/06/25/ensuring-multi-tenant-data-isolation-with-postgresql-row-level-security-rls/); [stackharbor](https://stackharbor.com/en/knowledge-base/pg-row-level-security-multi-tenant/)
- One source advises session pooling instead of transaction pooling with RLS. Others say transaction-local settings are safe under transaction pooling (source disagreement) — [edana](https://edana.ch/en/2026/06/25/ensuring-multi-tenant-data-isolation-with-postgresql-row-level-security-rls/)

**Observability**
- OTel GenAI semantic conventions standardize model-call spans with token counts, but not conversation-level or cost rollups — [Last9](https://last9.io/blog/best-ai-observability-tools-2026)
- Langfuse: MIT core, self-hostable (requires Postgres plus ClickHouse), OTel-native. Cloud tiers: free 50k units, Core $29/month, Pro $199/month — [Last9](https://last9.io/blog/best-ai-observability-tools-2026); [morphllm](https://www.morphllm.com/ai-agent-observability-tools)
- Helicone: Apache-2.0. One source says Mintlify acquired it and it is in maintenance mode (unverified) — [morphllm](https://www.morphllm.com/ai-agent-observability-tools)

**Hosting (directional; vendor-adjacent blogs)**
- Render: Starter $7/month, Standard $25/month. Managed Postgres with backups, PITR, HA and replicas. Runs on AWS — [devopsboys](https://devopsboys.com/blog/render-vs-railway-vs-fly-io-paas-2026); [sota.io](https://sota.io/blog/railway-vs-render-vs-fly-pricing-2026)
- Railway: usage-based billing, Pro $20/month plus usage. Best database DX — [sota.io](https://sota.io/blog/railway-vs-render-vs-fly-pricing-2026)
- Fly.io: cheapest compute (1 vCPU / 2 GB about $10.70/month), but `fly postgres` is not fully managed; you handle upgrades yourself — [devopsboys](https://devopsboys.com/blog/render-vs-railway-vs-fly-io-paas-2026); [morphllm](https://www.morphllm.com/comparisons/flyio-vs-render)

### Inferences (reference design)
1. **Ingress**
   - A stateless Express/Hono handler (2+ instances behind a load balancer).
   - Validate the Twilio signature, upsert on MessageSid, enqueue `{user_id, message_sid}`, return 200.
   - No business logic in the handler. This alone fixes most "breaking" risk.
2. **Per-user ordering**
   - Serialize agent runs per user, so two quick texts do not race on memory or tools.
   - Options:
     - SQS FIFO with `MessageGroupId = user_id`
     - Inngest or Trigger.dev concurrency keys (`concurrency: {key: user_id, limit: 1}`)
     - Temporal one-workflow-per-user with signals
     - a Postgres advisory lock on user_id
   - Coalesce texts that arrive while a run is in flight into the next turn.
3. **Agent runs as durable workflows**
   - Each Claude call and tool call is a checkpointed step: retries with backoff, crash-safe resume, and no duplicate side effects.
   - Side-effecting tools (send SMS, create invoice, send email) use idempotency keys: Stripe idempotency keys, and outbound SMS keyed by `run_id + step`.
4. **Reminders (millions)**
   - Option A, a delayed-job table:
     - `reminders(id, user_id, fire_at, status)` with a partial index on `fire_at WHERE status='pending'`.
     - A poller claims due rows with `SELECT … FOR UPDATE SKIP LOCKED LIMIT n` every few seconds and enqueues them.
     - This is O(due rows), not O(users), and is cheap at millions of rows.
   - Option B, durable timers: Inngest `step.sleepUntil`, Temporal timers, EventBridge Scheduler one-time schedules.
     - Beware per-timer storage or action billing at millions of pending timers.
   - **Recommendation:** Option A in Postgres as the source of truth, plus a durable workflow per *firing*.
   - Add 0–60 s of jitter to round-time reminders to flatten 9:00am spikes.
   - Replace the current in-process `setInterval` first: it double-fires with 2+ instances and loses timers on deploy.
5. **Postgres**
   - Managed (Neon, Supabase, RDS or Aurora) with PITR.
   - RLS on every user-owned table, with `tenant_id = user_id` (or `account_id` if households or teams come later).
   - A transaction-mode pooler (PgBouncer, Supavisor or RDS Proxy) and `SET LOCAL` inside every transaction.
   - Partition high-volume append tables (`messages`, `llm_calls`, `audit_log`) by month for cheap retention drops.
   - At 1.75M inbound plus 1.75M outbound per day, `messages` grows by about 100M rows/month, so partitioning is required by about 100k users.
6. **Observability**
   - OTel traces from webhook to queue to workflow to Claude to Twilio, under one trace ID per MessageSid.
   - Langfuse (cloud, then self-hosted) for prompt, cost and cache-hit tracking.
   - Alerts on queue age, 429/529 rate, spend vs cap, Twilio error codes and the T-Mobile daily count.
7. **Hosting path**
   - **1k:** Render or Railway, managed Postgres, Inngest or Trigger.dev cloud.
   - **10k:** same stack, plus a read replica and Langfuse.
   - **100k:** consider AWS (ECS Fargate + RDS/Aurora + SQS FIFO + KMS) or stay on Render with Aurora. Add a Temporal Cloud evaluation.
   - **500k:** multi-AZ, a separate worker pool per model, a Custom Anthropic tier and a short code.
   - Cloudflare Workers plus Queues plus Workflows is cheapest per the single benchmark, but its Node compatibility for an Express app needs verification.

### Gaps
- No primary-source PgBouncer documentation was fetched.
- No authoritative EventBridge Scheduler quota for one-time schedules was found.
- There is no authoritative benchmark of durable-engine costs at millions of sleeping timers.
- Uptime statistics for Render, Railway and Fly.io were not found.

---

## Q5. Security: token storage, secrets, prompt injection, OWASP LLM Top 10, abuse and fraud, retention, DR, audit

### Takeaway
The highest-risk surface is an agent that reads untrusted email and SMS and can also send messages and payments: OWASP LLM01 (prompt injection) combined with LLM06 (excessive agency). Prompt-level defenses such as spotlighting are probabilistic. Use architectural controls instead:
- per-tool permissions
- human confirmation by SMS reply for any send, payment or external write
- recipient allowlists
- separation of the quarantined reader from the privileged planner (CaMeL-style)

Encrypt OAuth tokens with KMS envelope encryption. Enable Twilio SMS-pumping protection and SIM-swap checks.

### Cited Findings
- OWASP Top 10 for LLM Applications 2025: LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM04 Data and Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector and Embedding Weaknesses, LLM09 Misinformation, LLM10 Unbounded Consumption — [Invicti](https://www.invicti.com/blog/web-security/owasp-top-10-risks-llm-security-2025); [promptfoo](https://promptfoo.dev/docs/red-team/owasp-llm-top-10/)
- The LLM06 mitigation is to limit extensions to those needed and restrict their functions, for example read-only email where that suffices — [promptfoo](https://promptfoo.dev/docs/red-team/owasp-llm-top-10/)
- Indirect injection via external content (emails, web pages, tool outputs) is generally considered more dangerous than direct injection — [Gravitee](https://www.gravitee.io/blog/owasp-top-10-for-llm-applications-2025-a-practical-guide)
- Spotlighting (delimiting, datamarking, encoding) is a heuristic. In one AgentDojo evaluation it still allowed many attacks — [arXiv 2601.17548](https://arxiv.org/html/2601.17548v1)
- CaMeL extracts control and data flow from the trusted query so "untrusted data retrieved by the LLM can never impact the program flow". It had 0 successful attacks vs 8 for the next-best defense on AgentDojo, at higher token cost and lower task completion (about 77% vs 84%). A later paper shows that only its strict mode stops "agent data injection" — [CaMeL paper](https://arxiv.org/html/2503.18813v2); [arXiv 2607.05120](https://arxiv.org/pdf/2607.05120)
- One review recommends that agents satisfy no more than two of: (A) processing untrusted input, (B) accessing sensitive data, (C) changing state or communicating externally — summarized from [arXiv 2601.17548](https://arxiv.org/html/2601.17548v1)
- KMS pricing:
  - $1/month per customer-managed key, with up to 2 rotations adding $1 each.
  - $0.03 per 10k standard requests, including GenerateDataKey.
  - 20k requests/month free.
  — [Wring](https://wring.co/blog/aws-kms-pricing-guide); [Parsivex](https://www.parsivex.com/blog/aws-kms-pricing-explained) (third party; check against the AWS pricing page)
- Twilio SMS Pumping Protection for Programmable Messaging analyzes traffic patterns and has a Global Safe List. Verify Fraud Guard plus Geo Permissions block suspicious OTP traffic. Verify's Italy and Argentina defaults moved to "Monitor" on 2026-08-19 — [Twilio SMS pumping protection](https://www.twilio.com/docs/messaging/features/sms-pumping-protection-programmable-messaging); [Twilio preventing messaging fraud](https://www.twilio.com/docs/messaging/guides/preventing-messaging-fraud); [Twilio changelog](https://www.twilio.com/en-us/changelog/Verify_Geo_Permission_Update)
- Twilio Lookup:
  - SIM Swap returns the last SIM change date and requires carrier approval; pricing is by carrier or contract.
  - Line Type Intelligence identifies VoIP, landline or mobile at $0.008 per request, and is used to block risky non-fixed VoIP signups.
  — [Twilio Lookup SIM Swap](https://www.twilio.com/docs/lookup/lookup-sim-swap); [Twilio Lookup pricing](https://www.twilio.com/en-us/user-authentication-identity/pricing/lookup); [Twilio blog: SIM swap](https://www.twilio.com/en-us/blog/sim-swap-fraud)
- Anthropic data retention:
  - ZDR is available by contacting sales, enabled per organization.
  - The Messages API and web search are ZDR-eligible. Batch, Files and Managed Agents are not.
  - HIPAA readiness with a BAA is self-serve for eligible organizations.
  — [Anthropic API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)

### Inferences (design)
- **OAuth tokens (Gmail, Calendar, QuickBooks)**
  - Envelope encryption: a per-user (or per-row) data key from KMS `GenerateDataKey`. Store the ciphertext token plus the wrapped DEK, decrypting only in the worker step that needs it.
  - Use encryption context `{user_id, provider}`, so a ciphertext copied to another row fails to decrypt.
  - Cache unwrapped DEKs briefly in memory to keep KMS calls cheap. At 245 calls/s with KMS on each, that is about 630M req/month, or about $1.9k/month uncached.
  - Request minimum scopes: for example `gmail.readonly` plus a separately consented send scope.
  - Refresh tokens never leave the backend. Revoke tokens on account deletion.
- **Secrets**
  - Use the platform secret store (Render/Railway env groups) early, then AWS Secrets Manager or Doppler. Never keep secrets in the JSON store or the repo.
  - Rotate the Twilio Auth Token, Anthropic key and Stripe restricted keys quarterly.
  - Use Stripe *restricted* keys limited to invoice scopes.
  - Separate Anthropic workspaces for prod, batch and evals.
- **Agent permissioning (LLM01/06/05/10)**
  - Classify tools as read, write-self (reminders, notes) or external-effect (send email, SMS to others, create invoice, payment).
  - External-effect tools require an out-of-band confirmation SMS ("Reply YES 4821 to send invoice $250 to Acme") whose text is generated from the *structured* tool arguments, not by the model.
  - Recipient allowlists (the user's contacts or prior correspondents). Per-day caps on outbound messages and invoice amounts per user.
  - Content from emails and web is wrapped and spotlighted as data, and can never trigger tool calls directly.
  - For the riskiest flows (reading email, then acting), use a quarantined LLM that only extracts typed fields, with a privileged planner that never sees raw email text (a CaMeL-lite approach).
  - LLM10: per-user token and spend budgets, plus a max of 12 iterations per run (already in place).
  - LLM07: put no secrets in the system prompt.
  - LLM02: redact PII before writing to the tracing store.
- **Authentication over SMS**
  - Phone number equals identity, so SIM swap equals account takeover.
  - Mitigations:
    - Lookup SIM Swap checks before sensitive actions (connecting OAuth, payments, changing an email address)
    - a step-up via email magic link or a passkey on the web dashboard for high-risk changes
    - Line Type checks to block VoIP signups
    - per-number and per-IP signup rate limits
    - geo-permissions restricted to US/CA
- **Abuse rate limiting**
  - A per-user inbound token bucket (for example 30 texts/hour).
  - A global circuit breaker on outbound volume per destination prefix (SMS pumping).
  - A Stripe Radar or velocity check before invoices are sent.
- **Retention, encryption and DR**
  - Encryption at rest is the managed-Postgres default. Add field-level encryption for tokens and sensitive memory.
  - Retention: message bodies 90–365 days via partition drops, audit logs at least 1 year (SOC 2 auditors typically look for that).
  - PITR plus daily snapshots copied cross-region. A quarterly restore drill.
  - Targets of RPO ≤5 min and RTO ≤4 h are reasonable for a solo founder.
- **Audit and testing**
  - An append-only `audit_log` (who, what tool, args hash, confirmation ID) written in the same transaction as the side effect.
  - An annual third-party pen test, including LLM red-teaming (promptfoo has OWASP-LLM presets).
  - A security.txt plus a private bug bounty (HackerOne or Intigriti) after SOC 2 Type I.

### Gaps
- Anthropic's own published prompt-injection defense guidance was not retrieved.
- There are no primary-source pen-test or bug-bounty prices.
- No exact SIM Swap API price (it is contract-based).
- No primary-source AWS KMS pricing page was fetched (the figures are from secondary sources that agree with each other).

---

## Q6. Compliance path: SOC 2 Type I to Type II, tools, cost and timeline, DPAs, Anthropic ZDR

### Takeaway
Budget about $10k–$25k/year for a compliance-automation platform plus about $5k–$25k per audit. The realistic all-in cost for year 1 (Type I, then Type II) is about $20k–$50k for a solo founder. Third-party totals of $45k–$70k include consultants. Anthropic ZDR is available on request (contact sales) and covers the Messages API and web search, but not Batch or Managed Agents.

### Cited Findings
- **Platform pricing (mostly third-party or affiliate sources, which disagree):**
  - Vanta: from about $10k/year (another source says $14k Essentials).
  - Drata: from $7.5k/year plus possible $10–25k onboarding.
  - Secureframe: Fundamentals from $7.5k/year (publicly listed).
  - Vendr medians: Vanta $20k (n=374), Secureframe $20k, Drata $25k (n=235).
  
  — [soc2auditors.org](https://soc2auditors.org/insights/soc-2-software-pricing-comparison/); [tech-insider](https://tech-insider.org/vanta-vs-drata-vs-secureframe-2026/); [cavanex](https://cavanex.com/blog/soc-2-compliance-platforms-compared-2026)
- **Delve:** "custom by plan". No public pricing was found — [getsecureslate](https://getsecureslate.com/blog/top-7-affordable-compliance-platforms-for-smart-compliance)
- **Audit fees:**
  - Vendr estimates $8k–$25k+ per SOC 2 audit.
  - A platform-partner Type I for an early-stage security-only scope is $2.5k–$7.5k.
  - A Type II is $12k–$25k.
  - Total year-1 cost is $45k–$70k including consulting.
  
  — [cavanex: SOC 2 cost](https://cavanex.com/blog/soc-2-compliance-cost-2026); [soc2auditors.org](https://soc2auditors.org/insights/soc-2-software-pricing-comparison/)
- A Type II report is "the entry ticket for enterprise buyers" — [secureleap](https://www.secureleap.tech/blog/soc-2-tools-vanta-drata-secureframe-guide-2025)
- **Anthropic data retention:**
  - Under ZDR, "Anthropic does not store customer prompts or responses at rest after the API response is returned". Request it via sales; it is enabled per organization.
  - Web search is ZDR-eligible. Batch is not.
  - Managed Agents transcripts persist until deleted.
  - Fable/Mythos "Covered Models" require 30-day retention.
  
  — [Anthropic API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)

### Inferences
- **Timeline for a solo founder (typical industry pattern; not sourced here):**
  - Months 0–2: implement controls with the platform (MDM on one laptop, SSO and MFA everywhere, policies, vendor inventory, access reviews, background check N/A, logging).
  - Month 2–3: Type I point-in-time audit.
  - Start a 3-month (minimum) Type II observation window immediately; Type II report around months 6–9.
  - Target Type I around the 10k-user stage (when enterprise or prosumer buyers or app-store partners ask), and Type II by about 100k.
- **Choosing a platform:** pick on auditor-bundle price and whether it integrates with the actual stack (AWS/Render, GitHub, Google Workspace). Secureframe and Drata publish entry pricing; get competing quotes.
- **Vendor DPAs and subprocessors to list:** Anthropic (Commercial Terms include a DPA; request ZDR), Twilio, Stripe, the hosting provider, the Postgres provider, Langfuse, and Google/Intuit as OAuth data sources.
  - Publish a subprocessor list and a privacy policy that discloses AI processing.
- **ZDR tradeoffs:** with ZDR, Batches and Managed Agents would be outside the arrangement, so route non-urgent work to the Messages API (losing the 50% discount) or accept retention for those workloads in a separate workspace or organization.

### Gaps
- I could not fetch the Anthropic, Twilio or Stripe DPA pages directly; the search returned nothing on DPAs. Confirm the current DPA URLs and terms on each vendor's legal page.
- There are no sourced Type I and Type II timelines; the timeline above reflects the common pattern but is not cited.
- Delve pricing is unknown.

---

## Q7. Incident response and status page for a one-person company

### Takeaway
I found no specific sources in this pass. The recommendations below are inferences grounded in the failure modes identified above.

### Cited Findings
- The failure signals to watch are documented:
  - Anthropic 429 (with or without `retry-after`), 529 overloads and the spend-cap 429 (`enforced_spend_limit_reached`) — [Anthropic errors](https://platform.claude.com/docs/en/api/errors); [Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)
  - Twilio account-level daily caps (20k/day before Business Profile approval) — [Twilio rate limits & queues](https://support.twilio.com/hc/en-us/articles/115002943027-Understanding-Twilio-Rate-Limits-and-Message-Queues)

### Inferences
- **Runbooks for the top incidents:**
  1. Anthropic outage or 529 storm: degrade models, send a holding SMS, keep the queue.
  2. Spend cap hit: raise the tier immediately, and keep a spend alert at 70/85/95% of cap.
  3. Twilio carrier filtering or daily cap: fail over senders in the Messaging Service.
  4. Database outage: queue keeps buffering, webhook still 200s.
  5. Suspected prompt-injection or OAuth compromise: a global kill-switch flag that disables all external-effect tools, plus bulk token revocation.
  6. SMS pumping: geo-block and pause signups.
- **Tooling:**
  - A hosted status page (Instatus, Better Stack or Atlassian Statuspage free tier) fed by synthetic checks: a test number texts Macoma every 5 minutes and expects a reply.
  - On-call paging to the founder's phone through a channel that does not depend on Twilio (for example a push app), to avoid shared fate.
- **Process:**
  - Severity definitions, a 72-hour breach-notification check (GDPR and state laws), a post-incident write-up template, and a quarterly tabletop exercise.
  - SOC 2 requires a documented incident-response plan and evidence that it was tested.

### Gaps
- No sources were gathered on status-page pricing, solo on-call practice or breach-notification timelines in this pass; these need verification.

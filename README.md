# Macoma

**The office manager you text.** Macoma is an AI assistant that lives in your messages. It's for anyone, and built especially for people who run a business from their phone. It remembers reorders, sends and chases invoices your customers pay with Apple Pay, follows up with leads, and tells your 2pm you're running late. There's no app to learn: you text it like a person, it drafts, and nothing reaches anyone until you reply **YES**.

> **Status:** the product is built and tested, and ready to deploy. Real US texting waits on carrier registration (toll-free or 10DLC), which takes about 1–3 weeks. Until then the site can run as a [waitlist](#before-launch-the-waitlist). Two things depend on outside approvals: Apple's business messaging channel and Stripe's agent payments (see [What's next](#whats-next)).

## Contents

1. [What owners text it](#what-owners-text-it)
2. [How it works](#how-it-works)
3. [Safety: the YES rule and other guardrails](#safety-the-yes-rule-and-other-guardrails)
4. [Run it locally](#run-it-locally)
5. [Put it online](#put-it-online)
6. [Choose the model: Claude or Grok](#choose-the-model-claude-or-grok)
7. [Connect other agents and assistants](#connect-other-agents-and-assistants)
8. [Payments and Apple Pay](#payments-and-apple-pay)
9. [Messaging channels](#messaging-channels)
10. [The website, workspace and dashboard](#the-website-workspace-and-dashboard)
11. [Scale](#scale)
12. [Tests](#tests)
13. [Project layout](#project-layout)
14. [Docs](#docs)
15. [What's next](#whats-next)

---

## What owners text it

| You text | What happens |
|---|---|
| "Tell my 2pm I'm running 15 late" | Macoma finds the job and address on your calendar and drafts the text. Reply **YES** to send it, signed with your business name. |
| "Invoice Dana $450 for the water heater flush, due Friday" | A draft invoice. After YES, Dana gets a link and pays with Apple Pay or a card. You hear when it's paid, and get nudged if it's late. |
| "Remind me to order copper fittings every other Monday" | A repeating reminder. |
| "If the Patel lead doesn't reply by Thursday, remind me" | A follow-up that's skipped if Patel texts back. |
| "Ask Grok to find three suppliers near me" | Sends the task to an agent you linked (for example a Grok bot on your VM) after your YES, and texts you the answer. |
| "Find me shears under $70 and set it up" | Prepares the purchase (merchant, item, total, link) within your limit. After YES you get the link and pay there with Apple Pay. |
| *(every morning)* | The **morning brief** (today, overdue invoices, quiet leads), plus drafts Macoma **prepared on its own**. Reply YES to send all, numbers to send some ("1 3"), or NO. |
| PLAN · MORE · UPGRADE · START NOW · CANCEL PLAN | Usage, buy a reply pack, change plan, end the trial early, stop renewal |
| CONNECT · LOG · HELP · STOP · START · DELETE MY DATA | Link accounts, see everything it did, help, opt out, opt back in, erase your account |

Customers' replies are passed to you. If a customer texts STOP, Macoma never texts them again, for any owner.

## How it works

```
 owner's phone ──SMS──▶ Twilio ──▶ /sms ─┐                   ┌─ web (ROLE=web): pages, sign-in,
 Stripe ─────────webhooks─────────▶ /stripe/* ─┤  verify +   │  webhooks, workspace, /admin,
                                         ├─ queue a job ─▶   │  /mcp, /a2a
                                         │   in Postgres     └──────────────────────────────
                                         ▼
                          workers (ROLE=worker): one job at a time per owner, in order
                          ├─ agent loop: Claude (default) or Grok (AI_PROVIDER=xai)
                          │    tools: reminders · contacts · drafts · invoices · calendar
                          │           web search · prepare_purchase · ask_agent · x402
                          ├─ the YES step: drafts wait for the owner's reply
                          └─ scheduler: reminders, morning brief, prepared drafts, trial notices
 outside:
  other agents ──A2A (x402-paid or capped)──▶ /a2a      (research only, no account access)
  owner's own tools ──MCP + personal key──▶ /mcp        (text the owner, reminders, drafts for YES)
  Macoma ──A2A + saved key──▶ owner's linked agents     (Grok on a VM, their server, Muse)
  Macoma ──Stripe Connect──▶ owner's Stripe             (invoices paid with Apple Pay)
```

- **Accounts** are one Postgres row each (a JSON document plus indexed columns). Every web request or job runs as a unit of work, and two changes to the same account at once are merged, never lost.
- **Webhooks** only verify and queue, so they answer in milliseconds. **Workers** can be scaled out freely.
- **Reminders** come from an indexed due-time column, so nothing scans every account.
- **Cost meter:** every model call and text is metered. An account's AI and SMS cost stays under 40% of what it pays; near that line Macoma switches to the cheaper model, and at the allowance it pauses and offers a reply pack.

## Safety: the YES rule and other guardrails

- **Nothing reaches another person without YES**: texts to contacts, invoices, web requests, messages to other agents, purchases. The owner approves the exact words the server wrote, not a model's paraphrase.
- A YES only counts for the draft Macoma texted last; otherwise it shows the draft again. "OK" isn't a yes.
- **Pre-approved texts** are opt-in (appointment confirmations and/or payment reminders), capped per day and listed in the morning text. Lead check-ins always wait.
- **Texting rules:** customer texts are signed with the business name, the first one includes opt-out instructions, nothing goes out between 9pm and 8am in the owner's time zone, and anyone can reply STOP. Consent records are kept.
- **Content from email, calendars, web pages and other agents is treated as data, not instructions.**
- **Outbound requests** only go to public HTTPS hosts, with no redirects followed.
- **Keys:** linked agents' keys are encrypted and only sent to the saved host. Personal MCP keys are stored as hashes and can be revoked.
- **Abuse limits:** sign-in codes only go to served countries, with per-IP, per-number and service-wide caps. Each number gets one free trial.
- **Spending:** purchases are capped per item (`PURCHASE_CAP_USD`), x402 per call and per day, and A2A has a daily cap.

## Run it locally

```bash
npm install
cp .env.example .env      # at minimum: ANTHROPIC_API_KEY (or the Grok settings, below)
npm run dev               # http://localhost:3000
```

No database or Twilio needed. Without `DATABASE_URL` it runs an embedded Postgres in `data/pg`, and without Twilio, texts print to the console, including the 6-digit sign-in code. To simulate an incoming text:

```bash
curl -X POST localhost:3000/sms -d 'From=+14155550100' -d 'Body=remind me to call the supplier at 3pm'
```

**API key:** create one at [console.anthropic.com](https://console.anthropic.com) (Billing → add payment, then API Keys). A Claude subscription doesn't include API access. Never paste keys into chat or code; `.env` is git-ignored.

## Put it online

The hour-by-hour plan is in **[docs/LAUNCH_DAY.md](docs/LAUNCH_DAY.md)**. In short:

1. **Deploy on Render:** New → Blueprint → this repo. [`render.yaml`](render.yaml) creates the web service, a worker and Postgres, and generates the secrets.
2. **Texting:** create a Twilio paid account and number, start **toll-free verification** right away (it takes weeks), and point the number at `POST {PUBLIC_URL}/sms`.
3. **Payments:** Stripe products for the three plans, two webhooks (`/stripe/webhook` for plans, `/stripe/connect-webhook` for owners' invoices), and Connect for owners. Apple Pay appears on Stripe's pages automatically.
4. **Connectors:** each one's redirect URI is `{PUBLIC_URL}/connect/<id>/callback`.

   | Connector | Status | Used for |
   |---|---|---|
   | Google Calendar, Outlook | At launch | The agenda, the morning brief, appointment confirmations |
   | Stripe | At launch | Invoices with Apple Pay |
   | Gmail, QuickBooks, Square | Connect at launch | No tools use them yet |

5. **Quality check:** run `npm run evals` (24 scenarios) before inviting anyone.

### Before launch: the waitlist

`LAUNCH_MODE=waitlist` turns the homepage into a waitlist. People get a spot in line and a share link, and `/admin` shows who wants Macoma: sign-ups per day, business types, what they'd hand off, plan picks, sources and top sharers, with a CSV export. It needs only Render and Postgres, with no AI, texting or payment keys. Switch to `live` on launch day.

## Choose the model: Claude or Grok

| | Claude (default) | Grok |
|---|---|---|
| Set | `ANTHROPIC_API_KEY`, `AGENT_MODEL`, `BUDGET_MODEL` | `AI_PROVIDER=xai`, `XAI_API_KEY`, `AGENT_MODEL`, `BUDGET_MODEL` (Grok ids), `MODEL_PRICES_JSON` |
| Web search | Built in | Set `BRAVE_SEARCH_API_KEY` to add it |
| Everything else | Same tools, YES step, cost meter, retries | Same |

On Grok, the server refuses to start without the key, both models and their prices, so the cost meter stays right. Run `npm run evals` on Grok before switching real users. Details: [docs/MODELS_AND_MCP.md](docs/MODELS_AND_MCP.md).

## Connect other agents and assistants

| What | How | Where |
|---|---|---|
| **Your own agent** (a Grok bot on your VM, your server, Muse) | Workspace → **Your agents**: name, A2A address, key. Then text "ask Grok to…". | [`src/linked-agents.ts`](src/linked-agents.ts) |
| **An agent server for any VM** | One file plus Docker and HTTPS. It puts Grok or any OpenAI-style model behind A2A with a key. | [`bridge/`](bridge/README.md) |
| **Your tools using Macoma (MCP)** | Workspace → **API keys & MCP**. Connect any MCP client to `{PUBLIC_URL}/mcp`. | [`src/mcp.ts`](src/mcp.ts) |
| **Other agents calling Macoma (A2A)** | Agent card at `/.well-known/agent-card.json`, `message/send` at `/a2a`. Off unless x402-paid or `A2A_FREE=true`. | [`src/a2a.ts`](src/a2a.ts) |

**MCP tools:**
- `text_me` (up to 20 a day);
- `add_reminder`, `list_reminders`, `list_contacts`, `save_contact`, `list_invoices`, `get_brief`;
- `draft_text_to_contact` and `draft_invoice`, which go to the owner for YES.

Keys can't pay, delete or send to customers on their own. Example with Claude Code:

```bash
claude mcp add --transport http macoma https://YOUR-SITE/mcp --header "Authorization: Bearer mk_…"
```

Or in an MCP client config:

```json
{ "mcpServers": { "macoma": { "type": "http", "url": "https://YOUR-SITE/mcp", "headers": { "Authorization": "Bearer mk_…" } } } }
```

You don't need LangChain or LangGraph. The agent loop is Macoma's own, and the job queue handles the multi-step, wait-for-YES work they'd otherwise provide.

## Payments and Apple Pay

| Flow | How |
|---|---|
| **Plans** (Personal $19 · Business $59 · Crew $149, 14-day or 100-reply trial) | Stripe Checkout, with Apple Pay shown automatically. One trial per number. |
| **Owners getting paid** | Stripe Connect. The customer pays the owner's invoice with Apple Pay, the money goes to the owner, and Macoma's fee (1% on Business, 0.5% on Crew) is taken automatically. |
| **Buying for the owner** | `prepare_purchase`: merchant, item, total and link within the owner's limit. After YES, the owner pays with Apple Pay. |
| **Paying for agent services** | x402 (USDC), capped per call and per day. |

**Apple Pay always needs the person's Face ID or Touch ID.** AI can prepare a payment but never approve one. One-time agent credentials (Stripe's Shared Payment Tokens and Issuing for agents) plug into the marked spot in `confirmPending` once Stripe grants access. See [docs/AGENTS_AND_PAYMENTS.md](docs/AGENTS_AND_PAYMENTS.md).

## Messaging channels

| Conversation | Channel | Apple Pay |
|---|---|---|
| Owner ↔ Macoma on iPhone | **Apple Messages for Business** (planned): blue bubble, verified logo | **In the chat**, with Face ID. For plans and reply packs. |
| Owner ↔ Macoma elsewhere | SMS today, RCS next | A link to Stripe's page |
| Macoma → owners' customers | SMS today, RCS next | A link to the invoice page |

Apple's channel requires the customer to start the conversation, registration with Apple, an Apple-approved messaging provider, and an Apple Pay merchant ID. Plan and sources: [docs/MESSAGING_AND_APPLE_PAY.md](docs/MESSAGING_AND_APPLE_PAY.md).

## The website, workspace and dashboard

- **Homepage** (`public/index.html`), in a liquid-glass look:
  - the scroll story;
  - **Use cases**, with three short films: home, trades, business;
  - **How you use it**;
  - **Connections & linkups**, with each connector's status;
  - pricing;
  - sign-up, or the waitlist.
- **Sign-in** (`/signin`): a phone number and a 6-digit code.
- **Workspace** (`/workspace`):
  - how to reach Macoma, and your plan;
  - connectors, **your agents**, **API keys & MCP**;
  - data privacy;
  - Vault, People;
  - Preferences, including prepared drafts and pre-approved texts;
  - Invite.
- **Dashboard** (`/admin`, with `OPS_TOKEN`): waitlist interest and the CSV export.
- **Films** (`media/`): three commercial-style films rendered from HTML with `node media/render.mjs <home|trade|business>`. 720p copies are in `public/media/`.

## Scale

Tested with **1,000,000 accounts** on Postgres 16, on one 4-core machine, with a stand-in model:

| Test | Result |
|---|---|
| Incoming texts | 830 a second accepted |
| Replies | 122 a second from one worker process |
| Reminders | 100,000 due at once, all sent in 70 seconds |
| Mistakes | 0 lost, duplicated or out-of-order replies |

```bash
DATABASE_URL=postgres://… ROLE=web npm start      # several, behind the load balancer
DATABASE_URL=postgres://… ROLE=worker npm start   # several; they share the queue
```

Sizing, process layout and what to buy at each size: [docs/CAPACITY.md](docs/CAPACITY.md). The stage-by-stage plan to 1M users: [docs/SCOPE_OF_WORK.md](docs/SCOPE_OF_WORK.md).

## Tests

```bash
npm run typecheck          # TypeScript
npm run test:store         # 11 checks: merges, queue order, scheduler, prepared drafts, pre-approval, purchases
npm run evals              # 24 agent scenarios against the real model (about $2)
npm run load-test          # many owners at once with a stand-in model (use a scratch database)
```

Add `DATABASE_URL=postgres://…` to run `test:store` against real Postgres. Use a scratch database: the tests add rows with fake numbers.

## Project layout

```
src/
  server.ts         web routes, webhooks → queue, startup (ROLE, LAUNCH_MODE, model checks)
  inbound.ts        owner texts, keywords, the YES step, customer replies, job handlers
  agent.ts          the agent loop (Claude or Grok), tools, prompt, metering
  business.ts       contacts, drafts, invoices, reminders, bundles, purchases, the action log
  proactive.ts      morning "prepared for you" drafts
  scheduler.ts      due-time index, reminders, brief, pre-approved sends
  billing.ts        plans, trial, cost meter and margin rule, Stripe Checkout and webhooks
  connectors.ts     OAuth connectors, sealed tokens, sessions, calendar
  workspace.ts      the signed-in workspace API
  linked-agents.ts  owners' own agents over A2A
  mcp.ts            MCP server and personal API keys
  a2a.ts · x402.ts  agent-to-agent protocol and agent payments
  waitlist.ts       pre-launch waitlist and dashboard API
  store.ts · db.ts · queue.ts   Postgres store, units of work, job queue, rate limits
  sms.ts · netguard.ts · stripeClient.ts
public/             website, sign-in, workspace, admin, legal drafts, films
bridge/             agent server for your own VM (A2A → Grok or any OpenAI-style model)
media/              film engine and renderer
scripts/            evals, store tests, load test, waitlist sample data
docs/               plans and guides (below)
```

## Docs

| Doc | What's in it |
|---|---|
| [LAUNCH_DAY.md](docs/LAUNCH_DAY.md) | Put it online in a day: keys, connectors, Stripe and Apple Pay, the waitlist |
| [SCOPE_OF_WORK.md](docs/SCOPE_OF_WORK.md) | Scope, feature status, stages from beta to 1M users |
| [CAPACITY.md](docs/CAPACITY.md) | Design for scale, load-test results, sizing |
| [MODELS_AND_MCP.md](docs/MODELS_AND_MCP.md) | Claude or Grok, the MCP server, background work and pre-approval |
| [AGENTS_AND_PAYMENTS.md](docs/AGENTS_AND_PAYMENTS.md) | Linked agents, the VM bridge, how AI gets paid and pays |
| [MESSAGING_AND_APPLE_PAY.md](docs/MESSAGING_AND_APPLE_PAY.md) | Apple Messages for Business, SMS, RCS, and where Apple Pay works |
| [bridge/README.md](bridge/README.md) | Run your own agent on a VM |
| [media/README.md](media/README.md) | The films and how to re-render them |
| [moat.md](docs/moat.md) · [requirements.md](docs/requirements.md) | Strategy, and requirements based on Instinct's terms |
| `reports/` | The launch and scale playbook (research) |

## What's next

| Item | Waiting on |
|---|---|
| Real US texting | Twilio toll-free or 10DLC approval (start now) |
| Apple Messages for Business, with Apple Pay in the chat | Apple Business Register approval and your choice of messaging provider; then the channel adapter gets built |
| AI paying with one-time credentials | Stripe access to Shared Payment Tokens and Issuing for agents |
| Gmail, QuickBooks and Square tools | Google's security review and Intuit's production review; then the tools get built |
| RCS for customer texts | Carrier and brand approval |
| Legal pages | A lawyer's review of `/terms`, `/privacy`, `/sms-terms` |

All configuration is documented in [`.env.example`](.env.example).

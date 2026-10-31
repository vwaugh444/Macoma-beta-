# Macoma

**The office manager you text.** Macoma is an AI assistant that lives in your messages. Anyone can use it. It's built especially for people who run a business from their phone and need help remembering to reorder supplies, send and chase invoices, follow up with leads and customers, and text a client when they're running late.

There's no app and no dashboard. The website is a single field: you enter your number, verify it with a code, the agent texts you, and you get an invite link to share.

- Strategy and moat: [`docs/moat.md`](docs/moat.md)
- Requirements, using Instinct's terms as the baseline: [`docs/requirements.md`](docs/requirements.md)
- **Scope of work and step-by-step plan: [`docs/SCOPE_OF_WORK.md`](docs/SCOPE_OF_WORK.md)**
- Draft legal pages: `/terms`, `/privacy` and `/sms-terms`, served from `public/`

## What owners text it

| Text | What happens |
|---|---|
| "Remind me to order cups every other Monday at 9" | A repeating reorder reminder |
| "Tell my 2pm (Dana) I'm running 15 late" | A drafted text to Dana. **Reply YES** to send it, signed with your business name |
| "Invoice Dana $450 for the deck stain, due Friday" | A draft invoice. Reply YES and Dana gets a Stripe or payment link. You're nudged if it's late and told when it's paid |
| "If the Patel lead doesn't reply by Thursday, remind me" | A follow-up that's skipped automatically if Patel texts back |
| (8am every day) | Morning brief: today's reminders, overdue invoices, leads that went quiet |
| LOG / HELP / STOP / START / DELETE MY DATA | Action log, help, opt out, opt back in, erase your account |

When a customer replies to a text Macoma sent, the reply is passed to the owner. If a customer texts STOP, Macoma won't text them again for any owner.

Under the hood the agent:

- **Runs on Claude** with web search, memory, owner tools (`src/business.ts`) and a scheduler (`src/scheduler.ts`).
- **Speaks A2A** (Agent2Agent protocol). It publishes an Agent Card at `/.well-known/agent-card.json` and answers JSON-RPC `message/send` at `/a2a`. It can also call other A2A agents (`ask_agent` tool).
- **Uses x402 in both directions.** It pays for HTTP 402 APIs and paid agents from its own USDC wallet, within a per-call limit and a daily budget for each user. It can also charge other agents per A2A call.

```
 phone ──SMS──▶ Twilio ──webhook──▶ /sms ──▶ agent loop (Claude)
                                               ├─ web_search
                                               ├─ pay_and_fetch ──x402──▶ paid APIs
                                               ├─ ask_agent ─────A2A────▶ other agents
                                               └─ remember / share_link
 other agents ──A2A (+x402 payment)──▶ /a2a ──▶ agent loop (research-only tools)
```

## Before you start: get an Anthropic API key

Macoma calls Claude through the Anthropic API, so it needs its own API key.

- **A Claude subscription doesn't include API access.** Plans like Pro or Max on claude.ai are billed separately from the API.
- **A connected assistant doesn't count either.** Having another assistant such as Muse connected to your Claude account gives Macoma nothing to use.

To get a key:

1. Sign in at [console.anthropic.com](https://console.anthropic.com).
2. Add a payment method under **Billing**. The API is billed per use.
3. Go to **API Keys**, click **Create Key**, and copy it. It starts with `sk-ant-`.
4. Put it in `.env` as `ANTHROPIC_API_KEY=sk-ant-...`. On a hosted server, add it to the host's environment settings instead.

Never paste the key into chat, GitHub, or code files. `.env` is already in `.gitignore`.

## Working on Macoma with a coding agent

You don't need a terminal to keep building Macoma. Claude Code on the web or in the Claude app can change this repo and push the changes for you. To work on your own computer instead, install Claude Code with `npm install -g @anthropic-ai/claude-code`, then run `claude` in this folder. To drive that computer session from your phone, run `/remote-control`.

## LangGraph / LangChain

You don't need them. `src/agent.ts` already runs the agent loop: it calls Claude, runs the tools, and repeats until the task is done.

LangGraph would only be useful for long multi-step processes that pause and pick up again over days, like "wait for the customer's reply, then send the invoice." In that case, LangGraph would replace the loop in `src/agent.ts` and reuse the functions in `src/business.ts` as its tools.

## Connecting other assistants (Muse, Claude, etc.)

Other AI agents can already reach Macoma over A2A (see below). Assistants that only support MCP servers, which Meta's Muse reportedly does, would need an MCP endpoint. That endpoint isn't built yet. It's planned and would expose Macoma's tools, like set a reminder or send an invoice.

## Run it locally (no Twilio needed)

```bash
npm install
cp .env.example .env        # set ANTHROPIC_API_KEY at minimum
npm run dev
```

No database to install: without `DATABASE_URL` it runs an embedded Postgres in `data/pg`. With Twilio left blank, texts the agent sends are printed to the console, including the 6-digit sign-in code. To simulate an incoming text:

```bash
curl -X POST localhost:3000/sms -d 'From=+14155550100' -d 'Body=find me a ramen spot near union square'
```

## Make it real

1. **Twilio number.** Buy an SMS-capable number. For US texting, register it for A2P 10DLC (or use a verified toll-free number). Without registration, carriers block messages.
2. **Public URL.** Deploy the server (Fly, Railway, Render) or run `ngrok http 3000`. Set `PUBLIC_URL` to the exact public URL, because Twilio signature checks depend on it.
3. **Webhook.** In the Twilio number's settings, set "A message comes in" to `POST {PUBLIC_URL}/sms`.
4. **Fill in `.env`** with the Twilio SID, auth token and number.
5. Open the site, enter your number, and reply to the text.

### Stripe invoices (optional)

Set `STRIPE_SECRET_KEY`. Add a platform webhook (`{PUBLIC_URL}/stripe/webhook`) for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `customer.subscription.*`, and a Connect webhook (`{PUBLIC_URL}/stripe/connect-webhook`) for `invoice.paid`. Put their signing secrets in `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`. Without Stripe, invoices link to the owner's own payment link (Square, Venmo, PayPal...). The owner can set it by texting it to Macoma.

### x402 setup

- **Let the agent pay.** Generate a new testnet key, set `AGENT_WALLET_PRIVATE_KEY`, and fund the wallet with Base Sepolia USDC from a faucet. Each user has a spending limit of `MAX_SPEND_PER_CALL_USD` per call and `DAILY_BUDGET_USD` per day. Before paying, the agent reads the endpoint's price from its 402 response.
- **Charge other agents.** Set `X402_PAY_TO` to your receiving address and `A2A_PRICE`, for example `$0.01`. Calls to `POST /a2a` then return 402 until they're paid. (Without either this or `A2A_FREE=true`, the A2A endpoint is off.)
- Switch to mainnet with `X402_NETWORK=eip155:8453` and a mainnet facilitator.

### Try A2A

```bash
curl localhost:3000/.well-known/agent-card.json
curl -X POST localhost:3000/a2a -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"message/send",
  "params":{"message":{"kind":"message","role":"user","messageId":"1","parts":[{"kind":"text","text":"Summarize today'\''s top AI news in 3 lines"}]}}}'
```

Or text your agent: "ask the agent at https://some-agent.example.com to …"

## Before launch: waitlist mode

With `LAUNCH_MODE=waitlist` the homepage ends in a waitlist instead of sign-up. People get a place in line and a share link, and `/admin` shows who wants Macoma and why, with a CSV export. It needs only a database, with no AI, texting or payment keys. See the top of [docs/LAUNCH_DAY.md](docs/LAUNCH_DAY.md).

## Put it online in a day

[docs/LAUNCH_DAY.md](docs/LAUNCH_DAY.md) is the hour-by-hour plan. It covers the API keys to get, every connector's console steps and callback URL, Stripe checkout with Apple Pay in test mode, and a one-click Render deploy from `render.yaml`.

## Grok or Claude, MCP, and background drafts

- **Run on Grok:** set `AI_PROVIDER=xai` with your xAI key, two Grok model ids and their prices. The tools, YES step and cost meter stay the same. Run `npm run evals` on Grok before switching users.
- **MCP isn't needed** to run Macoma. It's how other assistants could use Macoma's tools later.
- **Prepared for you:** each morning Macoma drafts overdue-invoice reminders, lead check-ins and appointment confirmations, held for one YES (or "1 3" to send some).

Details: [docs/MODELS_AND_MCP.md](docs/MODELS_AND_MCP.md). Linking your own agents (a Grok bot on your VM) and how AI pays: [docs/AGENTS_AND_PAYMENTS.md](docs/AGENTS_AND_PAYMENTS.md).

## Running at scale

Macoma is built to run for 500,000 owners on Postgres with separate web and worker processes. Webhooks only queue work, and workers handle each owner's texts one at a time and in order. Reminders come from an index, so nothing scans every account. See [docs/CAPACITY.md](docs/CAPACITY.md) for the design, the load-test results and the sizing.

```bash
DATABASE_URL=postgres://… ROLE=web npm start      # pages, sign-in, webhooks
DATABASE_URL=postgres://… ROLE=worker npm start   # jobs, agent, reminders (run several)
npm run test:store                                # concurrency and queue checks
npm run load-test                                 # many owners at once, stand-in model
```

## Config

All configuration is in `.env.example`. `INVITE_ONLY=true` makes a friend's link a requirement for joining.

## Notes

- Storage is Postgres (`DATABASE_URL`), or an embedded copy in `data/pg` for development. An old `data/db.json` is imported once on first start.
- Signing up is limited to 10 attempts per IP and 3 codes per number per hour, plus a service-wide hourly cap. Codes go only to `OTP_COUNTRY_CODES` (US/Canada by default), so the form can't be used to spam strangers or pump premium-rate texts.
- Each number gets one free trial. A hash of the number is kept after deletion so delete-and-rejoin doesn't reset it.
- Texts to customers, invoices, web requests and messages to other agents all wait for the owner's YES to the exact draft. A YES only counts if the draft was the last thing Macoma texted.
- Consent records (time, method, terms version) are kept even after an account is deleted.
- Before launch: register with carriers (A2P 10DLC or toll-free verification), have a lawyer review the legal pages, and add billing. See `docs/requirements.md`.
- Agents calling over A2A get research tools only. They can't use the wallet or read user memory. A2A is off unless it's paid (x402) or `A2A_FREE=true`, and it has a daily spend cap.

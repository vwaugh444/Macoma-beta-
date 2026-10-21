# Macoma

A personal AI agent you reach by text. There's no app and no dashboard. The website is a single field: you enter your phone number, the agent texts you first, and you get an invite link to share.

Under the hood the agent:

- **Runs on Claude** with web search, memory and a tool-use loop (`src/agent.ts`).
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

## Run it locally (no Twilio needed)

```bash
npm install
cp .env.example .env        # set ANTHROPIC_API_KEY at minimum
npm run dev
```

With Twilio left blank, texts the agent sends are printed to the console. To simulate an incoming text:

```bash
curl -X POST localhost:3000/sms -d 'From=+14155550100' -d 'Body=find me a ramen spot near union square'
```

## Make it real

1. **Twilio number.** Buy an SMS-capable number. For US texting, register it for A2P 10DLC (or use a verified toll-free number). Without registration, carriers block messages.
2. **Public URL.** Deploy the server (Fly, Railway, Render) or run `ngrok http 3000`. Set `PUBLIC_URL` to the exact public URL, because Twilio signature checks depend on it.
3. **Webhook.** In the Twilio number's settings, set "A message comes in" to `POST {PUBLIC_URL}/sms`.
4. **Fill in `.env`** with the Twilio SID, auth token and number.
5. Open the site, enter your number, and reply to the text.

### x402 setup

- **Let the agent pay.** Generate a new testnet key, set `AGENT_WALLET_PRIVATE_KEY`, and fund the wallet with Base Sepolia USDC from a faucet. Each user has a spending limit of `MAX_SPEND_PER_CALL_USD` per call and `DAILY_BUDGET_USD` per day. Before paying, the agent reads the endpoint's price from its 402 response.
- **Charge other agents.** Set `X402_PAY_TO` to your receiving address and `A2A_PRICE`, for example `$0.01`. Calls to `POST /a2a` then return 402 until they're paid.
- Switch to mainnet with `X402_NETWORK=eip155:8453` and a mainnet facilitator.

### Try A2A

```bash
curl localhost:3000/.well-known/agent-card.json
curl -X POST localhost:3000/a2a -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"message/send",
  "params":{"message":{"kind":"message","role":"user","messageId":"1","parts":[{"kind":"text","text":"Summarize today'\''s top AI news in 3 lines"}]}}}'
```

Or text your agent: "ask the agent at https://some-agent.example.com to …"

## Config

All configuration is in `.env.example`. `INVITE_ONLY=true` makes a friend's link a requirement for joining.

## Notes

- Storage is a JSON file in `data/`. Use a real database before you have real users.
- The join endpoint allows 5 attempts per IP per hour. This stops people from using the form to send texts to strangers' numbers.
- Agents calling over A2A get research tools only. They can't use the wallet or read user memory.

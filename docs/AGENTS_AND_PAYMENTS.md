# Your own agents, and AI that can pay

Two questions:
1. How do users connect their own agent, such as a Grok bot or an agent on their own VM, and use it from Macoma?
2. How can AI get paid through Stripe and Apple Pay, and spend on the owner's behalf safely?

Status as of October 2026. The Stripe agent-payment details come from search results, mostly third-party write-ups, because Stripe's own pages couldn't be opened from the session that wrote this. Check docs.stripe.com before building on them.

---

## Part 1: Your own agent on a VM

### What's built

| Direction | How | Status |
|---|---|---|
| **Macoma → your agent** | Workspace → **Your agents**: name, A2A address and an optional key. Text "ask Grok to…". Macoma shows the exact message, you reply YES, and the answer comes back as a text. | ✅ Built (`src/linked-agents.ts`) |
| **The agent on your VM** | `bridge/`: one file plus Docker and Caddy. It puts Grok (xAI's OpenAI-compatible API) or any OpenAI-style model behind A2A, with a bearer key and short conversation memory. | ✅ Built (`bridge/README.md`) |
| **Other agents → Macoma** | `POST /a2a` with an agent card. Research tools only, no access to anyone's account; paid via x402 or capped when free. | ✅ Built |
| **Your agent → you, through Macoma** | Your VM agent texts you ("your order shipped") or adds a reminder, with a per-user key. | 🔴 Not built. It needs per-user A2A keys and a scope list (what an outside agent may do on an account). |

### Safety built in

- Linking checks the agent's card and its key with a request that does no work. A wrong key fails at setup, not mid-task.
- The key is stored encrypted and is only sent to the host the owner saved. If the agent's card later points somewhere else, Macoma refuses to send it.
- Only public HTTPS addresses, no redirects, and up to 10 agents per account.
- Every message to an outside agent waits for the owner's YES to the exact words.

### Set it up

Follow `bridge/README.md`:
1. Get a VM and point a domain at it.
2. Fill in `.env` (xAI key, model id, a random key).
3. Run `docker compose up -d`.
4. Link the agent in the workspace.

For an agent that operates a browser on the VM (filling forms, placing orders), replace the bridge's `think()` function. Everything else stays the same.

---

## Part 2: AI and payments

### Getting paid (the owner is the seller): built

- The owner connects their own Stripe account (Connect). Macoma drafts the invoice, the owner replies YES, and the customer gets a link to Stripe's hosted page.
- The customer pays with **Apple Pay** or a card. The money goes to the owner's Stripe account, and Macoma's 1% fee is taken automatically.
- Macoma texts the owner when it's paid. No Apple developer account is needed: Stripe shows Apple Pay on its hosted pages.

### The AI paying for something (the owner is the buyer)

**Apple Pay can't be pressed by an AI.** Every Apple Pay payment needs the owner's Face ID or Touch ID on their own device. That's by design, and nothing in Apple Pay lets an agent approve on its own. So there are three practical patterns, from available today to emerging:

| Pattern | How it works | Available |
|---|---|---|
| **1. AI prepares, you tap** | The agent finds the item and the merchant and texts you the checkout link. You pay with Apple Pay. | Today, at any merchant. Macoma can do this now (it's just a link). |
| **2. Scoped one-time credentials** | You approve one purchase (merchant, amount). The agent gets a credential that only works for that purchase:<br>• Stripe's **Shared Payment Tokens** (from the Agentic Commerce Protocol, ACP), with merchants on Stripe's Agentic Commerce Suite;<br>• a single-use card from Stripe's **Issuing for agents**;<br>• the agent wallet in Stripe's **Link**, where you approve in the Link app. | Reported as public or private **preview** during 2026. Apply to Stripe for access. |
| **3. Micro-payments for agent services** | A few cents to an API or another agent, in USDC, over x402, inside per-task and daily caps. | ✅ Built (`pay_and_fetch`) |

Card networks are adding their own versions of pattern 2: Mastercard Agent Pay (agentic tokens), Visa's Trusted Agent Protocol and Google's AP2 mandates. Processors like Stripe wrap these, so building on Stripe covers them.

### The recommended buy flow, once Stripe's agent features are enabled on your account

```
owner: "reorder 2 boxes of ½" copper fittings from Ferguson"
Macoma: finds the item and price (web search, the merchant's checkout via ACP, or a browser agent on your VM)
Macoma: "Buy 2 × ½" copper fittings from Ferguson, $64.18 total. Reply YES to pay with your saved card."
owner: YES   (plus approval in the Link app if the wallet asks)
Macoma: gets a one-time credential capped at $64.18 for that merchant
        → completes checkout (ACP if the merchant supports it, otherwise the browser agent)
        → texts the receipt and logs it (LOG)
```

Rules to keep, whatever the provider:
- **One YES per purchase**, showing the exact merchant, item and total.
- **Caps:** per purchase and per day, set by the owner. Start low, around $100 a purchase and $250 a day.
- **Merchant allowlist** for anything recurring.
- **Credentials that are useless afterwards.** Never store a card number. Use one-time tokens or cards scoped to the amount and merchant.
- **Macoma never holds the money.** Funds move between the owner's payment method and the merchant through Stripe, which keeps Macoma out of money-transmitter licensing. Have your lawyer confirm this for your exact flow.

### What to do next

1. Ask Stripe for access to the **Agentic Commerce Suite / Shared Payment Tokens** and **Issuing for agents** (or the Link agent wallet) on your account.
2. Once you have access, Macoma gets a `buy` action built on the flow above. It plugs into the same YES step, caps and LOG already used for texts and invoices.
3. Until then, use pattern 1 (AI prepares, you tap Apple Pay) for purchases, and x402 for small paid lookups.

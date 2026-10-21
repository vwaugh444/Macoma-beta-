# Macoma: Scope of Work and Feature Steps

Status as of 2026-10-21. Branch `claude/eager-lamport-2v7kc5`.

**Legend**

| Mark | Meaning |
|---|---|
| ✅ | Built and tested locally |
| 🟡 | Built but not tested with real services |
| 🔴 | Not built |
| **YOU** | A step only you can do: create accounts, sign up, pay, make decisions |
| **BUILD** | A code step (you or a developer or Claude can do it) |

---

## Index

1. [Scope of work](#1-scope-of-work)
2. [Feature status at a glance](#2-feature-status-at-a-glance)
3. [Phase 0: Run it on your computer](#3-phase-0-run-it-on-your-computer)
4. [Phase 1: Real texting (MVP launch)](#4-phase-1-real-texting-mvp-launch)
   - 4.1 [Claude agent](#41-claude-agent)
   - 4.2 [Twilio number and carrier registration](#42-twilio-number-and-carrier-registration)
   - 4.3 [Hosting and domain](#43-hosting-and-domain)
   - 4.4 [Sign-up, consent and SMS keywords](#44-sign-up-consent-and-sms-keywords)
   - 4.5 [Legal pages](#45-legal-pages)
   - 4.6 [Database](#46-database)
5. [Phase 2: Business owner features (the moat)](#5-phase-2-business-owner-features-the-moat)
   - 5.1 [Reminders, reorders and morning brief](#51-reminders-reorders-and-morning-brief)
   - 5.2 [Texting customers ("running late", follow-ups)](#52-texting-customers-running-late-follow-ups)
   - 5.3 [Invoices and getting paid](#53-invoices-and-getting-paid)
   - 5.4 [Billing and plans](#54-billing-and-plans)
6. [Phase 3: Agent economy (x402 and A2A)](#6-phase-3-agent-economy-x402-and-a2a)
   - 6.1 [x402 agent wallet](#61-x402-agent-wallet)
   - 6.2 [A2A: other agents talk to Macoma](#62-a2a-other-agents-talk-to-macoma)
7. [Phase 4: Next features](#7-phase-4-next-features)
8. [Launch checklist](#8-launch-checklist)
9. [Accounts and costs](#9-accounts-and-costs)
10. [Where everything lives in the code](#10-where-everything-lives-in-the-code)

---

## 1. Scope of work

**Goal:** A personal AI assistant people reach by text message. Anyone can use it, but it's built especially for business owners who run their business from their phone.

### In scope

| Area | Deliverable |
|---|---|
| Website | A single page: phone number, age and terms checkboxes, 6-digit code, invite link. Plus Terms, Privacy and SMS terms pages |
| Texting | The agent texts and replies over SMS. STOP, START, HELP, YES/NO, LOG and DELETE MY DATA keywords |
| AI agent | Claude with web search, memory, and owner tools |
| Business tools | Contacts, reminders, reorders, follow-ups, "running late" texts, invoices, morning brief |
| Safety | Nothing reaches a customer without the owner's YES; action log; quiet hours; opt-outs; consent records |
| Payments | Invoices through Stripe or the owner's own payment link; x402 agent wallet with spending caps |
| Agent-to-agent | A2A agent card and endpoint, optionally paid with x402 |
| Growth | Invite links that track referrals |

### Out of scope for now
- A mobile app or a web dashboard (by design, there's no interface)
- Voice calls
- Email inbox and calendar access (Phase 4)
- QuickBooks or Square syncing (Phase 4)
- Running payments for customers ourselves (Stripe handles it)
- Countries outside the US and Canada

### Done means
- A new user can sign up from the website or by texting the number, and get a reply in under 30 seconds.
- An owner can set a reminder, text a customer after approving, send an invoice, and get paid, all by text.
- The number is registered with carriers, the legal pages have been reviewed by a lawyer, and data is in a real database.

---

## 2. Feature status at a glance

| # | Feature | Status | Blocking item |
|---|---|---|---|
| 1 | Landing page + one-time code sign-up | ✅ | none |
| 2 | Consent records, STOP/START/HELP | ✅ | none |
| 3 | Claude agent replies | 🟡 | Needs your Anthropic API key to test |
| 4 | Real SMS (Twilio) | 🟡 | Twilio account and carrier registration |
| 5 | Reminders, reorders, repeating reminders | ✅ logic / 🟡 live | Watch one fire on a real server |
| 6 | Morning brief | 🟡 | Watch one fire on a real server |
| 7 | Texting customers with YES approval | ✅ | none |
| 8 | Customer replies sent to the owner; customer STOP | ✅ | none |
| 9 | Invoices with payment link | ✅ | none |
| 10 | Invoices through Stripe + paid alert | 🟡 | Stripe account to test |
| 11 | x402 agent wallet | 🟡 | Funded testnet wallet |
| 12 | A2A endpoint (free / paid) | ✅ free / 🟡 paid | Server that can reach x402.org |
| 13 | Legal pages | 🟡 drafts | Lawyer review |
| 14 | Database (Postgres) | 🔴 | Build |
| 15 | Billing and plans | 🔴 | Build |
| 16 | Daily message cap per user | 🔴 | Build |
| 17 | Calendar, supplier ordering, QuickBooks | 🔴 | Phase 4 |

---

## 3. Phase 0: Run it on your computer

**Time: about 30 minutes.**

1. **YOU:** Install Node.js 20 or newer from nodejs.org.
2. **YOU:** Get the code:
   ```bash
   git clone https://github.com/vwaugh444/Macoma-beta-.git
   cd Macoma-beta-
   git checkout claude/eager-lamport-2v7kc5
   npm install
   cp .env.example .env
   ```
3. **YOU:** Get an Anthropic API key at console.anthropic.com, then paste it into `.env` as `ANTHROPIC_API_KEY=`.
4. **YOU:** Start the server with `npm run dev`, then open http://localhost:3000.
5. **YOU:** Sign up with any number. The 6-digit code appears in the terminal, since texts are printed there until Twilio is connected.
6. **YOU:** Pretend to text the agent:
   ```bash
   curl -X POST localhost:3000/sms -d 'From=+14155550100' -d 'Body=Remind me to order cups every other Monday at 9am'
   ```
   The agent's reply appears in the terminal.

**Done when:** the agent answers your test texts in the terminal.

---

## 4. Phase 1: Real texting (MVP launch)

### 4.1 Claude agent
Status 🟡. Code: `src/agent.ts`

1. **YOU:** Complete Phase 0 with a real API key.
2. **YOU:** Try each of these test texts and check the reply makes sense:
   - "Hi, I'm Vic, I run Waugh Painting, I'm in Chicago"
     - Expected: it saves your name, business and timezone.
   - "Add Dana Lee, customer, +15125550111"
   - "Tell Dana I'm running 15 late"
     - Expected: it shows a draft and asks for YES.
   - Reply "YES"
     - Expected: the message to Dana is printed in the terminal.
   - "Invoice Dana $450 for deck stain due in 5 days"
     - Expected: it asks for a payment link if Stripe isn't set up.
3. **BUILD:** If replies are too slow over SMS, set `AGENT_EFFORT=low` in `.env`.
4. **BUILD:** Tune the wording in the `SYSTEM` prompt in `src/agent.ts` until it sounds like your brand.

**Done when:** all of the test texts above behave as expected.

### 4.2 Twilio number and carrier registration
Status 🟡. Code: `src/sms.ts`. **This is the longest wait (1–3 weeks), so start it first.**

1. **YOU:** Create a Twilio account and upgrade it from trial, because trial accounts can only text verified numbers.
2. **YOU:** Buy a US local number with SMS (about $1.15 per month).
3. **YOU:** Register for **A2P 10DLC** in the Twilio console:
   - Brand: your business's legal name and EIN (sole proprietor registration is possible but has limits).
   - Campaign type: "Mixed" or "Customer Care".
   - Campaign description: "AI assistant that users text for reminders, invoices and customer follow-ups."
   - Opt-in description: copy the consent text from the website checkbox (`public/index.html`) **exactly**, and include your website URL.
   - Sample messages: use the welcome text, a reminder, and a "running late" text.
   - Opt-out/help: STOP and HELP (already built in).
   - Alternative: register a toll-free number with toll-free verification, which is often faster for new businesses.
4. **YOU:** Put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_PHONE_NUMBER` in `.env`.
5. **YOU:** In the Twilio number's settings, under Messaging, set "A message comes in" to Webhook, `POST https://YOUR-DOMAIN/sms`.
6. **YOU:** Turn on Twilio **Advanced Opt-Out** so the carrier-level STOP handling matches ours.

**Done when:** you sign up on the live site, receive the code on your real phone, and the agent answers your texts.

### 4.3 Hosting and domain
Status 🔴 (not deployed).

1. **YOU:** Pick a host. Railway or Render are the easiest; Fly.io is cheap.
2. **YOU:** Buy a domain, for example macoma.ai or macoma.co, and point it at the host.
3. **BUILD:** Deploy with start command `npm start`. Add all `.env` values in the host's settings. Set `PUBLIC_URL=https://your-domain`, exactly matching the domain, because Twilio checks it.
4. **BUILD:** Give the host persistent storage, or do 4.6 first. Otherwise the JSON data resets on each deploy.
5. **BUILD:** Keep the server running all the time and don't let it sleep, because the scheduler runs inside it.

**Done when:** `https://your-domain/healthz` returns `ok`.

### 4.4 Sign-up, consent and SMS keywords
Status ✅. Code: `src/server.ts`

Already done:
- Age and terms checkboxes on the website
- 6-digit code verification
- YES opt-in for people who text first
- STOP, START, HELP, LOG and DELETE MY DATA
- Consent records kept after deletion
- Limits on how often someone can sign up or request a code

1. **YOU:** Set `SUPPORT_EMAIL` in `.env` to a real inbox you check.
2. **YOU:** Decide whether to launch invite-only (`INVITE_ONLY=true`) or open.

### 4.5 Legal pages
Status 🟡 drafts. Files: `public/terms.html`, `public/privacy.html`, `public/sms-terms.html`

1. **YOU:** Form your company (LLC or C-corp) if you haven't already.
2. **YOU:** Replace every `[bracketed]` placeholder: company name, support email, refund policy, backup retention days.
3. **YOU:** Have a lawyer review all three pages and write section 13 (disputes). Expect roughly $500–2,000 for a startup package.
4. **BUILD:** Once approved, remove the yellow "Draft" boxes and update `TERMS_VERSION` in `src/server.ts` to the new date.

**Done when:** a lawyer has signed off and no placeholders remain.

### 4.6 Database
Status 🔴. Code to replace: `src/store.ts`

1. **YOU:** Create a Postgres database. Neon, Supabase and Railway all have free tiers.
2. **BUILD:** Create tables: users, consent_log, do_not_text, contacts, reminders, invoices, actions, and turns (conversation history).
3. **BUILD:** Rewrite `src/store.ts` to use Postgres, keeping the same function names so nothing else changes.
4. **BUILD:** Encrypt contact phone numbers and emails at rest, or use the encryption your database provider offers.
5. **BUILD:** Change the scheduler to query only due reminders instead of looping over every user.

**Done when:** a restart or redeploy keeps all data.

---

## 5. Phase 2: Business owner features (the moat)

### 5.1 Reminders, reorders and morning brief
Status ✅ logic / 🟡 live. Code: `src/business.ts`, `src/scheduler.ts`

1. **YOU:** On the live server, text "remind me in 2 minutes to test" and confirm the reminder arrives.
2. **YOU:** Text "send my morning brief at [the next hour]" and confirm a brief arrives at that hour. You need at least one reminder or overdue invoice, otherwise it skips the brief.
3. **BUILD:** Add a "snooze" reply (for example "snooze 1h") to move the last reminder.
4. **BUILD:** Let owners text "DONE" to mark the last reminder complete. This also gives you completion data for the moat metrics.

### 5.2 Texting customers ("running late", follow-ups)
Status ✅. Code: `draftContactMessage`, `handleContactReply`

1. **YOU:** Test with a second phone acting as the customer:
   - Have the agent text it.
   - Reply from the second phone and confirm the owner receives the reply.
   - Text STOP from the second phone and confirm the agent refuses to message it again.
2. **YOU:** Decide how the signature should read: "– Waugh Painting (sent via Macoma)". This line is your free advertising.
3. **BUILD:** When a customer replies, let the owner say "reply: …" so the agent answers the customer directly, still with a YES to confirm.
4. **BUILD:** Let an owner schedule a message for the next morning when it's blocked by quiet hours.

### 5.3 Invoices and getting paid
Status ✅ payment link / 🟡 Stripe. Code: `createInvoice`, `deliverInvoice`, `/stripe/webhook`

1. **YOU:** Create a Stripe account. Use test mode first.
2. **YOU:** Put `STRIPE_SECRET_KEY` (test key) in `.env`.
3. **YOU:** In the Stripe dashboard, under Developers and then Webhooks, add `https://YOUR-DOMAIN/stripe/webhook` with the event `invoice.paid`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **YOU:** Test: create an invoice for yourself, reply YES, pay it with the test card 4242 4242 4242 4242, and confirm you get the "paid" text.
5. **BUILD (later):** Move to **Stripe Connect** so each owner is paid into their own Stripe account, not yours. This is required before real owners use Stripe invoicing, and it's also how you could take a small fee.

### 5.4 Billing and plans
Status 🔴.

1. **YOU:** Set prices. The suggestion from `docs/moat.md` is a free Personal plan and a Business plan at $29–49 per month.
2. **YOU:** In Stripe, create a Product called "Macoma Business" with a monthly Price.
3. **BUILD:** Add a `plan` field to users and a Stripe Checkout link the agent can text ("upgrade" → link).
4. **BUILD:** Handle the Stripe `customer.subscription.*` webhooks to switch plans on and off.
5. **BUILD:** Limit business tools (contacts, invoices, customer texts, morning brief) to Business users, with a free trial period.
6. **BUILD:** Add a daily message cap per user, for example 100 a day on free plans, to control AI costs.

---

## 6. Phase 3: Agent economy (x402 and A2A)

### 6.1 x402 agent wallet
Status 🟡. Code: `src/x402.ts`

1. **YOU:** Create a **new** wallet just for the agent. Never use your personal wallet. Put its private key in `AGENT_WALLET_PRIVATE_KEY`.
2. **YOU:** Get free Base Sepolia test USDC from a faucet (Coinbase or Circle).
3. **YOU:** Find an x402 test endpoint, for example from the x402.org ecosystem list, and text the agent: "fetch [url]".
4. **YOU:** Confirm the payment appears when you text LOG, and that the spending caps (`MAX_SPEND_PER_CALL_USD`, `DAILY_BUDGET_USD`) block anything over the limit.
5. **YOU (later):** Switch to mainnet with `X402_NETWORK=eip155:8453`. Fund only small amounts.

### 6.2 A2A: other agents talk to Macoma
Status ✅ free / 🟡 paid. Code: `src/a2a.ts`

1. **YOU:** Open `https://YOUR-DOMAIN/.well-known/agent-card.json` and check that it loads.
2. **YOU:** To charge other agents, set `X402_PAY_TO` (your receiving wallet address) and `A2A_PRICE`.
3. **YOU:** Test with the curl command in the README. It should return 402 when payment is on.
4. **BUILD:** Add usage logging for A2A calls so you can see who is calling and how much they pay.

---

## 7. Phase 4: Next features

In priority order, from `docs/moat.md`:

| # | Feature | YOU | BUILD |
|---|---|---|---|
| 1 | Calendar connection | Create a Google Cloud project and OAuth consent screen; complete Google verification | OAuth flow by text link, read today's jobs, so "running late" knows which customer |
| 2 | Supplier reordering | List your suppliers and how they take orders | Reorder through x402 or A2A where a supplier supports it; otherwise text a pre-filled cart link |
| 3 | Lead reply understanding | none | When a lead says "Tuesday works", offer to book it and set a reminder |
| 4 | QuickBooks / Square sync | Developer accounts with both | Push invoices and payments to the owner's books |
| 5 | Voice | Twilio voice number | Call the agent; voicemail turned into tasks |

---

## 8. Launch checklist

- [ ] Phase 0 works on your computer
- [ ] Anthropic API key with billing set up
- [ ] Twilio number bought and **A2P 10DLC / toll-free verification approved**
- [ ] Hosted on a domain with HTTPS; `/healthz` returns ok
- [ ] Postgres database live (4.6)
- [ ] Legal pages reviewed, placeholders filled, draft boxes removed
- [ ] Real support email set
- [ ] Tested end to end on a real phone: sign up, reminder, customer text, invoice, STOP
- [ ] Stripe in live mode (Connect for owners' invoices)
- [ ] Daily message cap per user turned on
- [ ] 5–10 owners you know invited first (`INVITE_ONLY=true`)

---

## 9. Accounts and costs

Rough monthly costs at small scale:

| Service | Needed for | Rough cost |
|---|---|---|
| Anthropic API | Agent replies | Pay per use. Estimate cost per conversation in testing before you set prices |
| Twilio | Number + texts | ~$1.15/month per number, ~$0.008+ per text, plus carrier fees; one-time 10DLC registration fees |
| Hosting (Railway/Render/Fly) | Server | ~$5–25/month |
| Postgres (Neon/Supabase) | Data | Free tier to start |
| Domain | Website | ~$12–40/year |
| Stripe | Invoices, billing | Per transaction, no monthly fee |
| Lawyer | Legal pages | One-time, ~$500–2,000 |
| x402 wallet | Agent payments | Whatever you fund it with |

---

## 10. Where everything lives in the code

| File | What it does |
|---|---|
| `public/index.html` | The website: number, code, invite link |
| `public/terms.html`, `privacy.html`, `sms-terms.html` | Draft legal pages |
| `src/server.ts` | Web routes, sign-up, texting keywords, customer reply routing, Stripe webhook |
| `src/agent.ts` | Claude agent, system prompt, tool definitions |
| `src/business.ts` | Contacts, reminders, invoices, YES confirmations, action log |
| `src/scheduler.ts` | Sends due reminders and the morning brief every 30 seconds |
| `src/store.ts` | Data storage (JSON file now, Postgres later) |
| `src/sms.ts` | Sending texts through Twilio |
| `src/x402.ts` | Agent wallet payments and charging other agents |
| `src/a2a.ts` | Agent-to-agent protocol |
| `docs/moat.md` | Strategy and positioning |
| `docs/requirements.md` | How each topic in Instinct's terms maps to Macoma |
| `.env.example` | Every setting, with comments |

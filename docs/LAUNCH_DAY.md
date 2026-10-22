# Launch day: a working Macoma demo online in one day

Goal for the end of the day: the site is live on its own URL with a real database, real AI replies, and every connector truly connecting in test mode (none showing "coming soon"). Stripe checkout with Apple Pay works in test mode, and 5–10 testers can use it.

Plan for about 8 hours. Each block lists what you do, where you click, and which key it produces. Key names match `.env.example` and `render.yaml`.

---

## Read this first: the one thing a day can't fix

**US carriers block texts from unregistered business numbers.** Two ways to register a Twilio number:

- **Toll-free:** verification typically takes 1–2 weeks (third-party estimate: 8–10 business days). Pending numbers are blocked too.
- **10DLC (local number):** brand and campaign review typically takes 2–3 weeks.

A Twilio trial account can only text numbers you've verified, and it can't register for 10DLC.

So on day one, real SMS to a stranger's phone isn't possible. Start the registration **first thing today** so the clock runs. Until it's approved, testers can still use Macoma two ways (pick one in block 3):

| Option | Real phones? | Cost to add |
|---|---|---|
| **A. WhatsApp Sandbox** (Twilio) | Yes, testers text on WhatsApp | A small code change (a WhatsApp channel). The sandbox needs no Meta approval; testers send `join <code>` once, and it lasts 3 days per join. |
| **B. Web "Messages" demo** | In the browser, styled like iMessage | A small code change (a demo chat page that uses the same agent) |
| **C. Twilio Virtual Phone** | No, only inside your Twilio console | Nothing; works today for you alone |

The sign-in code on the website also goes by SMS, so A or B is needed for testers to sign in today as well. Neither exists in the code yet.

---

## Do you need LangChain or LangGraph? No.

- **The agent loop is already built** directly on Anthropic's SDK: one Claude agent with about 18 tools, the YES gate, metering and model fallback. LangChain would wrap the same API calls in another layer, adding more dependencies and more to debug, with no new capability.
- **LangGraph's main value is already covered.** It offers durable, resumable multi-step runs and human-in-the-loop pauses. Macoma already has both: the Postgres job queue (one job at a time per owner, retries, survives restarts) and the YES/NO confirmation step.
- **When to revisit:** only if you later build several cooperating agents with branching workflows that need a visual graph. Even then, Anthropic's Agent SDK or Managed Agents is the closer fit.
- **Muse** stays separate: Macoma can be a tool Muse calls (via MCP), not the other way around.

---

## Block 0 (30 min): accounts and the slow clocks

Do these first. Several have review queues that run while you work.

| # | Where | Do | You get |
|---|---|---|---|
| 0.1 | console.anthropic.com | Create an org, add a payment method, buy credits, set a **monthly spend limit** (start with $50) | `ANTHROPIC_API_KEY` |
| 0.2 | twilio.com | Sign up, then **upgrade to a paid account** (registration requires it). Buy a **toll-free number**. Submit **Toll-Free Verification** with your website URL, privacy policy, terms, opt-in description ("users enter their number on the website and check a consent box") and sample messages. | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| 0.3 | dashboard.stripe.com | Create an account and stay in **Test mode** | `STRIPE_SECRET_KEY` (`sk_test_…`) |
| 0.4 | render.com | Sign up with GitHub and give it access to the `Macoma-beta-` repo | (none) |
| 0.5 | Any registrar (optional) | Buy a domain (for example macoma.app). Carrier reviewers and OAuth consent screens prefer a real domain. | (none) |

Twilio's reviewers will open your site, so it needs to be live (block 1) before you submit 0.2. Do 0.2's purchase now and submit right after block 1.

## Block 1 (45 min): put it online

1. Merge the latest work to `main` (or point Render at the `claude/eager-lamport-2v7kc5` branch).
2. In Render, go to **New → Blueprint**, pick the repo, and Render reads `render.yaml`. It creates:
   - **macoma-web**: the website and webhooks.
   - **macoma-worker**: texts, the agent and reminders.
   - **macoma-db**: Postgres 16.
3. When asked for values:
   - Fill in `ANTHROPIC_API_KEY` and `SUPPORT_EMAIL`.
   - Leave connector keys blank for now; you'll add them in blocks 4–5.
   - Render generates `TOKEN_ENCRYPTION_KEY` and `OPS_TOKEN` for you.
4. Once it's deployed, copy the web URL (for example `https://macoma-web.onrender.com`) into `PUBLIC_URL` in the **macoma** environment group, and redeploy both services.
5. Check that it's live:
   - `https://YOUR-URL/healthz` should say `ok`.
   - `https://YOUR-URL/readyz` should say `{"ok":true}`.
   - The homepage should load.
6. (Optional) Add your domain under Settings → Custom Domain, then update `PUBLIC_URL` to it.
7. Now submit Twilio Toll-Free Verification (0.2) using this URL.

If the first sync complains about a field in `render.yaml`, fix it in the Render form. The blueprint was written without access to Render's docs.

## Block 2 (30 min): wire Twilio

1. In Twilio, open **Phone Numbers → your number → Messaging**. Set "A message comes in" to `POST https://YOUR-URL/sms`.
2. Add the three Twilio keys to the Render group and redeploy.
3. Test with **Twilio Virtual Phone** (Console → Messaging → Try it out). Text `HELP` and you should get the help reply.

## Block 3 (60–90 min): today's tester channel

Pick A (WhatsApp, real phones) or B (web demo). Both need the small code change described above, which isn't built yet. Then:

- **A:** Twilio Console → Messaging → Try WhatsApp → activate the Sandbox. Set its "When a message comes in" to `https://YOUR-URL/sms`. Share the `join <code>` with testers.
- **B:** share `https://YOUR-URL/demo` with testers.

## Block 4 (90 min): connectors, really connected

Every connector's redirect URI follows the same pattern: `https://YOUR-URL/connect/<id>/callback`. A connector shows as available as soon as its two keys are set.

What each connector does today:

| Connector | Connects now | Used by the agent today |
|---|---|---|
| Google Calendar | ✅ | ✅ agenda, "running late" |
| Outlook / Microsoft 365 | ✅ | ✅ agenda |
| Stripe (Connect) | ✅ | ✅ invoices with Apple Pay, paid alerts |
| Gmail | ✅ | ⚠️ connects, but no Gmail-reading tool yet |
| QuickBooks | ✅ | ⚠️ connects, but no QuickBooks tool yet |
| Square | ✅ | ⚠️ connects, but no Square tool yet |

**Google (Calendar and Gmail), about 25 min:** console.cloud.google.com

1. Create a project. Under APIs & Services → Library, enable **Google Calendar API** and **Gmail API**.
2. Set up the OAuth consent screen:
   - Choose **External**, and leave the publishing status on **Testing**.
   - Add the scopes: `calendar.events`, `gmail.readonly`, `openid`, `email`.
   - Under **Test users**, add each tester's Google account. Testing mode allows up to 100, with no verification needed.
3. Go to Credentials → Create OAuth client ID → **Web application**.
   - Redirect URIs: `https://YOUR-URL/connect/google_calendar/callback` and `https://YOUR-URL/connect/gmail/callback`
   - This gives you `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. `GMAIL_ENABLED=true` is already set.
4. One limit: in Testing mode, Google refresh tokens expire after 7 days, so testers reconnect weekly. That goes away after verification (Calendar weeks; Gmail needs a security assessment).

**Microsoft (Outlook), about 15 min:** entra.microsoft.com

1. Go to App registrations → New registration.
   - Supported accounts: "Accounts in any organizational directory and personal Microsoft accounts".
   - Redirect (Web): `https://YOUR-URL/connect/microsoft/callback`
2. Under Certificates & secrets, create a new client secret.
3. Under API permissions → Microsoft Graph → Delegated, add `User.Read`, `Calendars.ReadWrite` and `offline_access`.
4. This gives you `MICROSOFT_CLIENT_ID` (the Application ID) and `MICROSOFT_CLIENT_SECRET` (the secret's value).
5. Without publisher verification, users see an "unverified" note but can still connect.

**Stripe Connect (owners' invoices, Apple Pay), about 15 min:** Stripe dashboard, Test mode

1. Go to Connect → get started → choose **Standard** accounts and **OAuth**.
2. Under Connect → Settings → OAuth:
   - Copy the **test client ID** (`ca_…`). That's `STRIPE_CONNECT_CLIENT_ID`.
   - Add the redirect `https://YOUR-URL/connect/stripe/callback`.
3. In test mode, Stripe's connect form has a "skip this form" option, so you can connect a test account in seconds.

**QuickBooks, about 15 min:** developer.intuit.com

1. Create an app with the Accounting scope.
2. Under **Development** keys, add the redirect `https://YOUR-URL/connect/quickbooks/callback`.
3. This gives you `INTUIT_CLIENT_ID` and `INTUIT_CLIENT_SECRET`. They connect to Intuit's sandbox companies today. Real companies need Intuit's production review.

**Square, about 10 min:** developer.squareup.com

1. Create an application.
2. Under **Sandbox** → OAuth, set the redirect `https://YOUR-URL/connect/square/callback`.
3. This gives you `SQUARE_APP_ID` and `SQUARE_APP_SECRET`. `SQUARE_ENV=sandbox` is already set. It connects Square sandbox seller accounts.

Add all the keys to the Render group and redeploy. Then sign in and open Workspace → Connectors. Every row should show **Connect**, and each one should complete and come back as Connected.

## Block 5 (45 min): billing with Apple Pay (test mode)

1. In Stripe (Test mode), go to Product catalog and create three products with monthly prices: Personal $19, Business $59, Crew $149. Copy the price IDs into `STRIPE_PRICE_PERSONAL`, `STRIPE_PRICE_BUSINESS` and `STRIPE_PRICE_CREW`.
2. In Developers → Webhooks, create two endpoints:
   - `https://YOUR-URL/stripe/webhook` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Its signing secret goes in `STRIPE_WEBHOOK_SECRET`.
   - `https://YOUR-URL/stripe/connect-webhook`, set to listen to **events on connected accounts**, with `invoice.paid`. Its signing secret goes in `STRIPE_CONNECT_WEBHOOK_SECRET`.
3. Under Settings → Payment methods, make sure Apple Pay is on. It's on by default for Checkout, and Checkout needs no Apple developer account or domain file.
4. Test it:
   - In Workspace → Plan, pick Business. Checkout opens, and on an iPhone or Safari with a card in Wallet, Apple Pay shows up (test mode charges nothing). Or use card `4242 4242 4242 4242`.
   - Back in the workspace, the plan shows the trial.
   - Text `PLAN` and the reply matches.

## Block 6 (45 min): prove it works

1. **Agent quality:** run `ANTHROPIC_API_KEY=… npm run evals` locally. This runs 24 scenarios and usually costs under $2 for a full run. Fix anything red before inviting testers.
2. **Full path on the live site:**
   - Sign up, then connect Google Calendar and Stripe test.
   - Text "what's on today?" and the reply should mention your calendar.
   - Text "invoice Dana $450 for the deck stain, due Friday", reply YES, and pay the invoice link with Apple Pay. You should get the 💸 paid text.
   - Text "remind me in 5 minutes to call the supplier" and the reminder should arrive.
3. Check the queue: `curl -H "Authorization: Bearer $OPS_TOKEN" https://YOUR-URL/readyz` should show zero failed jobs.

## Block 7 (30 min): invite testers

- `INVITE_ONLY=true` is on, so share your invite link (Workspace → Invite a friend).
- Add each tester to the Google test-users list.
- Send WhatsApp testers the join code (option A), or the demo link (option B).
- Tell testers it's a test: texts may stop while carrier registration finishes, and to reply STOP anytime.

---

## What costs money today (approximate; check current prices)

| Item | About |
|---|---|
| Render: web + worker (starter) + Postgres (basic) | $20–25 / month |
| Twilio: paid upgrade minimum + toll-free number | $20 to start + ~$2 / month |
| Anthropic credits | $20–50 for testing |
| Domain | ~$12 / year |
| Stripe, Google, Microsoft, Intuit, Square developer accounts | Free (test or sandbox) |

## What finishes after today (start the clocks now)

| Item | Typical wait | Unblocks |
|---|---|---|
| Twilio toll-free verification (or 10DLC) | 1–3 weeks | Real SMS to any US phone, and sign-in codes by SMS |
| Google verification (Calendar), then a security assessment (Gmail) | Weeks; months for Gmail | More than 100 users; no 7-day reconnects |
| Intuit production keys | Days to weeks (app review) | Real QuickBooks companies |
| Square production | Same day (switch `SQUARE_ENV=production` with production keys) | Real Square sellers |
| Stripe live mode | Account activation, usually quick | Real charges |
| Lawyer review of Terms, Privacy and SMS terms | 1–2 weeks | Public launch |

After this day, follow `docs/SCOPE_OF_WORK.md` Stage 0 for the private beta, and `docs/CAPACITY.md` when it's time to scale.

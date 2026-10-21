# Product requirements, using Instinct's terms as the baseline

Instinct's Terms of Service (revised Aug 26, 2026) describe what a texting AI agent has to support: who can use it, what it may do for someone, and how texting rules are handled. We used each topic in those terms as a requirement checklist, then decided how Macoma meets it.

Our own terms are in `public/terms.html`, `public/sms-terms.html` and `public/privacy.html`. They are written from scratch for Macoma's features, and none of Instinct's wording was copied. They are drafts for a lawyer to review.

| Instinct terms topic | What it implies for the product | Macoma status | Where |
|---|---|---|---|
| Users must be 18+ | Age confirmation before activation | ✅ Checkbox on the web; the SMS opt-in says "18+" | `public/index.html`, `TERMS_PROMPT` in `src/server.ts` |
| Account tied to an identity; one account per person; banned users can't come back | Identity = phone number, verified; suspension | ✅ One account per number, verified by a one-time code; `status: "suspended"` blocks it | `/api/join`, `/api/verify` |
| Report a compromised account | Support contact | ✅ `SUPPORT_EMAIL`, HELP keyword | `src/server.ts` |
| Input, Output, Actions defined | Separate "talk" from "do" | ✅ Every Action is recorded in an action log; text LOG to see it | `logAction`, `recentActions` in `src/business.ts` |
| Connected services: the agent acts on third-party services for you | Integrations with clear authority | 🟡 Stripe (invoices), x402 APIs, A2A agents. Google, calendar and email aren't connected yet | `src/business.ts`, `src/x402.ts`, `src/a2a.ts` |
| Delete data indexed from connected services | Deletion path | ✅ Text DELETE MY DATA (confirmed with YES) | `deleteUser` |
| Purchases: the user is the buyer, the company isn't a party | Payments go through the user's provider; we never hold funds | ✅ Invoices go through Stripe or the owner's own payment link; x402 payments are capped and logged | `deliverInvoice`, `budgetedFetcher` |
| The agent acts as the user's agent; its actions bind the user | User must clearly authorize outward-facing Actions | ✅ **Stronger than Instinct.** Texts and invoices to third parties need a YES reply and expire after 30 minutes | `propose` / `confirmPending` |
| Materials used for model training unless opted out; a "Vault" is excluded | Data-use policy | ✅ **Stronger.** No training on user content, ever; `allowTraining: false` is stored per user | `src/store.ts`, privacy page |
| AI errors; actions may be irreversible; user must review | Safeguards, confirmations, audit trail | ✅ Confirmation gate, action log, quiet hours, x402 per-call and daily caps | `src/business.ts`, `src/agent.ts` |
| No use where human review is needed | Agent declines regulated advice | ✅ System prompt sends legal, tax and medical questions to professionals | `SYSTEM` in `src/agent.ts` |
| Paid services, fees, non-refundable | Billing | 🔴 Not built. Planned: Stripe subscriptions for the Business plan | - |
| Acceptable use policy | Abuse limits | 🟡 Signup rate limits per IP and per number, one message at a time per user, a do-not-text list, suspension. No content moderation queue yet | `src/server.ts` |
| Usage limits / don't overload the service | Rate limiting | 🟡 Limits on signups and code requests. No per-user daily message cap yet | `allow()` |
| Third-party models are part of the service | Disclose subprocessors | ✅ Listed in the privacy page | `public/privacy.html` |
| Beta offerings | Beta disclaimer | ✅ Terms §11 | `public/terms.html` |
| Disclaimers, liability cap, indemnity | Legal | ✅ Drafted; needs a lawyer | `public/terms.html` |
| Arbitration and class waiver with an opt-out | Legal | 🔴 Left as a placeholder on purpose for a lawyer | `public/terms.html` §13 |
| SMS: one-time codes, welcome text, frequency varies, rates may apply, STOP/START/HELP, carriers not liable | Messaging compliance (carrier registration, TCPA) | ✅ Code sign-in, consent text on the web, YES opt-in by SMS, STOP/START/HELP handled, consent log kept after deletion | `/api/join`, `handleOwner`, `consentLog` |
| Marketing texts are not a condition of purchase | Consent wording | ✅ In the SMS terms | `public/sms-terms.html` |
| *(Not in Instinct's terms)* People the agent texts for the user | Third-party opt-out, sender identity | ✅ First text includes "Reply STOP"; any contact who texts STOP is blocked for every owner; messages are signed with the business name; no texts 9pm–8am | `handleContactReply`, `draftContactMessage` |

## Before a real launch
1. Carrier registration: an A2P 10DLC brand and campaign, or toll-free verification. Use the consent wording from `public/index.html` and `public/sms-terms.html` exactly.
2. A lawyer reviews the terms, privacy policy and SMS terms. Add a disputes section.
3. Move the JSON store to Postgres and encrypt contacts and invoices at rest.
4. Add billing (Stripe subscriptions) and a per-user daily message cap.
5. Add a moderation and review queue for flagged Actions.

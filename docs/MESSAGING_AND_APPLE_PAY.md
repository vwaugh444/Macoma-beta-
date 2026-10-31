# Messaging first, and how Apple Pay fits

Macoma is a messaging product, so it matters which channel each conversation runs on. Apple Pay works differently on each. Status as of late October 2026, from Apple's Messages for Business documentation and provider guides (sources at the end).

## The short version

| Conversation | Channel | How Apple Pay works there |
|---|---|---|
| **Owner ↔ Macoma** on iPhone, iPad or Mac | **Apple Messages for Business** (blue bubble, Macoma's name and logo, verified) | **In the chat.** Macoma sends an Apple Pay request, and the owner pays with Face ID without leaving Messages. Used for one-off reply packs. Plan sign-ups go to Stripe Checkout until Apple or the MSP confirms recurring payments work in Messages. |
| Owner ↔ Macoma on Android, or before Apple approval | SMS today, RCS next | A link to Stripe's page. Apple Pay shows on iPhone, Google Pay on Android. |
| **Macoma → the owner's customers** (invoices, running late, confirmations) | SMS today, RCS next | A link to the owner's Stripe invoice page, where the customer taps Apple Pay. This is how it works today. |
| **Macoma buying something for the owner** | Any | The owner taps Apple Pay on the merchant's page (built: `prepare_purchase`). Later: one-time agent credentials from Stripe, within limits. |

**Apple Pay always needs the person's Face ID or Touch ID on their own device.** An AI can prepare a payment, but only the person can approve it.

## 1. Apple Messages for Business: the messenger-first channel

This is Apple's business messaging inside the Messages app: a blue bubble with Macoma's verified name and logo, plus rich messages like list pickers, time pickers, forms and Apple Pay.

**How a conversation starts.** The customer, here the owner, must message the business first. Apple prohibits unsolicited messages. Macoma's flow fits this naturally:
1. A **Message Macoma** button on the website, a QR code, or a Maps or Safari search opens Messages with Macoma.
2. The owner says hi, and Macoma replies with the terms and the welcome, as it does today over SMS.
3. After that, Macoma can reply and follow up within Apple's rules. Newer options, Business Updates (iOS 18+, approved templates) and opt-in invitations, cover messages Macoma starts, such as the morning brief. Confirm the current rules with your provider.

**What you need:**
1. **Apple Business Register:** register Macoma as a brand and get approved. Apple charges nothing for the service.
2. **An Apple-approved Messaging Service Provider (MSP).** Apple doesn't connect to your server directly; an MSP relays messages through Apple's Messages for Business API. Apple lists 20+ providers, and they charge their own fees. Ask whether they support Apple Pay requests and webhooks to your own server.
3. **Apple Pay for in-chat payments:**
   - an Apple Pay **merchant ID** (one per Messages for Business account);
   - a **payment processing certificate**, which Stripe can process for you;
   - a **fresh merchant session for every payment request** (sessions expire in about 5 minutes).
4. **Macoma's side (to build once you pick the MSP):**
   - a channel adapter, so owner messages go out and come in through the MSP's API next to Twilio;
   - a per-owner channel setting (Apple or SMS);
   - Apple Pay request messages for plan checkout and reply packs, using Stripe for the payment;
   - list pickers for YES/NO and "which drafts to send".

   Everything else (the agent, drafts, YES, the morning pass, MCP, linked agents) works unchanged on any channel.

**What in-chat Apple Pay is for.** It pays the business you're chatting with: Macoma. So it's ideal for plans, upgrades and reply packs. Buying from another merchant still goes through that merchant's checkout, or later through one-time agent credentials. Macoma shouldn't sit in the middle of other merchants' money (licensing).

**Apple's rules that shape the design** (full detail in `reports/Apple Pay third party payment rules.md`):
- **A live person must be reachable.** Apple doesn't allow a bot-only service. During posted hours a staffed agent has to take over when the owner types "help". Macoma must also say the assistant is automated, and send an after-hours notice saying when a person will reply.
- **Messages Macoma starts** (the morning brief, low-balance notices) must use Business Updates templates or transactional notices to owners who opted in.
- **One Merchant ID per account**, and a fresh merchant session for every payment. Grant credits only after Stripe's webhook confirms the payment.

**Limits.**
- It only works on Apple devices; everyone else stays on SMS or RCS.
- It's for Macoma's own conversations with owners. Texts to an owner's customers can't go through Macoma's Apple channel: those customers didn't start a conversation with Macoma, and each business would need its own registration. Those stay on SMS or RCS, with Apple Pay on the invoice page.

## 2. SMS and RCS (customers, and fallback for owners)

- **SMS** works everywhere. It needs carrier registration (toll-free or 10DLC), and payments go through links.
- **RCS** is branded and verified, with rich cards and read receipts. It's rolling out on iPhone (iOS 18+) with the major US carriers and works on Android. No payments are built in, so it uses Stripe links: Apple Pay on iPhone, Google Pay on Android. It's the planned upgrade for customer-facing texts (scope of work, stage 2).

## 3. Where Apple Pay already works in Macoma

1. **Plans and reply packs:** Stripe Checkout shows Apple Pay automatically, with no Apple developer account needed.
2. **Owners' invoices:** customers pay on Stripe's hosted invoice page with Apple Pay, and the money goes to the owner's Stripe account. These are **direct charges**, so the owner is the merchant of record, as Apple requires. Macoma must never charge customers in its own name and pay the owner afterwards; Apple's rules ban that ("substitute merchant of record").
3. **Purchases for the owner:** Macoma prepares the purchase (merchant, item, total, link) within the owner's per-purchase limit. After YES, the owner gets the link and pays there with Apple Pay.

## Recommended order

1. **Now:** SMS, plus the website "Text Macoma" button. Start toll-free verification.
2. **In parallel (weeks):** register Macoma at Apple Business Register, pick an MSP that supports Apple Pay and webhooks, create the Apple Pay merchant ID, and set up processing through Stripe.
3. **Then:** build the Apple Messages channel adapter, make it the default for owners on Apple devices, and add in-chat Apple Pay for plans and packs.
4. **Next:** RCS for customer-facing texts.

## Full policy research

`reports/Apple Pay third party payment rules.md` covers what Apple allows, what it bans and what needs its approval, plus a 14-point launch checklist. Notes are in `research_notes/Apple Pay third party payment rules/`.

## Sources

- [Apple Messages for Business REST API](https://register.apple.com/resources/messages/msp-rest-api/index)
- [Apple Pay in Messages for Business (Apple tutorial)](https://register.apple.com/resources/messages/msp-api-tutorial/applepay)
- [Messages for Business FAQ (customer-initiated rule)](https://register.apple.com/resources/messages/messaging-documentation/faq)
- [What Apple Pay in Messages needs from a provider (Bird)](https://bird.com/explained/apple-messages/what-does-apple-pay-in-messages-need-from-a-provider)
- [Apple Messages for Business in 2026 (Kanal)](https://getkanal.com/blog/apple-messages-for-business)
- [Apple Pay Merchant Integration Guide](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- [How RCS works in 2026 (Infobip)](https://cdn-web.infobip.com/uploads/markdown-exports/www.infobip.com/blog/how-rcs-works.md)

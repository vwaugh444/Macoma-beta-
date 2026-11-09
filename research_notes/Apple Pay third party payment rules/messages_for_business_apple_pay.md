# Apple Pay in Apple Messages for Business: policies and requirements (as of Oct 2026)

**Method note (read first).** WebFetch could not reach any host this session. register.apple.com, infobip.com, bird.com, docs.bird.com, developers.liveperson.com and getkanal.com all failed with ENOTFOUND, which means they are outside the session's allowed network domains. Everything below comes from search-engine snippets and summaries of those pages, not from full page reads. Apple's primary pages (Appendix A Policies, the Apple Pay tutorial, the REST API "Type Interactive" page, the FAQ and the Service Terms) did come up as search results, and their snippets are quoted where available. Exact wording should still be checked on register.apple.com once that host is allowed. Several Apple tutorial and REST pages were flagged by the search tool as last updated about 1,270 to 1,470 days ago (roughly 2022 to 2023). They are marked "older" below.

---

## 1. Messages for Business policies: customer-initiated rule, what businesses may send, Business Updates and invitations, prohibited content, AI and automation

### Takeaway
Messages for Business is customer-initiated by default. Apple's policy says the business is "prohibited from sending unsolicited messages," with narrow exceptions: Business Updates templates (iOS 18+) and, from 2026, Invitations to opted-in customers. Bot-only service is not allowed. The business must disclose automated agents, give access to a live agent during business hours, and hand off to a human when asked. That last rule matters most for an AI-first product like Macoma.

### Cited Findings
- Apple's Appendix A Policies page: the business is prohibited from sending unsolicited messages and may reply only within an active conversation, subject to listed exceptions. The exceptions include account and transaction notifications, which must carry an "Unsubscribe" notice. — [Apple: Messages for Business Appendix A—Policies](https://register.apple.com/resources/messages/messaging-documentation/policies) (search snippet only)
- Quoted policy wording as surfaced in search: "Your business is prohibited from sending unsolicited messages". — [Apple Appendix A](https://register.apple.com/resources/messages/messaging-documentation/policies); restated by [Infobip compliance guidelines](https://www.infobip.com/docs/apple-messages-for-business/compliance-guidelines)
- Third-party summaries say the business should stop messaging when the customer leaves the conversation and wait for the customer to start again. They also say marketing is limited to opted-in customers through approved templates. This comes from a single blog table and is not verified against Apple's text. — [Kanal: Apple Messages for Business, how it works in 2026](https://getkanal.com/blog/apple-messages-for-business); [Bird guide](https://bird.com/en-au/guides/your-guide-to-apple-messages-for-business-what-to-know)
- An older Webex beta-era FAQ says customers must reach out first through an entry point before a business can engage them. — [Webex Connect FAQ](https://developers.webexconnect.io/reference/faqs-apple-messages-for-business)
- **Business Updates (iOS 18, Sept 2024):** "Business Updates will allow you to reach out to your customers proactively, in a private and secure way, utilizing just their phone number and Apple's pre-approved templates." Proactive messages are "limited to Apple-approved use cases like order updates, appointment reminders, or offering to switch from a phone call to messaging." — [Quiq: Apple Messages for Business update](https://quiq.com/blog/apple-messages-for-business-update/)
- **Business Updates opt-in:** Apple's privacy page says customers subscribe by giving their phone number and authorizing a specific business directly. They can turn updates off in Settings > Messages > Business Messages > Business Updates. — [Apple: Messages for Business & Privacy](https://www.apple.com/legal/privacy/data/en/messages-for-business/)
- **Invitations (2026):** Apple's newer "Invitations" feature requires that a business already has explicit customer opt-in for mobile messaging before sending an invitation. — [Mobile Ecosystem Forum, 30 Mar 2026](https://mobileecosystemforum.com/2026/03/30/apples-business-messaging-invitations-a-new-messaging-experience-for-ios/)
- iOS 18.1 extended business messaging features to RCS; they were previously iMessage-only. — [9to5Mac, 21 Oct 2024](https://9to5mac.com/2024/10/21/ios-18-1-upgrades-business-messaging-with-rcs-support/)
- **Prohibited categories:** Appendix A lists categories that may not offer the service. They include violations of law, personal fundraising or nonprofit donation collection without Apple's approval, and content that depicts Apple falsely or derogatorily. Apple says it is not currently onboarding businesses that primarily offer medical or health-related services or products, and that it may disable the service at any time. — [Apple Appendix A](https://register.apple.com/resources/messages/messaging-documentation/policies) (snippet)
- A search summary said Appendix A is "version 3.1, updated July 21, 2026" and lists prohibited transaction offers including gambling, tobacco, firearms and illegal drugs. It also listed as a prohibited use "gaming involving purchases of digital goods (customer service allowed)". **Treat the version and date as unverified:** this came from a search-tool summary, and the page could not be opened. — [Apple Appendix A](https://register.apple.com/resources/messages/messaging-documentation/policies)
- Webex's FAQ says gaming and gambling clients are banned. — [Webex Connect FAQ](https://developers.webexconnect.io/reference/faqs-apple-messages-for-business)
- An older Business Chat Policies PDF has a prohibited-uses list that appears to cover stored-value and staged digital wallet arrangements. The snippet was truncated, so the wording is unconfirmed. — [Apple: Business Chat Policies and Best Practices (PDF, older)](https://register.apple.com/resources/business-chat/BC-Policies_and_Best_Practices.pdf)
- **Live agent and no bot-only service (quoted policy):** "The business must provide access to a live agent in this channel during its regular business hours" and "A business must not provide a limited or bot-only solution." — quoted via [Bird](https://bird.com/explained/apple-messages/how-do-apple-messages-conversations-route-into-an-existing-inbox) and [CM.com: Do I need a human agent?](https://knowledgecenter.cm.com/kc/do-i-need-a-human-agent-with-apple-messages-for-bu), originally from [Apple Appendix A](https://register.apple.com/resources/messages/messaging-documentation/policies)
- **Automation disclosure:** Apple's UX guidance says to clearly identify automated agents, for example "This is an automated agent." Apple's Experience Review checks for "automated agent disclosure". — [Apple: Responding to Customers (UX design)](https://register.apple.com/resources/messages/messaging-documentation/ux-design); [LiveChat integrations: Experience Review](https://help.livechat-integrations.com/apple-messages-for-business/apple-experience-review)
- **Handoff rules (Apple UX guidance, via search):**
  - A live agent must be reachable whenever the customer texts "help".
  - When the bot fails, it should "seamlessly transition to a live agent after displaying a message like 'I'm routing your message to a live agent to better assist you.'"
  - The live agent "should introduce themselves when taking over a conversation from an automated agent".
  - The customer should never be forced to start again or re-explain.
  - After hours, "an automated response should let them know when a live agent is able to respond."
  - The target for the first automated response is within 5 seconds.

  — [Apple UX design](https://register.apple.com/resources/messages/messaging-documentation/ux-design); [LiveChat Experience Review](https://help.livechat-integrations.com/apple-messages-for-business/experience-review)
- **Privacy:** Apple does not pass customer identity to the business. Each customer has a different Opaque ID for each business chat. — [Apple: Messages for Business & Privacy](https://www.apple.com/legal/privacy/data/en/messages-for-business/)

### Inferences
- Macoma's use case fits the customer-initiated model: an owner opens a chat with Macoma, then pays a plan or reply pack. Proactive nudges such as "your reply pack is low" would need Business Updates templates or Invitations, with prior opt-in, and probably fall outside the Apple-approved Business Update use cases unless framed as account or transaction notifications.
- An AI-only Macoma would fail Apple's "no bot-only solution" rule. Macoma would need staffed live-agent coverage during stated business hours, a "help" escalation path, an automated-agent disclosure, and after-hours messaging.
- Selling Macoma plans and reply packs is a digital service bought inside a chat. I found no Messages for Business rule that bans Apple Pay for SaaS or digital services in general. The only digital-goods item surfaced was "gaming involving purchases of digital goods", which is unverified. Apple Pay's own acceptable-use guidelines and the Apple Pay terms also apply.

### Gaps
- Could not read the full Appendix A text, including its version, date, full prohibited list and any explicit AI/LLM clause. I found no source showing a Messages-for-Business-specific rule on generative AI beyond the automated-agent and live-agent rules.
- The exact Business Updates opt-in rules and the full list of approved template categories as of Oct 2026 are not confirmed.
- Full Invitations rules (launch date, eligible countries, frequency limits) are only partly confirmed.

---

## 2. Apple Pay message type: what the business provides, how payment completes, result, endpoints, timeouts, limits

### Takeaway
To send an Apple Pay message, the business needs an Apple Pay Merchant ID and a Payment Processing certificate. It also needs a Merchant Identity (TLS) certificate to request a fresh merchant session for every payment (initiative "messaging"). It must host a required HTTPS `paymentGatewayUrl` that Apple calls with the payment token for processing. Line items, totals and optional shipping and update endpoints go in the interactive message payload. The result comes back to the business as an interactive reply message with a `state` field. Each Messages for Business account can link only one Merchant ID, though one Merchant ID can serve several accounts.

### Cited Findings
- **One Merchant ID per account (Apple, older page):** the Apple Pay Merchant ID "may be used across more than one Messages for Business account" but "each Messages for Business account" can have "only one associated Apple Pay Merchant ID." — [Apple: Messages for Business Apple Pay tutorial](https://register.apple.com/resources/messages/msp-api-tutorial/applepay) (search snippet, page about 1,270 days old); restated by [Bird](https://bird.com/explained/apple-messages/what-does-apple-pay-in-messages-need-from-a-provider)
- **Payment Processing certificate:** "you must have a Payment Processing certificate associated with your Merchant account in order to have transactions accepted by the Apple Pay server". It expires every 25 months. — [Apple Apple Pay tutorial](https://register.apple.com/resources/messages/msp-api-tutorial/applepay)
- A Merchant Identity certificate (TLS) is associated with the merchant ID and "used to authenticate sessions with the Apple Pay servers." — [Global Payments: Apple Pay configuration](https://partner.globalpayments.com/integrated-partner/payments/card-not-present/apple-pay/configuration)
- **Registering the Merchant ID with Messages:** enter it in Apple Business Register under Optional Integrations > Apple Pay, copied exactly from the developer account. — [Bird docs: Use Apple Pay](https://docs.bird.com/applications/channels/channels/supported-channels/apple-messages-for-business/how-to/use-apple-pay)
- **Merchant session:** the server makes an mTLS POST to Apple's Payment Session endpoint. For Messages, `initiative` = "messaging" and `initiativeContext` = the payment gateway URL. The session object expires after five minutes and is passed to the MSP. — [Apple: Requesting an Apple Pay payment session](https://developer.apple.com/documentation/applepayontheweb/requesting-an-apple-pay-payment-session.md)
- Bird's guidance on the session request:
  - `initiativeContext` must be the publicly reachable HTTPS gateway URL.
  - `domainName` is the bare registered hostname only.
  - "The gateway must obtain a new merchant session for each payment request. A cached session can produce an invalid payment request on the customer's device."

  — [Bird: What does Apple Pay in Messages need from a provider?](https://bird.com/en-au/explained/apple-messages/what-does-apple-pay-in-messages-need-from-a-provider)
- **Endpoints:**
  - `paymentGatewayUrl` is required and "is called by Apple Pay to process the payment through the payment provider." All other endpoints are optional.
  - The optional endpoints are `fallbackUrl` (redirect for devices that cannot use Apple Pay), `orderTrackingUrl` (called on first presentation of line items and on changes), `paymentMethodUpdateUrl`, `shippingMethodUpdateUrl` and `shippingContactUpdateUrl`.

  — [Apple REST API: Type Interactive (older)](https://register.apple.com/resources/messages/msp-rest-api/type-interactive); [Apple Apple Pay tutorial](https://register.apple.com/resources/messages/msp-api-tutorial/applepay); [Text.com / LiveChat integration API](https://platform.text.com/docs/messaging/apple-messages-for-business)
- Infobip warns that if those endpoint keys are included in the dictionary but not implemented, the customer gets an error. — [Infobip: optional configurations](https://infobip.com/docs/apple-messages-for-business/manage-optional-configurations)
- **Timeouts:** Apple's REST docs say the update endpoints "must respond to the request within 30 seconds or the request times out." — [Apple REST API: Type Interactive](https://register.apple.com/resources/messages/msp-rest-api/type-interactive). I did not find the same wording explicitly for `paymentGatewayUrl`. On Apple Pay on the web, payment authorization must complete within a 30-second window. — [Apple developer forums](https://developer.apple.com/forums/thread/664218)
- **How payment completes:** the customer authorizes with Face ID or Touch ID. Apple then calls the gateway URL to authorize payment. CM.com's session-init response returns the payment gateway URL, the merchant session string and the merchant identifier. — [CM.com PSP API: Apple Messages for Business details](https://developers.cm.com/payments-platform/v22.07/reference/psp-api-apple-messages-for-business-details)
- **Result returned:** "an interactive message is delivered to your endpoint with the Apple Pay payload". The payload has a `state` field indicating whether the payment was approved in the gateway. Apple advises confirming the payment in your own payment system rather than relying on the return message's state. — [Apple Apple Pay tutorial](https://register.apple.com/resources/messages/msp-api-tutorial/applepay)
- The payload carries line items, total, merchant capabilities, supported networks, country and currency codes, and optional shipping methods and required contact fields. Field names are shown in MSP templates. — [LivePerson Apple Pay template](https://developers.liveperson.com/apple-messages-for-business-templates-apple-pay-template.html); [Webex Connect: Apple Pay & Authentication](https://developers.webexconnect.io/reference/apple-message-for-business-apple-pay-authentication)
- Apple's Service Terms say Apple Pay transactions in Messages for Business are governed by the Apple Pay terms. — [Apple: Service Terms for Messages for Business](https://register.apple.com/tou/bca/latest/en)

### Inferences
- Macoma would need its own Apple Developer Merchant ID and certificates. It also needs a payment processor that accepts Apple Pay tokens (for example Stripe, Adyen or CM.com PSP) behind the `paymentGatewayUrl`, and a backend that requests a new merchant session for every payment. Sessions expire after 5 minutes.
- The safest design is to treat the in-chat `state` as advisory and confirm success through processor webhooks before crediting reply packs.

### Gaps
- The exact JSON schema of the payment-result interactive message, and its exact field names beyond `state`, could not be read.
- There is no explicit timeout value for `paymentGatewayUrl` in the sources I could reach.
- The Apple tutorial and REST pages are about 3 years old. It is not known whether Apple changed requirements in 2025 or 2026, for example the move from Start Session to Payment Session noted in Apple Pay on the web docs.

---

## 3. MSP requirements, MSPs supporting Apple Pay and APIs, costs

### Takeaway
Businesses must connect through an Apple-approved Messaging Service Provider. Apple charges nothing, and MSPs charge for their services. Several MSPs document Apple Pay support with API or webhook access. These include Bird, CM.com (which also acts as a PSP), Infobip, LivePerson, Webex Connect (imiconnect) and Text.com/LiveChat. Zendesk and Salesforce support the channel, but I could not confirm Apple Pay support for them. No public small-business price points were found apart from one vendor claim.

### Cited Findings
- Apple FAQ: "Apple provides Apple Messages for Business for free, an MSP may charge for their services." Also: "Cost depends on your deployment scope and Messaging Service Provider (MSP) selection." — [Apple FAQ](https://register.apple.com/resources/messages/messaging-documentation/faq)
- MSPs register with Apple separately. Each Business ID is associated with a unique MSP ID, and commercial Business IDs must be tied to a brand in Apple Business Register. — [Apple: MSP Registration](https://register.apple.com/resources/messages/msp-onboarding/mspRegistration)
- What an MSP must handle for Apple Pay (Bird):
  - support the Apple Pay interactive message type
  - generate a fresh merchant session per payment
  - host or relay the gateway URL
  - handle the reply

  — [Bird: What does Apple Pay in Messages need from a provider?](https://bird.com/en-au/explained/apple-messages/what-does-apple-pay-in-messages-need-from-a-provider)
- **MSPs documenting Apple Pay in Messages:**
  - Bird — [Bird docs](https://docs.bird.com/applications/channels/channels/supported-channels/apple-messages-for-business/how-to/use-apple-pay)
  - CM.com, with its own PSP API for Messages — [CM.com](https://developers.cm.com/payments-platform/v22.07/reference/psp-api-apple-messages-for-business-details)
  - LivePerson, Apple Pay template — [LivePerson](https://developers.liveperson.com/apple-messages-for-business-templates-apple-pay-template.html)
  - Webex Connect / imiconnect — [Webex](https://help.imiconnect.io/docs/starting-off-with-apple-pay)
  - Infobip — [Infobip](https://infobip.com/docs/apple-messages-for-business/manage-optional-configurations)
  - Text.com / LiveChat integration API, which exposes the raw payment endpoints — [Text.com](https://platform.text.com/docs/messaging/apple-messages-for-business)
- **Zendesk:** an Apple-certified MSP. Setup requires Suite Professional, Enterprise or Enterprise+, or Support Professional/Enterprise with Chat, and works through Zendesk's team rather than self-serve. — [Zendesk support](https://support.zendesk.com/hc/en-us/articles/8030634178458-Adding-and-configuring-the-Apple-Messages-for-Business-channel). Salesforce has a "Considerations for Apple Messages for Business" page. — [Salesforce help](https://help.salesforce.com/s/articleView?language=en_US&id=sf.messaging_apple_considerations.htm&release=246.10.0&type=5)
- **Sinch:** claims official MSP status since 2019, but another Sinch page says the channel was "only available at this time to existing Sinch customers during a beta program". The pages conflict. — [Sinch](https://www.sinch.com/node/3826/)
- **Twilio:** no evidence found that Twilio is an Apple Messages for Business MSP.
- **Price:** Blooio, a vendor, claims small-business setup "in minutes starting at $39/month". This is a vendor claim and it is unclear whether Blooio is an Apple MSP. — [Blooio guide](https://blooio.com/guides/apple-messages-for-business). Quiq pricing is usage-based, with no rates published. — [Quiq](https://quiq.com/channels/apple-messages/)

### Inferences
- For a developer-led product like Macoma that wants raw API and webhook control, Bird, Infobip, CM.com, Webex Connect or Text.com look like a better fit than suite-based CRMs such as Zendesk or Salesforce. CM.com could bundle the PSP side.

### Gaps
- There is no authoritative Apple list of approved MSPs or of which ones support Apple Pay. Apple's MSP directory was not reachable.
- There are no concrete published per-message or per-month prices from the main MSPs.

---

## 4. Registration and approval: Apple Business Register, brand requirements, review timeline, countries

### Takeaway
The business registers a Messages for Business account in Apple Business Register and links it to a brand. It then picks an MSP, passes brand review (days) and passes an Experience Review before launch. One to three review rounds are typical. Supported countries could not be confirmed from a current authoritative list.

### Cited Findings
- Commercial Business IDs must be associated with a brand in Apple Business Register, which "requires an approval step by the brand review team that may take several business days." — [Apple: MSP Registration](https://register.apple.com/resources/messages/msp-onboarding/mspRegistration)
- Apple's onboarding page says "the Apple approval process can take few days." Infobip says approval usually takes 1–2 business days. Bird says brand review takes 1–3 business days, and that most accounts need one to three Experience Review rounds, with elapsed time driven mostly by the business's turnaround. — [Apple: Onboarding end-to-end](https://register.apple.com/resources/messages/messaging-documentation/end-to-end); [Infobip get started](https://www.infobip.com/docs/apple-messages-for-business/get-started); [Bird: brand review](https://bird.com/explained/apple-messages/what-does-apples-brand-review-involve)
- **Brand assets:** a business name plus two logos. The square logo appears in the conversation list and the wide logo at the top of the conversation. Provider specs include a square logo of at least 1024x1024 px. — [Apple: Register your account](https://register.apple.com/resources/messages/messaging-documentation/register-your-acct); [Bird: setup](https://bird.com/explained/apple-messages/how-does-a-business-get-set-up-on-apple-messages-for-business)
- **Experience Review:** Apple tests the live experience before launch, including automated-agent disclosure and live-agent handoff. — [LiveChat integrations: Experience Review](https://help.livechat-integrations.com/apple-messages-for-business/apple-experience-review); [Apple: Ready to Launch](https://register.apple.com/resources/messages/messaging-documentation/go-live)
- **Countries:** Apple's go-live page says to add the countries where physical locations reside for Maps entry points, and that country selection "does not affect the visibility of your iOS entry points." — [Apple: Ready to Launch](https://register.apple.com/resources/messages/messaging-documentation/go-live)

### Inferences
- Plan for weeks rather than days end to end. Brand review takes days, Experience Review takes one to three rounds, and the MSP integration and Apple Pay merchant setup add more time.

### Gaps
- No current authoritative list of countries where Messages for Business, or Apple Pay within it, is available.
- No 2026-dated statement of review SLAs from Apple.

---

## 5. Can one platform account take payments for many small businesses, or must each register separately?

### Takeaway
Apple's rules tie each Messages for Business account to one brand and one Apple Pay Merchant ID. The structure of Messages for Business plus Apple Pay assumes that the business in the chat is the merchant of record. For Macoma's actual plan, where owners pay Macoma for Macoma's own plans and reply packs, this is not a problem: Macoma is the single business and the single merchant. Using Macoma's account to collect payments on behalf of many different small businesses, for example their customers paying them, is not supported by anything I found. Each business would need its own brand registration, and the Apple Pay route for multi-merchant platforms is a separate approved program.

### Cited Findings
- Apple FAQ: only one commercial account per business is allowed, used "for all use cases and business lines, including coverage for multiple territories." This page is older, about 1,468 days. — [Apple FAQ](https://register.apple.com/resources/messages/messaging-documentation/faq)
- Infobip says a company can optionally register a separate account per brand, or test, staging and production accounts. — [Infobip get started](https://www.infobip.com/docs/apple-messages-for-business/get-started). This conflicts in emphasis with the Apple FAQ.
- Each account links to a brand in Apple Business Register, and each Business ID is tied to a unique MSP ID. — [Apple: MSP Registration](https://register.apple.com/resources/messages/msp-onboarding/mspRegistration)
- Each Messages for Business account can have "only one associated Apple Pay Merchant ID". — [Apple Apple Pay tutorial](https://register.apple.com/resources/messages/msp-api-tutorial/applepay)
- Bird keeps "each brand's business identity, approval, settings and conversations distinct" within its workspace. This means MSPs model multi-brand as one account per brand. — [Bird: registration](https://bird.com/apple-messages-api/features/registration)
- **Platform route for Apple Pay (web, not Messages):**
  - Apple's Web Merchant Registration API lets approved "payment service providers and e-commerce platforms" register merchants under shared keys and certificates.
  - Merchants then don't need their own developer accounts.
  - Platforms must confirm merchants meet Apple Pay acceptable-use guidelines.

  — [Apple: Web Merchant Registration API](https://developer.apple.com/documentation/applepaywebmerchantregistrationapi.md); [Apple Pay Platform Integration Guide](https://developer.apple.com/download/files/Apple-Pay-Platform-Integration-Guide.pdf); [Apple: Implementing Apple Pay](https://developer.apple.com/apple-pay/implementation/)

### Inferences
- **For Macoma's stated plan, this works:** one Macoma Messages for Business account, one Macoma Merchant ID, and owners paying Macoma. This matches the documented model.
- For collecting payments on behalf of owners' businesses inside Messages, each business would likely need its own Business Register brand and account, its own MSP connection and its own Merchant ID. That doesn't fit a small-business SaaS, which is consistent with Macoma keeping owner-to-customer texting on SMS/RCS.
- Apple's platform-integrator program exists for Apple Pay on the web, but I found no evidence it extends to Messages for Business payments.

### Gaps
- I found no explicit Apple statement allowing or prohibiting one Messages for Business account acting as merchant of record for third-party businesses. The Appendix A text that might address it (for example, staged digital wallet or payment facilitation clauses) could not be read.
- I could not confirm whether a Messages account can use a Merchant ID registered by a PSP or platform on a sub-merchant's behalf.

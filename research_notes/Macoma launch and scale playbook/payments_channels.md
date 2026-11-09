# Payments (Apple Pay, Wallet, x402) and Messaging Channel Choice for Macoma — US launch, as of Oct 2026

Research method note: run 2026-10-22. Direct page fetches of developer.apple.com, register.apple.com and docs.stripe.com were blocked by the sandbox network proxy (DNS failure / 403), so findings come from search-result extracts of those pages plus secondary sources. Vendor blogs are flagged as such. Anything marked "background knowledge, unverified" in Inferences/Gaps has no source fetched in this session and should be checked before it is relied on.

## (a) Apple Pay on the web for the Macoma subscription: requirements, processor vs direct, fees, recurring billing, App Store rules

### Takeaway
Use Stripe (Express Checkout Element or Payment Element, or hosted Checkout / Payment Links) and you skip most Apple-side setup: hosted Checkout and Payment Links need no extra configuration, and Elements only needs each domain registered. For subscriptions, pass Apple Pay's `recurringPaymentRequest` so Apple issues a merchant token (MPAN) that survives device changes, but code for the fallback because an MPAN is not guaranteed. With no iOS app, Apple's In-App Purchase rules don't apply. If an iOS app comes later, US apps may link out to web checkout following the 2025 Epic contempt order, but whether Apple can charge a commission on those purchases is still being litigated.

### Cited Findings
**Requirements (direct integration with Apple)**
- Every domain that shows the Apple Pay button, subdomains included, must be verified. The file `apple-developer-merchantid-domain-association` has to be served unmodified over HTTPS at `/.well-known/`, and the domain is then registered in the processor dashboard or under the Merchant ID in the Apple Developer account — [Paypercut docs](https://docs.paypercut.io/docs/accept-payments/apple-pay); [PXP compliance guide](https://developer.pxp.io/guides/components/web/applepay/compliance)
- Domains can't sit behind a proxy or redirect for verification, and Apple must be able to reach them from its published IP ranges — [Nuvei docs](https://docs.nuvei.com/?p=56303)
- The Payment Processing Certificate belongs to the Merchant ID and encrypts and decrypts the payment data. One Merchant ID can hold up to 99 domains — [Forward (getfwd) Apple Pay guide](https://docs.getfwd.com/docs/guides/apple-pay)
- An Apple developer forum thread shows conflicting reports on whether sandbox needs domain verification — [Apple Developer Forums 735085](https://developer.apple.com/forums/thread/735085)

**Through Stripe**
- Stripe Elements and embedded Checkout need the domain registered for Apple Pay to work. Payment Links and hosted Checkout work with no extra configuration. Each domain and subdomain that shows the button must be registered, in both test and live mode — [Stripe: Register domains for payment methods](https://docs.stripe.com/payments/payment-methods/pmd-registration)
- On hosted checkout, processors handle Apple Pay with "no additional setup" (Paypercut stating its own behavior) — [Paypercut](https://docs.paypercut.io/docs/accept-payments/apple-pay)

**Recurring / subscription (MPAN)**
- An Apple Pay merchant token (MPAN) ties together a payment card, a business and a customer. Stripe supports three request types: recurring (`PKRecurringPaymentRequest`, which needs iOS 16+ or Apple Pay on the Web), automatic reload, and deferred payment — [Stripe: Apple Pay merchant tokens](https://docs.stripe.com/apple-pay/merchant-tokens)
- In Stripe's Express Checkout Element, set `applePay.recurringPaymentRequest` with `regularBilling`, `billingAgreement` and `managementURL` — [Stripe merchant tokens](https://docs.stripe.com/docs/apple-pay/merchant-tokens); [Stripe Apple Pay recurring](https://docs.stripe.com/apple-pay/apple-pay-recurring)
- MPANs survive a device switch. Device tokens (DPANs) can be deactivated when the user changes devices — [Stripe merchant tokens](https://docs.stripe.com/apple-pay/merchant-tokens)
- Asking for a recurring payment doesn't guarantee an MPAN. That depends on network, issuer and Apple Pay eligibility, and otherwise Apple returns a DPAN, so the backend should check which token type it got — [Chargebee: Apple Pay via Stripe](https://www.chargebee.com/docs/1.0/apple-pay_via_stripe.html)
- The one-time cryptogram expires, and a late first customer-initiated transaction is a common cause of authorization failures — [Stripe merchant tokens](https://docs.stripe.com/apple-pay/merchant-tokens)
- An optional `tokenNotificationURL` receives token lifecycle events. Per Paysafe, it must be registered with the Merchant ID so Apple can send card-metadata updates and unlink events — [Stripe React Native RecurringPaymentRequest](https://stripe.dev/stripe-react-native/api-reference/types/PlatformPay.RecurringPaymentRequest.html); [Paysafe recurring docs](https://developer.paysafe.com/en/api-docs/apple-pay-cards-api/integrating-paysafe-rest-api/recurring-payments/)

**Apple Pay Later**
- Apple shut down Apple Pay Later in the US on June 17, 2024. Existing loans could still be managed in Wallet. Apple moved to installment loans from partner lenders such as Affirm — [ConsumerAffairs](https://www.consumeraffairs.com/news/apple-is-discontinuing-apple-pay-later-061824.html); [CBS News](https://www.cbsnews.com/amp/news/apple-pay-later-service-discontinued-bnpl-plans)

**App Store / anti-steering (only matters for a future iOS app)**
- April 2025: Judge Gonzalez Rogers held Apple in civil contempt and barred it from charging commission on purchases made outside the app or controlling link design. Apple then updated its US App Review Guidelines — [FKKS](https://technologylaw.fkks.com/post/102mp7y/update-your-app-external-purchase-developments-for-apple-google)
- US iOS apps may include external payment links. Most apps must still offer IAP alongside them; "reader" apps are the main exception — [RevenueCat](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy)
- Dec 11, 2025: the Ninth Circuit largely upheld the contempt order but called the outright ban on commission overbroad. Apple may charge a commission tied to costs genuinely and reasonably necessary for linked-out purchases, once a rate is set — [9th Cir. opinion, Justia](https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html); [Fenwick](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple); [9to5Mac](https://9to5mac.com/2025/12/11/apple-defeats-ban-on-charging-commission-on-linked-out-purchases-from-ios-apps/)
- Apple petitioned the Supreme Court: *Apple Inc. v. Epic Games*, No. 25-1311 (OT2026 docket) — [Oyez](https://www.oyez.org/cases/2026/25-1311). One secondary source reports an April 2026 decision letting the commission question proceed while cert is pending (not verified at a primary source) — [Cleverbridge](https://grow.cleverbridge.com/blog/apple-vs-epic-a-legal-turning-point)
- The 27% fee on linked-out purchases that Apple had imposed was what the district court rejected, calling it "a gross miscalculation" — [RevenueCat](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy)

### Inferences
- Macoma has no iOS app; users sign up through an SMS link to a web page, so IAP rules do not apply at all. Apple Pay on the web is a payment method, not an App Store purchase.
- Simplest path: a Stripe Checkout Session in `subscription` mode, or a Payment Link, sent by text. Apple Pay then needs no domain work. Use the Express Checkout Element with `recurringPaymentRequest` only if you want a branded inline page, and register that domain. Stripe Billing then handles renewals, dunning and the customer portal (the `managementURL`).
- Processor choice: Stripe is the shortest route for a startup. Adyen, Braintree and Square all support Apple Pay on the web, but this session found no comparative detail on them.
- Future iOS app: on current law, link out to the web subscription (US storefront) and keep IAP optional. Budget for a possible cost-based Apple commission on linked-out sales, depending on how No. 25-1311 and the remand come out.

### Gaps
- Fees (background knowledge, not verified this session): Apple charges merchants nothing for Apple Pay on the web and is paid by issuers. Stripe's US standard card rate (about 2.9% + 30¢) applies to Apple Pay, plus 0.5–0.7% for Billing. Confirm on stripe.com/pricing.
- No current details on Adyen, Braintree or Square Apple Pay web setup or pricing.
- The Supreme Court's cert status and the remand commission rate as of Oct 2026 were not confirmed at a primary source.

## (b) Letting business owners' customers pay invoices with Apple Pay (Connect / platforms)

### Takeaway
Stripe Connect plus Stripe Invoicing is the shortest path. Create invoices with `on_behalf_of` (or as direct charges on the connected account), and Stripe's Hosted Invoice Page shows Apple Pay automatically with the connected account's branding. Macoma takes its cut via application fees. Register Apple Pay domains per connected account only if Macoma hosts its own Elements checkout.

### Cited Findings
- Setting `on_behalf_of` on an invoice makes the connected account the settlement merchant and puts its branding, contact details and tax ID on the email, PDF, Hosted Invoice Page and receipt. It has to be set through the API before finalizing, since the Dashboard can't do it — [Stripe: Invoicing with Connect](https://docs.stripe.com/invoicing/connect)
- Hosted invoices need no separate Apple Pay integration. Customers with Apple Pay set up see the option automatically — [Stripe Support: Paying a hosted invoice with Apple Pay](https://support.stripe.com/questions/paying-a-hosted-invoice-with-apple-pay)
- Each invoice gets a unique hosted URL, which expires 30 days after the due date — [Stripe: Hosted Invoice Page](https://docs.stripe.com/invoicing/hosted-invoice-page)
- For direct charges, a platform registers payment-method domains through the API with its secret key and the `Stripe-Account` header. For destination charges or separate charges and transfers, it omits the header and registers on the platform. The Dashboard can't add domains for connected accounts — [Stripe: pmd registration](https://docs.stripe.com/payments/payment-methods/pmd-registration); [Azuki Digital (2025)](https://azukidigital.com/blog/2025/stripe-connect-apple-pay/)

### Inferences
- Recommended design: Express accounts (Stripe-hosted onboarding and KYC, Stripe Express dashboard), invoices created via the API with `on_behalf_of` and `transfer_data[destination]` (or direct charges on Standard accounts), with Macoma's fee taken as `application_fee_amount`. The text message sends the `hosted_invoice_url`, so Apple Pay works with no domain registration.
- The invoice is branded as the business, which also helps carrier compliance because the link points to an invoice from a known merchant.

### Gaps
- No source fetched this session on `application_fee_amount` or `application_fee_percent` for invoices, Express vs Standard KYC detail, or Connect pricing (background knowledge: Express/Custom are about $2 per monthly active account plus 0.25% + 25¢ per payout; verify).
- No current details on Square Invoices APIs or Adyen for Platforms.

## (c) Apple Pay in Apple Messages for Business (AMB)

### Takeaway
AMB has no public API. Macoma would need an Apple-approved MSP and an Apple Business Register account, with each brand registered and UX-reviewed, which takes weeks to months. Customers start the conversation. iOS 18's "Business Updates" lets approved businesses send some proactive transactional messages. Apple charges nothing; MSPs charge (Bird: $0.05 per monthly active contact). AMB is poorly suited to a startup acting as a platform for many small businesses.

### Cited Findings
- A business must pick an Apple-approved MSP. The MSP implements the server-to-server API and features such as Apple Pay — [Apple Business Chat FAQ](https://register.apple.com/resources/business-chat/faq/business-chat-faqs.html); [Bird](https://bird.com/explained/apple-messages/which-providers-support-apple-messages-for-business)
- There is no public REST API. The brand is registered through Apple Business Register, which holds its details and MSP choice, and each Business ID maps to one MSP ID — [Blooio](https://blooio.com/guides/apple-messages-for-business); [Bird](https://bird.com/explained/apple-messages/what-is-a-messaging-service-provider-and-how-do-i-choose-one); [DEV: no public AMB API](https://dev.to/ambdirectory/there-is-no-public-apple-messages-for-business-api-1l7k)
- A registration can be moved to any approved MSP — [Apple Developer Forums](https://origin-devforums.apple.com/forums/profile/1BC/replies)
- Vetting can take weeks or months, and Apple limits use to customer-service conversations — [Blooio](https://blooio.com/guides/apple-messages-for-business)
- Businesses must pass Apple's UX review before launch — [Bird guide](https://bird.com/en-us/guides/your-guide-to-apple-messages-for-business-what-to-know)
- Eligibility includes live agents during business hours and service on par with phone support — [Sprinklr](https://www.sprinklr.com/help/articles/overview/introduction-to-apple-messages-for-business/63e683cdf6e2cc7d18f95dde)
- MSPs named in Apple and vendor material include Zendesk, Salesforce, Genesys, Infobip, LivePerson, Sprinklr, Bird and Webex Connect. A third-party directory also lists Blooio, Spinoco and Vivocha (unverified against Apple's list) — [Bird](https://bird.com/explained/apple-messages/which-providers-support-apple-messages-for-business); [amb.directory](https://amb.directory/msps); [Webex Connect FAQ](https://developers.webexconnect.io/reference/faqs-apple-messages-for-business)
- Cost: Apple doesn't charge, but MSPs do — [Apple AMB FAQ](https://register.apple.com/resources/messages/messaging-documentation/faq). Bird charges $0.050 per monthly active contact pay-as-you-go, with $100/mo and $500/mo deposit tiers that include Apple Pay checkout — [Bird pricing](https://bird.com/pricing/apple-messages)
- Customers start conversations from a Messages button on a website, app, email, QR code or Apple Maps listing. Once a customer ends a conversation, the business must stop and the customer has to start a new one — [Apple AMB FAQ](https://register.apple.com/resources/messages/messaging-documentation/faq)
- Business Updates (iOS 18) lets businesses on an MSP send approved proactive messages, reportedly limited to things like order updates and moving a phone call to messaging — [Quiq](https://quiq.com/blog/apple-messages-for-business-update/)
- Apple Pay in AMB shows as a bubble that opens the Apple Pay sheet. The user can't enter other data there, so options and promo codes have to be collected first — [Text.com AMB docs](https://platform.text.com/docs/messaging/apple-messages-for-business)

### Inferences
- Because each Business ID is a registered brand under Apple review, Macoma could register only itself as one brand ("Macoma") for its own subscription and support. Messaging each small business's customers as that business would mean registering each one, which is impractical. Customers of a business messaging "Macoma" in AMB is the realistic model, and it may not fit Apple's customer-service scope.
- A business can't send an invoice cold over AMB, so AMB doesn't fit "send an invoice to a customer." An SMS link to a Stripe hosted invoice, with Apple Pay on the web, covers the same Apple Pay experience.

### Gaps
- No primary source on AMB Apple Pay gateway setup steps, approval timelines, or rejection reasons. Apple's current FAQ and the MSP list could not be fetched.
- No confirmed 2026 pricing for MSPs other than Bird. No primary-source answer on whether ISV/platform multi-brand registration is allowed.

## (d) Apple Wallet passes (PassKit)

### Takeaway
Feasible without an iOS app. Make a Pass Type ID and certificate in the Apple Developer Program, sign `.pkpass` files with `passkit-generator`, and run the PassKit web service plus APNs (helpers: `passkit-webservice-toolkit`, `hapns`) to live-update fields such as "amount owed." APNs delivery is best-effort.

### Cited Findings
- Wallet doesn't poll. The backend sends an empty push through APNs, and the device then calls the pass's web service to fetch the updated pass — [drobinin](https://drobinin.com/consulting/apple-wallet/building-apple-wallet-passes-that-update/); [Passcreator](https://www.passcreator.com/en/blog/apple-wallet-pass-updates-and-push-notifications-how-they-work-and-how-to-use-them)
- The push uses the pass type identifier as its topic and is signed with the Pass Type ID certificate — [yuragon.dev](https://yuragon.dev/blog/apple-wallet-passes-apns-nodejs)
- The pass's `webServiceURL` and `authenticationToken` drive device registration. If registration isn't stored, later updates fail silently. Check `authenticationToken` on every request — [drobinin](https://drobinin.com/consulting/apple-wallet/building-apple-wallet-passes-that-update/); [reinteractive](https://reinteractive.com/articles/tutorial-series-for-experienced-rails-developers/apple-wallet-pass-auto-update)
- APNs is "best effort," so delivery isn't guaranteed — [PassKit help](https://help.passkit.com/en/articles/6622010-why-hasn-t-one-or-some-of-the-passes-updated)
- `passkit-generator` only builds and signs `.pkpass` files. Its docs point to `passkit-webservice-toolkit` and `hapns` for the web service and APNs — [Passmint comparison (vendor)](https://passmint.com/blog/passkit-generator-vs-hosted-pass-api)
- Example Node.js implementations — [Medium: Node.js Wallet web service](https://medium.com/@raidiaz/build-a-web-service-for-apple-wallet-passes-with-node-js-b6bf77b4282f); [GitHub RaimundoDiaz/apple-wallet-passes](https://github.com/RaimundoDiaz/apple-wallet-passes)

### Inferences
- A `storeCard` or `generic` pass for each business owner could show primary/secondary fields such as "Outstanding: $1,240" or "Paid this month: $3,100". Fields can carry `changeMessage` so Wallet shows a lock-screen notice when they change, which gives a free push-like channel to iPhone users.

### Gaps
- No source on Apple guideline limits for pass content (for example, whether a store card can be used as a dashboard). Apple's Wallet Developer Guide and HIG could not be fetched.

## (e) Channel comparison: SMS (10DLC / toll-free), RCS, iMessage/AMB, WhatsApp

### Takeaway
For a US launch, start with SMS on registered A2P 10DLC (or verified toll-free). It's universal, and registration is cheap but takes days to weeks. Then add RCS Business Messaging on the same providers (Twilio's US rich RCS is priced like SMS), which now reaches iPhones on iOS 18.1+ with the big three carriers. AMB is a later, optional extra for Macoma's own brand. WhatsApp is a minor US channel and a reference point.

### Cited Findings
**SMS A2P 10DLC**
- Twilio fees from Aug 1, 2025: brand registration $4.50, Standard vetting $41.50 (Standard brand total $46), vetting appeal $11 — [Twilio: Pricing and Fees for A2P 10DLC](https://support.twilio.com/hc/en-us/articles/1260803965530-Pricing-and-Fees-for-A2P-10DLC-Service); [Twilio secondary vetting](https://help.twilio.com/articles/4403988619163-Secondary-Vetting-for-A2P-10DLC). An older Twilio page still says $44, which conflicts — [Twilio 10DLC page](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc)
- Campaign verification costs $15 per vetting. Monthly campaign fees run $1.50–$10 depending on use case, or $2/mo for sole-proprietor campaigns — [Twilio Direct Sole Proprietor overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview-new%20experience); [Twilio 10DLC](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc)
- Twilio's US SMS/RCS base rate is $0.0083 per message plus carrier pass-through fees — [Twilio US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us). Third-party estimates put carrier fees at about $0.003–$0.005 per segment — [textbee](https://textbee.dev/blog/twilio-pricing-real-cost-breakdown); [piyushgambhir](https://www.piyushgambhir.com/blogs/twilio-a2p-brands-campaigns-costs-throughput-compliance)
- Timeline: Twilio says there is no exact timeline because carriers, Twilio and external vetting all have to approve — [Twilio 10DLC](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc)
- Throughput: T-Mobile daily caps by vetting score are 200k (75–100), 40k (50–74), 10k (25–49) and 2k (1–24), applied per EIN. Unvetted brands default to Low — [Telnyx rate limiting](https://developers.telnyx.com/docs/messaging/messages/rate-limiting); [Twilio T-Mobile caps](https://support.twilio.com/hc/en-us/articles/1260804800549-T-Mobile-daily-message-limits-for-long-code-messaging-with-A2P-10DLC); [AWS 10DLC](https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-10dlc.html). 10DLC can reach up to 225 MPS depending on trust score — [Customer.io](https://docs.customer.io/journeys/phone-number-types.md)

**Toll-free**
- Verified toll-free runs at about 3 MPS per number by default (Infobip: typically 1–10 MPS, carrier-dependent) — [Infobip toll-free throughput](https://www.infobip.com/docs/usa-sender-registration/toll-free/toll-free-throughput-reference); [Customer.io](https://docs.customer.io/journeys/phone-number-types.md)

**RCS Business Messaging**
- Verified RCS for Business began reaching iPhones on iOS 18.1+ in select markets on supported carriers, with a verified profile (name, logo, checkmark), and the rollout is ongoing — [Infobip: Apple RCS (May 2026)](https://www.infobip.com/blog/apple-rcs); [Sinch: Apple RCS support 2026](https://sinch.com/blog/apple-support-rcs/)
- The three major US carriers are on Apple's supporting-carrier list, per a June 2026 tracker, but feature availability varies by carrier — [SimplyRCS tracker](https://simplyrcs.ai/learn/rcs-support-tracker/); [Messente 2026](https://messente.com/blog/state-of-rcs-business-messaging)
- iOS 26.5 (May 2026) started cross-platform E2EE for personal RCS (sources disagree whether it is beta). Business RCS is TLS in transit, not end-to-end encrypted — [Sinch](https://sinch.com/blog/apple-support-rcs/); [Infobip](https://www.infobip.com/blog/apple-rcs)
- Twilio RCS: rich RCS costs the same as SMS at $0.0083 per message plus carrier fees. A Sept 2026 comparison quotes about $0.022 sent and $0.0165 received for rich media — [Twilio RCS](https://www.twilio.com/en-us/messaging/channels/rcs); [SimplyRCS vs Twilio (competitor)](https://simplyrcs.ai/compare/vs-twilio/); [Signalmash](https://signalmash.com/post/rcs-business-messaging-cost-per-message)

**WhatsApp (reference)**
- Replies inside the 24h service window are free. US utility messages are about $0.004–$0.006 and marketing about $0.025. One BSP reports Meta paused marketing templates to US numbers from Apr 1, 2025 (conflicting sources) — [Spur](https://www.spurnow.com/blogs/whatsapp-business-api-pricing-explained); [MessageCentral](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-usa); [chatdaddy](https://chatdaddy.tech/blog/whatsapp-business-api-pricing)

### Inferences
- Phased plan: (1) 10DLC Standard brand plus a "customer care / account notifications" or mixed campaign for Macoma-to-owner messages (owners opt in by texting first), with toll-free verification as a parallel backup number. (2) Owner-to-customer invoice texts are A2P messages on behalf of third parties; send them from Macoma's registered brand with clear identification of the business and opt-out, or register businesses as secondary brands under an ISV model (check with Twilio). (3) Add RCS via Twilio when Messaging Services can fall back to SMS automatically, so iPhone and Android get a verified sender with rich cards and pay buttons. (4) AMB only for Macoma's own brand, once volume justifies MSP cost and review.
- iMessage itself, outside AMB, has no official business API. Unofficial iMessage relays such as Sendblue or Blooio carry ToS and deliverability risk.

### Gaps
- RCS agent verification and carrier-approval timelines in the US (Google RBM launch review), and whether Apple runs its own vetting, could not be confirmed at a primary source.
- Twilio's current toll-free verification requirements and timeline are not confirmed.

## (f) x402 / stablecoin payments alongside Apple Pay

### Takeaway
x402 (HTTP 402 payments, mostly USDC on Base) is real but early. It is governed by the x402 Foundation, which the Linux Foundation formalized in April 2026, and Stripe support is in preview. Keep it separate from Apple Pay: use it only for Macoma's own machine-to-machine spending, through a provider such as Coinbase CDP or Stripe, not for taking consumer or merchant funds, which avoids custody and money-transmission exposure.

### Cited Findings
- Coinbase released x402 in May 2025. Coinbase and Cloudflare announced a foundation on Sept 23, 2025, and the Linux Foundation formalized it on Apr 2, 2026 — [Presenc adoption tracker](https://presenc.ai/research/x402-protocol-adoption-tracker-2026); [Eco](https://eco.com/support/en/articles/14839402-x402-protocol-explained)
- Stripe added x402 support on Feb 10, 2026 (USDC on Base), still in preview as of Apr 2026. Stripe and Tempo launched the Machine Payments Protocol on Mar 18, 2026 — [Eco: Stripe Link Agents and x402](https://eco.com/support/en/articles/14839406-stripe-link-agents-and-x402-explained); [Small World FS](https://www.smallworldfs.com/blog/2026/02/13/stripe-and-coinbase-advance-ai-driven-payments-with-x402-protocol/)
- Volume figures conflict: about 167–169M payments in year one, yet about $28K a day of real-commerce volume, with around half of activity gamified — [Presenc](https://presenc.ai/research/x402-protocol-adoption-tracker-2026); [Datawallet](https://www.datawallet.com/crypto/x402-protocol-explained)
- Visa, Mastercard and Coinbase are competing over agent-payment standards (AP2, ACP, MPP, x402) — [Forbes, Jun 2026](https://www.forbes.com/sites/digital-assets/2026/06/07/visa-mastercard-and-coinbase-are-fighting-over-how-ai-agents-pay/); [Crossmint comparison](https://www.crossmint.com/learn/agentic-payments-protocols-compared)
- The GENIUS Act (signed July 2025) sets a federal framework for payment stablecoins covering reserves and disclosures — [Envision Blockchain](https://envisionblockchain.com/insights/agentic-payments-x402.html)

### Inferences
- Keep the rails separate. Fiat (Apple Pay/cards through Stripe) handles subscriptions and invoices. Optional x402 or USDC handles Macoma's outbound agent spending from a Macoma-owned wallet. Don't hold users' crypto or convert their invoice proceeds yourself; use Stripe's or Coinbase's regulated rails.

### Gaps
- GENIUS Act implementing rules and their 2026 effective dates were not found. There is no primary-source data on Stripe's x402 GA status as of Oct 2026.

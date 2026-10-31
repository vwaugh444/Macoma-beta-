# Apple Pay merchant agreements and acceptable-use rules for platforms and third parties (as of October 31, 2026)

Scope note: These notes come from Apple's own pages, fetched directly from developer.apple.com on 2026-10-31. stripe.com, docs.stripe.com and moneris.com were blocked here (proxy 403 / ENOTFOUND), so the Stripe points come from search-result summaries only and are marked as such.

Document versions checked:
- **Apple Developer Program License Agreement (DPLA):** "including its Schedule 1 last updated October 29, 2026" — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/).
- **Apple Pay Platform Web Merchant Terms and Conditions:** Exhibit A reads "Updated: 2023-3-10" — [apple-pay-web terms](https://developer.apple.com/terms/apple-pay-web/).
- **Apple Pay Platform Web Terms and Conditions for Direct Merchants (and Platform Providers):** also "Updated: 2023-3-10" — [direct-merchants terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants).
- **Apple Pay Human Interface Guidelines (HIG):** the change log's latest entry is June 8, 2026 — [HIG Apple Pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay).
- **Acceptable Use Guidelines for Apple Pay on the Web:** the page has no version date, only "Copyright © 2026" — [AUG](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/).

## Q1. What the Apple Pay merchant and platform terms require (Platform Provider / PSP provisions, merchant registration, domain registration, shared responsibilities)

### Takeaway
Apple's model has three roles. **Merchants** accept Apple's Web Merchant Terms. **Platform Providers** (e-commerce platforms or PSPs with an Apple developer account who signed Apple's Platform Provider Addendum) register merchants and their domains through Apple's Web Merchant Registration API. Anyone else who passes Apple Pay data to a merchant is an **"Intermediary Party"** under the DPLA. The Platform Provider acts "solely on Your [merchant's] behalf and for Your purposes." The merchant (or its Platform Provider) is solely responsible for verifying transactions. Apple disclaims being a party to any transaction.

### Cited Findings

**Two Web Merchant Terms documents**

- **Merchant terms (`/terms/apple-pay-web/`):** These are the terms a merchant accepts when it uses a Platform Provider. Acceptance happens "by using, or continuing to use, the Apple Pay Web APIs or Apple Pay Platform" (§1.1). The preamble says "These Terms and Conditions may be modified by Apple from time to time, and Your continued use … will be deemed acceptance of such updated Terms and Conditions." — [Apple Pay Platform Web Merchant Terms](https://developer.apple.com/terms/apple-pay-web/)
- **"Platform Provider" in the merchant terms (§1.2):** "any e-commerce or payments platform provider (a) engaged by You or Your Affiliates to facilitate acceptance of payment transactions from or through Your Websites pursuant to a separate written agreement between You and such provider (the 'Provider Agreement'); and (b) has an active and valid Apple developer account with Apple." — [same](https://developer.apple.com/terms/apple-pay-web/)
- **Platform Provider acts for the merchant (§5):** "You may employ or retain a Platform Provider to assist You … provided that any such Platform Provider's use of the Apple Pay Web APIs or any materials associated therewith, including Personal Data, is done solely on Your behalf and for Your purposes, and only in accordance with a separate written agreement between Apple and such Platform Provider. In the event of any actions or inactions by the Platform Provider that would constitute a violation … Apple reserves the right to require You to cease using such Platform Provider." — [same](https://developer.apple.com/terms/apple-pay-web/)
- **Merchant Disclosures (§5):** The merchant authorizes its Platform Provider to "(a) provide to Apple and its Affiliates certain reports that may contain data related to Your participation in the Program; and (b) disclose to Apple … information related to You and Your Websites … including … metadata." — [same](https://developer.apple.com/terms/apple-pay-web/)
- **Term tied to the PSP relationship (§9.1):** The terms run in 1-year renewing terms but "shall immediately and automatically terminate in the event of any expiration or termination of the Provider Agreement." Either party may terminate for convenience on 30 days' notice (§9.2). — [same](https://developer.apple.com/terms/apple-pay-web/)
- **"Website" definition (§1.2):** "an e-commerce website developed by or on behalf of You, under Your name, trademark or brand, that runs in Safari on macOS and integrates with the Apple Pay Platform." This still names only Safari on macOS, although the HIG now describes Apple Pay in other browsers. The definition looks outdated (2023 text). — [same](https://developer.apple.com/terms/apple-pay-web/)
- **Direct Merchants / Platform Providers version (`/terms/apple-pay-web-direct-merchants`)**
  - **"Platform Provider" (§1.2):** must also "(c) ha[ve] agreed to the Platform Provider Addendum."
  - **"Registered Merchant" (§1.2):** "any Merchant that (a) is a customer of a Platform Provider, (b) has accepted and agreed the Apple Pay Web Merchant Terms and Conditions provided by the Platform Provider …; and (c) the Platform Provider has registered with Apple using the applicable Apple Pay Web APIs."
  - **§6.2:** "If You are a Platform Provider, You may provide Platform Provider Services only if permitted by Apple and pursuant to the terms and conditions of the Platform Provider Addendum."
  - **§4.2:** "Intermediary Party" in the DPLA "shall include Platform Provider."
  - The Platform Provider Addendum itself is not public.
  - Source: [Direct Merchants terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants)
- **Transaction responsibility (§12.1 merchant terms; §13.1 direct terms):** "You or, if applicable, Your Platform Provider shall be solely responsible for verifying the validity of transactions completed using the Apple Pay Web APIs prior to the delivery of any goods or services to an end-user." §12.2: "Apple shall not be liable in any event for any Unauthorized Transactions." — [merchant terms](https://developer.apple.com/terms/apple-pay-web/); [direct terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants)
- **Indemnity (§11(a)):** covers the merchant's and "any of your Platform Providers' actions or inactions … including … Unauthorized Transactions, claims regarding Your Websites, goods or services offered … and donations collected." — [merchant terms](https://developer.apple.com/terms/apple-pay-web/)
- **No sharing or resale of access:**
  - §3.4(a): "Except as permitted herein, You shall not, and shall not enable others to, share access to the Apple Pay Web APIs for the use of the Apple Pay Platform with any third party."
  - §3.3(g)(ix): You must not "sell or otherwise transfer the access granted herein."
  - Source: [merchant terms](https://developer.apple.com/terms/apple-pay-web/)
- **Security breach duties (§7):** The merchant must encrypt Personal Data before transmission. On a Security Breach, which includes data held by "Your Platform Providers," it must "promptly notify Apple," remediate, and give assurances. It must also link a privacy policy from its websites. — [merchant terms](https://developer.apple.com/terms/apple-pay-web/)

**DPLA §3.3.9(C) (current Oct 29, 2026 text), which binds any Apple developer using Apple Pay APIs in apps or "Corresponding Products"**

- **Apple is not a party:** "You acknowledge and agree that Apple is not a party to any payment transactions facilitated through the use of the Apple Pay APIs and is not responsible for any such transactions … Such payment transactions are between You and Your bank, acquirer, card networks, or other parties You utilize for transaction processing." — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- **Web use pulls in the AUG and Web Terms:** "If You use the Apple Pay APIs in Your Corresponding Products, then You agree to follow the Acceptable Use Guidelines for Apple Pay on the Web …, the applicable Apple Pay Platform Web Terms and Conditions, and related agreements." The DPLA defines "Corresponding Product" as "Your website, web application, or other version of Your software application." — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- **Contracting entity in the US:** For §3.3.9(C), "Apple" means Apple Payments Services LLC (Austin, TX). — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- **Merchant / Intermediary Party definitions (§1.2):**
  - **"Merchant":** a party who "(a) processes Apple Pay payment transactions … under their own name, trademark, or brand (e.g., their name shows up on the end user's credit card statement)."
  - **"Intermediary Party":** "a party that: (a) passes an Apple Pay end user's Apple Pay Payload to a Merchant for processing such end user's payment transaction outside of an Application or Corresponding Product."
  - Source: [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)

**Merchant registration and domains (Apple Web Merchant Registration API)**

- **What the API does:** It "enables platform integrators such as payment-service providers and e-commerce platforms to register web merchants who want to offer Apple Pay on the web … Merchants aren't required to set up an Apple Developer account or configure their own keys and certificates — you set up a shared set of keys and certificates for your entire merchant portfolio. Register merchants with their own website domains, or with web pages hosted by your platform." — [Apple Pay Web Merchant Registration API](https://developer.apple.com/documentation/applepaywebmerchantregistrationapi)
- **Who can use it:** The organization "must be enrolled in the Apple Developer program," "must apply for access to the API," and must call it over mutual TLS 1.2 or later. The planning page says "Approved e-commerce platform and payment service providers can use the Apple Pay Web Merchant Registration API." — [API overview](https://developer.apple.com/documentation/applepaywebmerchantregistrationapi); [Apple Pay planning](https://developer.apple.com/apple-pay/planning/)
- **Domain verification:** Platforms must "download and distribute [the] domain-verification file to each merchant before you register their domain … If merchants need to accept Apple Pay payments from pages hosted on your domain, host this file on your own domain also." The file goes at `https://[DOMAIN_NAME]/.well-known/apple-developer-merchantid-domain-association`. Sandbox does not require verification. — [Preparing merchant domains](https://developer.apple.com/documentation/applepaywebmerchantregistrationapi/preparing-merchant-domains-for-verification)
- **Request fields:**
  - `domainNames`: up to 99 per merchant.
  - `partnerInternalMerchantIdentifier`: "Each merchant your e-commerce platform serves must have a unique identifier."
  - `partnerMerchantName`: a human-readable name.
  - `merchantUrl`: "Supply this value when registering merchants using a shared payment page hosted on the payment platform's domain."
  - `encryptTo`: "Typically, use the payment platform integrator ID of the calling e-commerce platform. If a party other than the e-commerce platform decrypts the Apple Pay data, use their payment platform integrator ID."
  - Source: [RegisterMerchantRequest](https://developer.apple.com/documentation/applepaywebmerchantregistrationapi/registermerchantrequest)
- **Who can accept Apple Pay:** "Merchants in any country or region can accept payments with Apple Pay, as long as their payment service provider supports Apple Pay … Registered nonprofit organizations that would like to accept donations in their app or website must be approved by Apple." — [Apple Pay planning](https://developer.apple.com/apple-pay/planning/)

**Stripe implementation (search-result summaries only; docs.stripe.com and stripe.com were blocked)**

- **When domain registration is needed:**
  - Apple Pay in Elements or embedded Checkout requires every domain that shows the button to be registered.
  - "If you use Payment Links or hosted Checkout, Apple Pay works with no additional configuration."
  - Connect platforms using **direct charges** register each connected account's domain via the API with the `Stripe-Account` header.
  - With **destination charges or separate charges and transfers**, the platform registers under its own account.
  - "When a user runs a charge on a domain, the domain must be registered for that user, whether that user is your platform or the connected account."
  - Source: [Stripe: Register domains for payment methods](https://docs.stripe.com/payments/payment-methods/pmd-registration) (not fetched directly)
- **Stripe's pass-through terms:** Stripe hosts a document titled "Apple Pay Platform Web Terms and Conditions for Direct Merchants," and a search summary says merchants must agree to the Platform Provider Addendum framework. Not verified directly. — [stripe.com/apple-pay/legal](https://stripe.com/apple-pay/legal)
- **Other PSPs:** Revolut's Apple Pay terms bind its merchants to Apple's Web Merchant Terms (search summary only). — [Revolut](https://www.revolut.com/fi-FI/legal/payment-terms-applepay/)

### Inferences

- **Macoma's role:** Macoma is almost certainly *not* a Platform Provider in Apple's sense. Stripe is the Platform Provider and PSP that holds the Addendum and registers merchants and domains. Macoma's owners become "Merchants" under Apple's Web Merchant Terms through Stripe.
- **When Macoma becomes an Intermediary Party:** If Macoma uses Apple Pay APIs directly (its own iOS app, or Apple Pay JS on its own site rather than Stripe-hosted pages), it is bound by DPLA §3.3.9(C). If it passes the payload to the owner/merchant, it is an "Intermediary Party" (see Q4).
- **Lowest-friction setup:** Use Stripe-hosted invoice pages, Payment Links or hosted Checkout. Then Stripe handles domain registration, and Apple Pay works with no Macoma-side Apple agreement beyond what Stripe passes through.
- **If Macoma embeds Elements on its own pay domain** (e.g. `pay.macoma.…`):
  - With direct charges, Macoma must register that domain for each connected account.
  - With destination charges, it registers the domain once under the platform account.
- **Termination risk:** Because the merchant terms end when the "Provider Agreement" ends, an owner's Apple Pay acceptance through Macoma ends whenever their Stripe relationship ends.

### Gaps

- The Platform Provider Addendum is not public. I could not see what Apple requires of PSPs and platforms, such as KYC, merchant vetting or category screening.
- I could not fetch Stripe's Apple Pay terms page or Connect/Apple Pay docs directly, so the Stripe specifics above are from search summaries.
- I could not get a prior DPLA version (the Oct 2025 PDF link returned HTML), so I could not diff §3.3.9(C) against earlier text.

## Q2. What the Apple Pay Acceptable Use Guidelines prohibit; limits relevant to AI/agent use

### Takeaway
The web AUG bans a defined list of goods and businesses (tobacco/vape/marijuana, weapons, adult content, counterfeit goods, drug paraphernalia, hate). Some categories need Apple approval: personal fundraising and nonprofit donations, and currency or crypto purchase or transfer. It also bans "staged digital wallet" structures, including any "substitute merchant of record." Apple can disable Apple Pay on any site "for any reason it deems prudent." Apple's terms say nothing explicit about AI or agents. The payment sheet, however, requires the payer to authorize each payment biometrically on their own device. Reusing stored recurring credentials for other charges is barred.

### Cited Findings

**AUG prohibited list (verbatim)**

"You may not incorporate Apple Pay into a website that:
- Violates any law …
- Offers transactions involving: Tobacco, marijuana, or vaping products; Firearms, weapons, or ammunition; Illegal drugs or non-legally prescribed controlled substances; Items that create consumer safety risks; Items that are intended to be used to engage in illegal activities; Pornography; Counterfeit or stolen goods; Personal fundraising or collections of nonprofit donations unless approved by Apple
- Primarily offers or sells drug paraphernalia or sexually-oriented items or services
- Promotes hate, violence, or intolerance …
- Involves the purchase or transfer of currency (including cryptocurrencies) unless approved by Apple
- Constitutes a staged digital wallet (e.g., where a second payment transaction is conducted in order to complete the first transaction or where there is a substitute merchant of record in a transaction)
- Engages in fraud
- Infringes or violates the intellectual property, publicity, or privacy rights of another
- Shows Apple or its products in a false or derogatory light"

— [AUG for Apple Pay on the Web](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)

**Apple's discretion and purpose limits**

- **Disabling:** "Apple reserves the right at any time to disable Apple Pay transactions on your websites for any reason it deems prudent." — [AUG](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)
- **Purpose limit:** "You may not use the Apple Pay for any purpose other than to enable or facilitate an Apple Pay transaction from your website." — [AUG](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)
- **Not explicitly listed:** The AUG has no separate item for stored value, P2P or cash-like goods. The closest items are "purchase or transfer of currency … unless approved" and "staged digital wallet." — [AUG](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)
- **Balances permitted:** The DPLA, by contrast, *permits* stored-balance cash-out: "If Your Application stores end user balances, You may use Apple Pay APIs to transfer the funds to their issuers' cards provisioned in Apple Pay." The HIG lists "Reload," "Add Money" and "Top Up" button types for adding money to "a card, account, or payment system associated with a service, such as transit or a prepaid phone plan." — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/); [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**In-app scope and Apple Cash**

- **Physical goods and services only:** "Your Application may use the Apple Pay APIs solely for the purpose of facilitating payment transactions that are made by or through Your Application, and only for the purchase of goods and services that are to be used outside of any iPhone, iPad, or Apple Watch, unless otherwise permitted by Apple in writing … nothing in this Section 3.3.9(C)(i) supplants any of the rules or requirements for the use of the In-App Purchase API." — [DPLA §3.3.9(C)(i)](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- **Apple Cash option:** "If You use Apple Pay APIs in Your Application, then You agree to use commercially reasonable efforts to include Apple Cash as a payment option … provided that Apple Cash is available in the jurisdiction." — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)

**API-use limits**

- "You agree not to call the Apple Pay APIs or otherwise attempt to gain information through the Apple Pay APIs for purposes unrelated to facilitating end user payment transactions." — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- Web terms §3.3(b): no "harvesting or misusing data provided by such Apple Pay Web APIs." — [merchant terms](https://developer.apple.com/terms/apple-pay-web/)

**Credential reuse (relevant to agent-initiated charges)**

- Web terms §3.3(o) and Direct terms §4.4(i): "You agree not to repurpose or use recurring, subscription, automatic, deferred, or installment payment credentials for one-off payments; use that payment information for transactions other than the transaction(s) for which it was originally authorized; or swap, exchange, or replace that payment information with a representation of the same funding primary account number unless (a) permitted under the Program, (b) required by law, or (c) such exchange is initiated by an issuer." — [merchant terms](https://developer.apple.com/terms/apple-pay-web/); [direct terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants)
- Merchants must also "comply with all signals and instructions sent to You by Apple or the relevant payment network identifying a payment credential … as deleted or inactive" (§3.3(n)). — [merchant terms](https://developer.apple.com/terms/apple-pay-web/)

**User authorization**

- "People pay using Face ID, Touch ID, or Optic ID on supported devices, or by double-clicking on Apple Watch. In browsers, they can also pay using a nearby iPhone or Apple Watch, or by scanning a code with an iPhone or iPad." — [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**Other prohibitions in the Web terms (§3.3(g) / §4.4(d))**

- No fraudulent activity, "impersonating any person or entity, claiming false affiliations."
- No "unsolicited offers or advertisements, or attempt to collect personal information … without their consent."
- No overriding Apple "system alerts, warnings, display panels, consent panels."
- Breach of §4.4(d) allows Apple to terminate immediately.
- Source: [direct terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants)

**Nonprofits**

- Nonprofit donations require Apple approval. If amounts are collected for a third-party nonprofit, they must be "separately itemized on the Apple Pay payment sheet" (§3.3(f)(ii)(2)). — [merchant terms](https://developer.apple.com/terms/apple-pay-web/); [planning](https://developer.apple.com/apple-pay/planning/)

**AI and agents**

- A search for Apple statements on Apple Pay and AI-agent / agentic commerce found nothing from Apple. Results covered only industry protocols (Google AP2, the OpenAI–Stripe Agentic Commerce Protocol) and analyst forecasts. — [The Paypers overview](https://thepaypers.com/payments/expert-views/the-road-to-agentic-commerce-the-journey-so-far); [Visa 2026 predictions](https://corporate.visa.com/en/sites/visa-perspectives/trends-insights/2026-predictions.html)
- The only Apple Intelligence use I found tied to Apple Pay is consumer-side Wallet order tracking from Mail (WWDC25). — [WWDC25 "What's new in Apple Pay"](https://developer.apple.com/videos/play/wwdc2025/201/)

### Inferences

- **Screening owners:** Macoma onboards arbitrary small businesses, so it should screen or block Apple Pay for owners in AUG-prohibited categories: vape/smoke shops, CBD/cannabis, gun shops and gunsmiths, adult services, crypto, and personal fundraising or donation collection without Apple approval. Stripe has its own restricted-business list, which likely overlaps but is not identical. If Apple can disable Apple Pay per website, one bad owner on a shared Macoma-hosted pay domain could plausibly affect others. This is an inference: Apple's text says "your websites."
- **"Staged digital wallet / substitute merchant of record":** This is the key structural risk. It points toward a Stripe Connect charge type where the owner, not Macoma, is the merchant of record for the owner's invoices: direct charges, or destination charges with `on_behalf_of`. A structure where Macoma charges the customer as merchant and then pays the owner could be read as a "substitute merchant of record." This is my legal-risk inference, not an Apple ruling. The Stripe charge-type mechanics are from general knowledge and were not verified here because docs.stripe.com was blocked.
- **AI agent limits:** Nothing forbids an AI SMS assistant from *sending* a payment link. But the end customer must open the page and authorize on the Apple Pay sheet with biometrics or passcode. The agent cannot "tap Apple Pay" for the customer.
- **Later agent-initiated charges:** Any later charge the agent triggers (e.g. "charge the card on file for today's visit") must fit the scope originally authorized. §3.3(o) bars using a recurring or deferred Apple Pay credential for unrelated one-off charges.
- **Iffy use cases:** Deposits, tips and variable amounts are supported via deferred / "Amount Pending" flows (see Q3). Owner-to-owner or customer-to-customer transfers, or "adding money" to a Macoma balance, would hit the currency / staged-wallet language.

### Gaps

- Apple has no published guidance on agentic or AI-initiated Apple Pay transactions as of Oct 2026, or I could not find any.
- The AUG gives no definition of "personal fundraising" or "items that create consumer safety risks."
- I could not confirm whether Apple publishes a separate in-app acceptable-use list beyond the DPLA, App Review Guidelines and HIG.

## Q3. Requirements for presenting the payment sheet and Apple Pay branding

### Takeaway
- **Sheet timing:** The payment sheet must appear immediately after the Apple Pay button tap, with no interim screens except for necessary product details.
- **Line items and total:** Line items explain charges. The total line must read "Pay [Business Name]" using the same name the customer will see on their card statement.
- **Intermediaries and marketplaces:** Name both businesses, e.g. "Pay [End Merchant (via Your Business)]." The DPLA makes this mandatory for Intermediary Parties.
- **Buttons and parity:** Buttons must be Apple-API-generated. Apple Pay must be at parity with other wallets and be the primary option when the active-card API is used.
- **Recurring payments:** Billing frequency, trial terms and cancellation must be disclosed.

### Cited Findings

**Payment sheet timing and contents**

- **Immediately after tap:** "The payment sheet must be presented immediately after the user taps the Apple Pay button, without any interim screens or pop-ups except to prompt for necessary product details, such as size or quantity." — [Apple Pay planning](https://developer.apple.com/apple-pay/planning/)
- **Only necessary data:** "remember to show only what's necessary to process and service the transaction. You can configure line items to add relevant information such as shipping cost, taxes and discount." — [planning](https://developer.apple.com/apple-pay/planning/)
- **What line items are for:** "Use line items to explain additional charges, discounts, pending costs, add-on donations, recurring payments, and future payments … Don't use line items to show an itemized list of products that make up the purchase." — [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**Merchant name on the total line**

- "Provide a business name after the word Pay on the same line as the total. Use the same business name people will see when they look for the charge on their bank or credit card statement … For example, Pay [Business_Name]." — [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- **Marketplace / intermediary rule:** "If you're not the end merchant, identify both businesses in the payment sheet. When your app, App Clip, or website acts as an intermediary, such as a marketplace where people buy from third-party sellers, people may not realize two businesses are involved. Clearly describe the relationship in the Pay line using something like Pay [End_Merchant_Business_Name (via Your_Business_Name)]." — [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**Variable amounts, tips and pending costs**

- "Clearly disclose when people may incur additional costs after payment authorization … someone might want to add a tip after they receive their delivery … you can provide a clear explanation in the payment sheet and a subtotal marked as Amount Pending. If you're preauthorizing a specific amount, be sure the payment sheet accurately reflects this information." — [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**Subscriptions**

- **Before the sheet:** "Clarify subscription details before showing the payment sheet."
- **Line items:** "Include line items that reiterate billing frequency, discounts, and additional upfront fees … If no payment is required at authorization time, clearly disclose when billing will occur."
- **Trials:** show "the trial amount (including $0 if free), the regular amount after the trial, and the date regular billing begins."
- **Changes:** "Only show the payment sheet when a subscription change results in additional fees."
- Source: [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- **App Review 4.9:** "Apps using Apple Pay must provide all material purchase information to the user prior to sale of any good or service and must use Apple Pay branding and user interface elements correctly … Apps using Apple Pay to offer recurring payments must, at a minimum, disclose … The length of the renewal term and the fact that it will continue until canceled; What will be provided during each period; The actual charges that will be billed to the customer; How to cancel." — [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

**Buttons**

- **Apple-provided only:** "Always use the Apple-provided API to display Apple Pay buttons … Don't create custom Apple Pay button designs or try to replicate the Apple-provided ones."
- **Purpose only:** "Use Apple Pay buttons only to initiate payment or, when appropriate, the Apple Pay setup process … Don't use Apple Pay buttons in any other way."
- **Custom triggers:** A custom button that starts Apple Pay must not display "Apple Pay" or the logo. You must then show the Apple Pay mark or text on the same page.
- **Bill-pay button type:** The HIG lists a payment button type for "An app or website that lets people pay bills or invoices, such as those for a utility … or a service like plumbing or car repair." This matches Macoma's invoice use case.
- **Sizing:** "Make the Apple Pay button no smaller than other payment buttons, and avoid making people scroll to see it." Minimum 100pt × 30pt for the plain button.
- **Visibility:** "Don't hide an Apple Pay button or make it appear unavailable."
- Source: [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**Parity and primacy (binding contract terms, not just design guidance)**

- **AUG parity rule:** "If any webpage of your website accepts other forms of third party payment methods, you must also offer Apple Pay as a payment option on such webpage, at least on parity with such other payment methods (i.e., presented with the same prominence …). Furthermore, if you invoke the 'canMakePaymentWithActiveCard' API and determine that a user has an active card provisioned into Wallet, you must present Apple Pay as the primary – but not necessarily the sole – displayed payment option." — [AUG](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)
- **Web terms §3.3(m):** "the 'Apple Pay' button must be displayed as a payment option on Your Websites on parity with any other Comparable Platform." — [merchant terms](https://developer.apple.com/terms/apple-pay-web/)
- **Direct terms §4.4(g):** no declining or limiting transactions "in a manner that discriminates against transactions on the basis of their participation in the Program." — [direct terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants)

**Checkout flow**

- "Don't separate Apple Pay into a different step or flow."
- "Use your branding throughout the checkout experience and avoid opening different pages or windows."
- "Avoid requiring account creation before purchase."
- "All websites that offer Apple Pay must include a privacy statement."
- Source: [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**Trademark use**

- **Marketing Guidelines only:** The licence covers the Apple Marks "solely in accordance with the Apple Marketing Guidelines and solely for the purpose of facilitating Apple Pay Platform transactions." No suggestion that "Apple endorses or approves."
- **No paid ads without consent:** "You are not authorized to use Apple Marks on any paid advertising (including … social media), except upon Apple's prior review and written consent" (Direct terms §9.1).
- **No Apple marks in names:** No corporate, domain or trade names incorporating Apple Marks (§9.3).
- Source: [direct terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants); [merchant terms](https://developer.apple.com/terms/apple-pay-web/)
- **Text references:** Write "Apple Pay" exactly, "never make it plural or possessive." In the US, use ® on first body-text mention but not in checkout selection. Don't translate it. Don't use the Apple logo for "Apple." — [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**Updates**

- Merchants must update to new Apple Pay Web API versions "within a reasonable time period" (§3.3(k)). — [merchant terms](https://developer.apple.com/terms/apple-pay-web/)

### Inferences

- **Payment sheet label:** For an owner's invoice paid through a Macoma link, the total line should name the owner's business as it appears on the card statement (the connected account's statement descriptor). If Macoma is visibly in the flow, a label like "Pay Joe's Plumbing (via Macoma)" fits the HIG intermediary rule and is mandatory if Macoma is a DPLA Intermediary Party.
- **SMS flow:** The link can open a page with order or invoice details, and the Apple Pay button then opens the sheet directly. An interstitial "confirm with our AI" step between the button tap and the sheet would breach the "immediately after tap" rule.
- **Parity:** If Macoma's pay page shows Google Pay, Link or PayPal, Apple Pay must appear with equal prominence on Apple devices.
- **SMS marketing:** Any Macoma SMS marketing that uses "Apple Pay" in paid campaigns needs Apple's written consent. The Direct Merchants text bans paid-ad use of the marks without consent. It is unclear whether this binds merchants onboarded via a PSP, since the merchant version lacks this sentence.

### Gaps

- I did not fetch the Apple Pay Marketing Guidelines (developer.apple.com/apple-pay/marketing/) separately. Rules on using the Apple Pay mark in emails and SMS messages (e.g. "Pay with Apple Pay" text in a text message) are unverified.
- The HIG does not address SMS or chat-initiated checkout specifically.

## Q4. Who is "merchant of record," and rules on passing Apple Pay tokens/data to third parties

### Takeaway
Apple never uses "merchant of record" in its Web terms. It does say the following:
- The "Merchant" is the party processing under its own name, brand or card-statement name.
- A "substitute merchant of record" makes a site a prohibited staged digital wallet.
- Intermediaries passing Apple Pay data to a merchant face strict limits: use for the transaction and order management only, no longer retention than needed, no combining with other data, no marketing or profiling, disclosure of the merchant's identity on the payment sheet, and a written flow-down contract with the merchant.
- A party that only hosts a merchant checkout must not access the payload at all.

### Cited Findings

**Merchant identity**

- **DPLA "Merchant":** processes Apple Pay transactions "under their own name, trademark, or brand (e.g., their name shows up on the end user's credit card statement)." — [DPLA §1.2](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- **Substitute MoR banned:** a "staged digital wallet (e.g., where a second payment transaction is conducted in order to complete the first transaction or where there is a substitute merchant of record in a transaction)" is prohibited. — [AUG](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)
- **Neither Web terms document uses the phrase "merchant of record."** — [merchant terms](https://developer.apple.com/terms/apple-pay-web/); [direct terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants)

**Payload rules by role (DPLA §3.3.9(C)(ii), verbatim)**

"Apple may provide You (whether You are acting as the Merchant, an Intermediary Party, or displaying the Merchant web page that facilitates an Apple Pay end user payment transaction) with an Apple Pay Payload."

- **Merchant:** "may use the Apple Pay Payload to process the end user payment transaction and for other uses that You disclose to the end user, and only in accordance with applicable law."
- **Intermediary Party:**
  - "(a) You may use the Apple Pay Payload only for purposes of facilitating the payment transaction between the Merchant and the end user and for Your own order management purposes (e.g., customer service) as part of such transaction;"
  - "(b) … not hold the Apple Pay Payload data for any longer than necessary;"
  - "(c) … not combine data obtained through the Apple Pay APIs … with any other data that You may have about such end user (except to the limited extent necessary for order management purposes). For clarity, an Intermediary Party may not use data obtained through the Apple Pay APIs for advertising or marketing purposes, for developing or enhancing a user profile, or to otherwise target end users;"
  - "(d) You agree to disclose to end users that You are an Intermediary Party to the transaction and to provide the identity of the Merchant for a particular transaction on the Apple Pay Payment Sheet (in addition to including Your name as an Intermediary Party);"
  - "(e) … You will be responsible for ensuring that the Merchant You select uses the Apple Pay Payload provided by You only for purposes of processing the end user payment transaction and for other uses they have disclosed … You agree to have a binding written agreement with such Merchant with terms at least as restrictive and protective of Apple as those set forth herein. Any actions undertaken by any such Merchant … shall be deemed to have been taken by You."
- **Checkout host only:** "If You are displaying the Merchant web page … but are acting neither as an Intermediary Party nor a Merchant (i.e., You host a Merchant checkout through WKWebView), then: (a) You agree not to access the Apple Pay Payload for any reason whatsoever; and (b) You agree not to use information that is derived from or relates to the Apple Pay payment transaction for purposes other than displaying the Merchant web page."

— [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)

**Payload definition, key storage and encryption**

- **"Apple Pay Payload":** "a customer data package passed through the Apple Software and Apple Pay APIs as part of a payment transaction (e.g., name, email, billing address, shipping address, and device account number)."
- **Keys and device storage:** Private keys must be stored securely, e.g. "encrypted on a server." "You may not decrypt any such end user payment information on an iPhone or iPad."
- Source: [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- **Web terms §3.3(j):** "To the extent that You access or receive an Apple Pay Payload, You agree to use the Apple Pay Payload solely to process the end-user payment transaction and for other uses that You disclose to the end-user, and only in accordance with Applicable Law." — [merchant terms](https://developer.apple.com/terms/apple-pay-web/)
- **Who decrypts:** The Registration API `encryptTo` field sets who decrypts. Typically it is the platform integrator; "If a party other than the e-commerce platform decrypts the Apple Pay data, use their payment platform integrator ID or merchant ID." — [RegisterMerchantRequest](https://developer.apple.com/documentation/applepaywebmerchantregistrationapi/registermerchantrequest)

**App Review and metrics**

- **App Review 5.1.2(vii):** "Apps using Apple Pay may only share user data acquired via Apple Pay with third parties to facilitate or improve delivery of goods and services." — [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- **Apple Metrics:** These may not be disclosed without Apple's consent, including "metrics that … enable recipients to reasonably infer Apple Confidential Information" (Direct terms §7.2). — [direct terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants)

### Inferences

- **If Macoma never touches the payload:** In the expected setup, Stripe decrypts the Apple Pay token, the owner is the connected account, and Macoma never sees the payload. Macoma then mostly avoids Intermediary Party duties. It should still not pull Apple Pay-sourced names, emails or addresses from Stripe into its AI or CRM for marketing or profiling.
- **If Macoma's own app or site invokes Apple Pay for owners' customers:** If Macoma's iOS app or website invokes Apple Pay APIs itself on behalf of owners' customers, it is likely an Intermediary Party. It would then need:
  - "Pay [Owner] (via Macoma)" on the sheet;
  - no combining of payload data with its customer profiles (this matters for an AI assistant that builds customer memory);
  - written flow-down terms in its owner agreement.
- **Charge structure:** To avoid the "substitute merchant of record" ban, the owner's business should be the merchant on the card statement for invoice payments. Macoma's own subscription charge to owners is a normal case: Macoma is the merchant for that.

### Gaps

- Apple does not define "merchant of record" or say how it views Stripe Connect destination charges without `on_behalf_of`. Whether that structure counts as a "substitute merchant of record" is not stated by Apple. Ask Stripe and Apple.
- I could not verify whether Stripe sets the Apple Pay sheet's merchant name automatically for connected accounts.

## Q5. 2025–2026 changes

### Takeaway
The merchant-facing *contract* texts (both Web Merchant Terms) have not changed since March 10, 2023. The DPLA, which carries the Apple Pay API, Intermediary Party and payload rules, was updated October 29, 2026. The HIG was refreshed December 16, 2025 and June 8, 2026. Feature-level changes in 2025–2026 are: Merchant Category Code / card-aware buttons, preauthorized-payments presentation in Wallet via merchant tokens, Apple Pay in non-Safari browsers via QR / nearby device, and a redesigned checkout sheet in iOS 27. I found no new acceptable-use categories and no AI- or agent-specific rules.

### Cited Findings

**Versions**

- **DPLA:** "Developer Program License Agreement, including its Schedule 1 last updated October 29, 2026. Schedule 2 & 3 last updated October 13, 2026. Exhibits to Schedule 2 & 3 last updated August 27, 2026." — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- **Web Merchant Terms:** "Updated: 2023-3-10" on both documents. — [merchant terms](https://developer.apple.com/terms/apple-pay-web/); [direct terms](https://developer.apple.com/terms/apple-pay-web-direct-merchants)
- **HIG change log:**
  - June 8, 2026: "Refined guidance to reflect the latest Apple Pay appearance and capabilities."
  - December 16, 2025: "Clarified supported platforms, including web browsers and Apple Vision Pro."
  - June 10, 2024: link updates.
  - May 2, 2023: "Consolidated guidance into one page."
  - Source: [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- **Third-party browsers:** The current HIG says "In browsers, they can also pay using a nearby iPhone or Apple Watch, or by scanning a code with an iPhone or iPad." — [HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**WWDC25 (June 2025)**

- Merchants can pass a `merchantCategoryCode` in payment requests, in-app and on the web, so the button shows a card that will work.
- Preauthorized payments built on merchant tokens can now carry "an icon, a custom merchant name, a description and image for every payment," supplied via a Merchant Token API and Apple Business Connect. Without this, "customers will only see the default merchant name that comes from the payment network."
- Source: [WWDC25 "What's new in Apple Pay"](https://developer.apple.com/videos/play/wwdc2025/201/)

**WWDC26 (June 2026) / iOS 27 (secondary coverage only)**

- The online and in-app checkout sheet is redesigned to let users swipe between cards.
- "Tap to Share" for in-store contact sharing.
- Wallet pass changes.
- Source: [Cult of Mac](https://www.cultofmac.com/news/ios-27-upgrades-apple-wallet); [iPhone in Canada](https://www.iphoneincanada.ca/2026/06/09/more-apple-features-are-coming-this-fall-heres-everything-else-from-wwdc/)

**Clauses in the current DPLA §3.3.9(C) (Oct 2026)**

- the "Corresponding Products" clause, which applies the AUG and Web Terms to websites and web apps;
- the Apple Cash "commercially reasonable efforts" clause;
- the stored-balance cash-out permission;
- naming Apple Payments Services LLC as the US contracting entity.

I could not establish when these were added (see Gaps). — [DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)

### Inferences

- **What to rely on for compliance:** Macoma should treat these as the operative set: the 2023 Web Merchant Terms (via Stripe), the AUG (current, undated), the HIG (June 2026) and the Oct 2026 DPLA (if Macoma ships an iOS app or calls Apple Pay APIs itself).
- **Preauthorized-payments presentation:** If owners use Apple Pay for recurring or "card on file" billing, the 2025 merchant-token features affect how the owner's name and logo appear in customers' Wallet. Apple Business Connect registration may matter for small businesses.

### Gaps

- I could not obtain earlier DPLA versions (the 2025 PDF URL returned HTML), so I could not confirm which §3.3.9(C) clauses (Apple Cash, Corresponding Products, Intermediary Party rules) are new in 2025–2026 versus older.
- I could not find Apple's official WWDC26 Apple Pay developer session notes, so the iOS 27 changes come from secondary press.
- I could not determine an AUG revision date.
- I found no Apple announcement on agentic or AI-initiated Apple Pay payments through Oct 2026.

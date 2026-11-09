# Apple Pay merchant tokens (MPAN) and charging later: recurring, automatic reload, deferred (as of Oct 2026)

Research date: 2026-10-31. Primary sources are Apple developer docs, fetched through Apple's DocC JSON/Markdown mirrors (developer.apple.com/tutorials/data/...), plus WWDC22 session 10041, WWDC25 session 201, and the *Apple Pay Merchant Integration Guide* (March 2026 PDF).

**Access limits:** docs.stripe.com, docs.adyen.com and applepaypartners.apple.com would not resolve in this environment (ENOTFOUND). Apple has moved its old developer.apple.com/apple-pay/merchant-tokens/ page to applepaypartners.apple.com with a 301 redirect, so that page could not be read either. Stripe, Adyen and other processor claims below come from search-result snippets or third-party docs and are flagged as such.

---

## 1. Merchant tokens (MPANs) vs device tokens (DPANs), and which OS versions, networks and regions support them

### Takeaway
A DPAN is tied to one device. An MPAN ties together a card, a merchant and a user (Apple ID), so it survives device upgrades and resets. That makes it the token Apple wants merchants to use for charging customers later. Apple Pay requests an MPAN automatically whenever a payment request includes a recurring, automatic reload or deferred payment request, but it returns one only if the card issuer/network supports it. Otherwise the merchant gets a DPAN. Support started with iOS 16 / macOS 13 (deferred: iOS 16.4 / macOS 13.3). At launch the networks were Amex, Discover, Mastercard and Visa. Apple has never published a public list of supported regions or issuers.

### Cited Findings
- Apple's Merchant Integration Guide: "For one-time transactions, Apple Pay uses device-specific tokenized credit or debit card credentials (DPAN) in place of a Payment Account Number (PAN)." — [Apple Pay Merchant Integration Guide, March 2026 (PDF), p.4](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- "Apple Pay supports the use of merchant tokens (MPANs) to complete a variety of supported payments independent of a device. After the initial transaction, payment details can be stored to create follow-on transactions. A merchant token associates a payment card, merchant, and user, allowing for continuity across multiple devices, even when a device is upgraded or a card is removed." — [Merchant Integration Guide, p.18](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- "When any of these request types [recurringPaymentRequest, automaticReloadPaymentRequest, deferredPaymentRequest] are used to initiate an Apple Pay transaction, a merchant token is automatically requested by Apple, and where supported by the issuer, returned in the Apple Pay payload. If an issuer does not yet support merchant tokens, Apple Pay defaults back to returning the DPAN." — [Merchant Integration Guide, p.18](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- WWDC22 introduction: "we're introducing Apple Pay merchant tokens, a new kind of payment token tied to a customer's Apple ID, which can help you more reliably charge your customers on an ongoing basis… if Julie upgrades her iPhone, or resets her current phone, the book club can continue to reliably charge Julie her monthly membership fee." — [WWDC22 "What's new in Wallet and Apple Pay" (10041)](https://developer.apple.com/videos/play/wwdc2022/10041/)
- Networks at launch: "Apple Pay merchant tokens will be supported by American Express, Discover, Mastercard, and Visa, with support for other payment networks in the future." — [WWDC22 10041](https://developer.apple.com/videos/play/wwdc2022/10041/)
- WWDC25 confirms that merchant tokens are "a capability we released in iOS 16". — [WWDC25 "What's new in Apple Pay" (201)](https://developer.apple.com/videos/play/wwdc2025/201/)
- OS availability:
  - `PKRecurringPaymentRequest` and `PKAutomaticReloadPaymentRequest`: iOS 16.0, iPadOS 16.0, Mac Catalyst 16.0, macOS 13.0, visionOS 1.0. — [PKRecurringPaymentRequest](https://developer.apple.com/documentation/passkit/pkrecurringpaymentrequest); [PKAutomaticReloadPaymentRequest](https://developer.apple.com/documentation/passkit/pkautomaticreloadpaymentrequest)
  - `PKDeferredPaymentRequest`: iOS 16.4, iPadOS 16.4, Mac Catalyst 16.4, macOS 13.3, visionOS 1.0. — [PKDeferredPaymentRequest](https://developer.apple.com/documentation/passkit/pkdeferredpaymentrequest)
- On third-party browsers (Mac or other devices), the user needs "an Apple Pay-capable iPhone running iOS 18 or newer to authorize the transaction". — [Merchant Integration Guide, p.4](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- The example token-event payload shows the merchant token identifier format `merchantTokenIdentifier: 'MAPL...c5c2'`. — [Merchant Integration Guide, p.19](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- A third-party integration guide (Basis Theory) says its tokenization response includes a type field (`dpan` or `mpan`) so the backend knows which token it received. — [Basis Theory Apple Pay guide](https://developers.basistheory.com/docs/guides/apple-pay/implementation) (secondary; via search snippet)
- Primer advises that MPAN flows have to be tested in production with a real wallet and an issuer/network that supports merchant tokens. An Apple Developer Forums reply says merchant tokens come back "if supported by the issuer". — [Primer Apple Pay headless docs](https://www.primer.io/docs/connections/payment-methods/apple-pay/headless); [Apple Developer Forums thread 762275](https://developer.apple.com/forums/thread/762275) (via search snippets)

### Inferences
- Macoma cannot guarantee an MPAN. Whether a given card returns one depends on the issuer, so the backend has to handle both outcomes. With a DPAN, later charges still go through the processor as card-on-file / merchant-initiated transactions, but they are less reliable, because the DPAN dies if the user removes the card from the device or replaces the device.
- Macoma is SMS-first, so the Face ID approval would most likely happen on a web checkout page (Apple Pay on the Web in Safari, or a third-party browser with an iPhone running iOS 18+), not in a native app.

### Gaps
- Apple publishes no list of regions or countries where MPANs are issued, and no list of participating issuers. Apple's MPAN overview page now redirects to applepaypartners.apple.com, which could not be fetched. Whether networks beyond Amex/Discover/Mastercard/Visa had been added by Oct 2026 could not be verified.
- The minimum Apple Pay JS version for `recurringPaymentRequest`, `automaticReloadPaymentRequest` and `deferredPaymentRequest` on the web was not stated on the pages fetched.

---

## 2. What PKRecurringPaymentRequest, PKAutomaticReloadPaymentRequest and PKDeferredPaymentRequest (and their Apple Pay JS equivalents) require, and what the payment sheet shows

### Takeaway
All three request types require `paymentDescription`, a billing summary item and `managementURL`. `billingAgreement` and `tokenNotificationURL` are optional. The billing summary item is `regularBilling` for recurring, `automaticReloadBilling` for automatic reload and `deferredBilling` for deferred. Recurring billing carries the start/end dates and the interval unit and count, with optional `trialBilling`. Automatic reload carries the top-up amount and a threshold amount. Deferred carries the payment date, plus optional `freeCancellationDate` and `freeCancellationDateTimeZone`. The payment sheet shows the description, the billing details, the billing agreement (first 500 characters only), and a total that has to be the amount charged now. The total can be $0 for a trial.

### Cited Findings
**PKRecurringPaymentRequest / ApplePayRecurringPaymentRequest**
- Initializer: `init(paymentDescription: String, regularBilling: PKRecurringPaymentSummaryItem, managementURL: URL)`. The properties are:
  - `paymentDescription`: "A description … that Apple Pay displays to the user in the payment sheet"
  - `billingAgreement` (`String?`): "A localized billing agreement that the payment sheet displays to the user before the user authorizes the payment"
  - `regularBilling`: "including start and end dates, an interval, and an interval count"
  - `trialBilling` (optional)
  - `tokenNotificationURL` (`URL?`)
  - `managementURL` (`URL`, required): "A URL to a web page where the user can update or delete the payment method for the recurring payment"

  Usage note: "You must set the `recurringPaymentRequest` property on a `PKPaymentRequest` object." — [PKRecurringPaymentRequest](https://developer.apple.com/documentation/passkit/pkrecurringpaymentrequest)
- The web version has the same shape:
  ```
  dictionary ApplePayRecurringPaymentRequest {
    required DOMString paymentDescription;
    required ApplePayLineItem regularBilling;
    ApplePayLineItem trialBilling;
    DOMString billingAgreement;
    required DOMString managementURL;
    DOMString tokenNotificationURL;
  };
  ```
  It is set as `ApplePayPaymentRequest.recurringPaymentRequest`. — [ApplePayRecurringPaymentRequest](https://developer.apple.com/documentation/applepayontheweb/applepayrecurringpaymentrequest)

**PKAutomaticReloadPaymentRequest / ApplePayAutomaticReloadPaymentRequest**
- Initializer: `init(paymentDescription: String, automaticReloadBilling: PKAutomaticReloadPaymentSummaryItem, managementURL: URL)`. The properties are:
  - `automaticReloadBilling`: "Summary items that contain the top-up amount and balance threshold amount for the automatic reload payment"
  - `managementURL`: "A URL to a web page where the user can manage and delete the payment method for the automatic reload payment"
  - optional `billingAgreement` and `tokenNotificationURL`

  It is set via `PKPaymentRequest.automaticReloadPaymentRequest`. The class is described as being for "a store card top-up or a prepaid account". — [PKAutomaticReloadPaymentRequest](https://developer.apple.com/documentation/passkit/pkautomaticreloadpaymentrequest)
- WWDC22 description: "a balance is automatically topped up with a fixed amount whenever the balance drops below a certain threshold amount… perfect for things like store card top-ups and prepaid balances". The code sample uses `PKAutomaticReloadPaymentSummaryItem(label: "Coffee Shop Reload", amount: 25)` with `.thresholdAmount = 5`. — [WWDC22 10041](https://developer.apple.com/videos/play/wwdc2022/10041/)

**PKDeferredPaymentRequest / ApplePayDeferredPaymentRequest**
- Initializer: `init(paymentDescription: String, deferredBilling: PKDeferredPaymentSummaryItem, managementURL: URL)`. Optional properties are `billingAgreement`, `freeCancellationDate` ("The date before which you must cancel a deferred payment without incurring any cancellation charges"), `freeCancellationDateTimeZone` and `tokenNotificationURL`. The class covers "a hotel booking or a pre-order". — [PKDeferredPaymentRequest](https://developer.apple.com/documentation/passkit/pkdeferredpaymentrequest)
- The web version:
  ```
  dictionary ApplePayDeferredPaymentRequest {
    DOMString billingAgreement;
    required ApplePayLineItem deferredBilling;
    Date freeCancellationDate;
    DOMString freeCancellationDateTimeZone;
    required DOMString managementURL;
    required DOMString paymentDescription;
    DOMString tokenNotificationURL;
  };
  ```
  — [ApplePayDeferredPaymentRequest](https://developer.apple.com/documentation/applepayontheweb/applepaydeferredpaymentrequest)

**Web line-item fields (ApplePayLineItem)**
- `paymentTiming` (`ApplePayPaymentTiming`): "The time that the payment occurs as part of a successful transaction". The examples use `"recurring"` and `"deferred"`.
- `recurringPaymentStartDate`, `recurringPaymentIntervalUnit`, `recurringPaymentIntervalCount`, `recurringPaymentEndDate`.
- `deferredPaymentDate`: "The date, in the future, of the payment".
- `automaticReloadPaymentThresholdAmount`: "The balance an account reaches before the merchant applies the automatic reload amount".
- `type`: final or pending.

— [ApplePayLineItem](https://developer.apple.com/documentation/applepayontheweb/applepaylineitem)

**Mapping payment models to request types (Merchant Integration Guide)**
- `recurringPaymentRequest`: subscriptions with "the same transaction amount at fixed regular intervals"; "Recurring billing such as a utility bill, with a variable transaction amount at fixed regular intervals"; and installment/BNPL repayments.
- `automaticReloadPaymentRequest`: "add funds to a specific account automatically, triggered by a pre-determined threshold".
- `deferredPaymentRequest`: "car hire or hotel bookings with incidental charges", with "a free cancellation period and the date when payment will be taken".

— [Merchant Integration Guide, p.18](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)

**Payment sheet and disclosure rules**
- Billing agreement limits: "You should keep the billing agreement text short. The payment sheet will only show the first 500 characters." Also: "The billing agreement text is not intended to replace your normal billing and legal agreements. It's up to you to be compliant with your local recurring billing laws. If you have a legal agreement to show the customer, that might mean displaying it to the customer before you present the payment sheet." — [WWDC22 10041](https://developer.apple.com/videos/play/wwdc2022/10041/)
- Summary items: "your recurring payment will not be added to the payment request's summary items automatically. So be sure to add items for it to the summary items array. The total for the payment request should be the first amount that the customer will be charged." Customers "can tap on the Billing Details section to read further." — [WWDC22 10041](https://developer.apple.com/videos/play/wwdc2022/10041/)
- Request limits: "automatic payments cannot be used with multi-merchant payments" and "You can only request one type of automatic payment in a single transaction." — [WWDC22 10041](https://developer.apple.com/videos/play/wwdc2022/10041/)
- Human Interface Guidelines, "Supporting subscriptions" (page last changed June 8, 2026):
  - A recurring payment can be "a fixed amount … or — when local regulations allow — a variable amount like a weekly grocery order".
  - "Clarify subscription details before showing the payment sheet… make sure they fully understand the billing frequency and any other terms of service."
  - "Include line items that reiterate billing frequency, discounts, and additional upfront fees… If no payment is required at authorization time, clearly disclose when billing will occur."
  - "Clearly communicate trial period terms… the trial amount (including $0 if free), the regular amount after the trial, and the date regular billing begins."
  - "Clarify the current payment amount in the total line."
  - "Only show the payment sheet when a subscription change results in additional fees. When someone changes a subscription, authorization isn't necessary if the cost decreases or remains the same."
  - "Treat the billing agreement field as a plain-language summary, not a substitute for formal terms… When in doubt, leave this field blank."

  — [HIG: Apple Pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- HIG, other relevant rules:
  - "Clearly disclose when people may incur additional costs after payment authorization… when local regulations allow, you can provide a clear explanation in the payment sheet and a subtotal marked as Amount Pending."
  - "Provide a business name after the word *Pay*… Use the same business name people will see when they look for the charge on their bank or credit card statement."
  - "If you're not the end merchant, identify both businesses in the payment sheet… *Pay [End_Merchant_Business_Name (via Your_Business_Name)]*."
  - The website icon "can also appear in Wallet" for subscription payment flows.

  — [HIG: Apple Pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- The HIG also says "Use Apple In-App Purchase to sell virtual goods in your app, such as premium content, and subscriptions for digital content." — [HIG: Apple Pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

### Inferences
- **Subscription renewals** fit `recurringPaymentRequest`. Set `regularBilling` with the interval (for example `recurringPaymentIntervalUnit: "month"`, `recurringPaymentIntervalCount: 1`). A variable-amount recurring charge (for example usage billed monthly) is allowed only "when local regulations allow", and should be shown as a pending amount.
- **Auto-reloading reply packs** map cleanly to `automaticReloadPaymentRequest`. A typical setup is "reload a 100-reply pack for $X when the balance drops below N replies/credits". Note the threshold is a monetary amount (`automaticReloadPaymentThresholdAmount` is a currency string), so a credit balance has to be expressed as a money value.
- **"Pre-approved purchases"** of arbitrary future items do not map to any of the three types. Deferred covers one known future payment with a date. Recurring covers fixed intervals. Reload covers threshold top-ups. None of them is an open-ended authorization for unspecified future purchases (see section 3).
- **Digital vs physical goods:** Because the HIG says digital content subscriptions in an app should use In-App Purchase, Macoma has to check whether its reply packs and subscription count as "digital content". That check applies only if it is sold inside a native iOS app. The web/SMS flow is governed by Apple Pay on the Web rules. That question belongs to an adjacent research area.

### Gaps
- No Apple page fetched gave numeric limits: maximum amount, maximum interval, or how far ahead a `deferredPaymentDate` may be.
- The exact `ApplePayPaymentTiming` enum values were not fetched. `"recurring"` and `"deferred"` are confirmed from the examples. `"immediate"` and `"automaticReload"` are expected but were not verified.

---

## 3. What a merchant may do with a merchant token later (merchant-initiated transactions), and what is prohibited

### Takeaway
Apple describes MPANs as letting the merchant "store" payment details "to create follow-on transactions" without the user present, for the payment model that was set up (recurring, reload or deferred). The token is bound to one merchant identity: card + merchant + user. Apple's public docs do not contain a detailed MIT rulebook. The limits come from:
- what the payment sheet disclosed (the HIG says the user must understand the terms, and charges beyond them need a new authorization)
- Apple's acceptable-use rules for Apple Pay on the web, which ban "staged digital wallets" and substitute merchants of record
- the card-network MIT/credential-on-file rules that processors enforce

No Apple page fetched contains an explicit "you may not charge a different merchant with this MPAN" sentence. That limit follows from the token's binding to the merchant identifier, not from a quoted rule.

### Cited Findings
- "After the initial transaction, payment details can be stored to create follow-on transactions." — [Merchant Integration Guide, p.18](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- "A *merchant token* associates a payment card, merchant, and user." — [Receiving and handling merchant token notifications](https://developer.apple.com/documentation/applepaymerchanttokenmanagementapi/receiving-and-handling-merchant-token-notifications)
- Acceptable use: "You may not use the Apple Pay for any purpose other than to enable or facilitate an Apple Pay transaction from your website." Prohibited sites include one that "Constitutes a staged digital wallet (e.g., where a second payment transaction is conducted in order to complete the first transaction or where there is a substitute merchant of record in a transaction)." Also: "Apple reserves the right at any time to disable Apple Pay transactions on your websites for any reason it deems prudent." — [Acceptable use guidelines for Apple Pay on the web](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)
- HIG: "Before asking people to authorize a recurring payment, make sure they fully understand the billing frequency and any other terms of service." Also: "Only show the payment sheet when a subscription change results in additional fees", which implies that cost increases need a new authorization. — [HIG: Apple Pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- WWDC22: billing agreement text "is not intended to replace your normal billing and legal agreements. It's up to you to be compliant with your local recurring billing laws." — [WWDC22 10041](https://developer.apple.com/videos/play/wwdc2022/10041/)
- Apple's invalidation guidance: call **Invalidate a Merchant Token** when "Someone cancels a recurring transaction on your website or in your app that uses this merchant token" or "Someone changes the payment method for a recurring transactions". After that, "the token is no longer valid for future transaction authorizations." — [Invalidate a Merchant Token](https://developer.apple.com/documentation/merchanttokennotificationservices/unlinking-merchanttoken)
- Each transaction "generates a unique cryptogram in place of the CV2" for both DPAN and MPAN. — [Merchant Integration Guide, p.25](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- Merchant ID sharing: the same Merchant ID can be used across PSPs only "if you are decrypting the payload yourself… Where the PSP s will be performing decryption, they should each have their own, unique merchant identifier." — [Merchant Integration Guide, FAQ p.24](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- Paysafe (a processor) says customer-initiated transactions that use a saved Apple Pay merchant token as card-on-file are not allowed on its platform. It also says that if the consumer starts a new recurring cycle with the same card in the same app or site, Apple Pay returns the same merchant token. — [Paysafe Apple Pay recurring transactions](https://developer.paysafe.com/en/api-docs/payments-api/add-payment-methods/apple-pay/apple-pay-recurring-transactions/) (via search snippet; processor-specific, not Apple policy)
- Multi-merchant payments (multiple tokens for different merchants in one checkout, for marketplaces) exist, but "automatic payments cannot be used with multi-merchant payments." — [WWDC22 10041](https://developer.apple.com/videos/play/wwdc2022/10041/)

### Inferences
- **Allowed (best reading of the sources):**
  - Charging subscription renewals on the disclosed schedule and amount.
  - Charging the disclosed reload amount when the disclosed threshold is crossed.
  - Taking the disclosed deferred payment on or after the disclosed date.
  - All of these are merchant-initiated transactions with the user absent.
- **Likely prohibited or high risk:**
  - Charging amounts or frequencies beyond what the sheet disclosed. A price increase needs re-authorization.
  - Using a subscription MPAN for unrelated one-off "pre-approved" purchases. Paysafe explicitly disallows CIT use of an MPAN.
  - Using a token issued to Macoma's merchant identity to charge on behalf of a different merchant of record. This falls under the staged wallet / substitute merchant-of-record ban.
  - Continuing to charge after cancellation. Apple instructs merchants to invalidate the token.
- **For Macoma:**
  - One Face ID approval can legitimately cover (a) a subscription with defined renewals and (b) a defined auto-reload rule.
  - It cannot be stretched into a general "charge me for anything later" mandate.
  - Only one automatic payment type is allowed per transaction, so a subscription and a reload rule need two separate Apple Pay authorizations.

### Gaps
- No Apple document fetched states MIT-specific rules: allowed amount variance, network MIT indicators, or Apple-specific chargeback rules for MPAN charges. The Apple Pay Platform Web Merchant Terms and the network rules (Visa/Mastercard credential-on-file frameworks) were not reviewed here.
- Whether a deferred-payment MPAN may be reused for later incidental charges (for example, hotel incidentals) beyond the single disclosed deferred amount is not documented in the pages fetched. The integration guide mentions "car hire or hotel bookings with incidental charges", which suggests some flexibility, but no limits are stated.

---

## 4. How users and Apple manage and revoke tokens, and the lifecycle events a merchant must handle

### Takeaway
- **Users** manage merchant tokens in Wallet. Since WWDC25 (2025) there is a dedicated "preauthorised payments" view under Wallet > More > Payments, or from the card details screen. It lists each merchant's preauthorized payments and can send notifications about upcoming payments.
- **Users and issuers** can delete or unlink a token.
- **Apple** sends lifecycle notifications to the merchant's `tokenNotificationURL`. Apple sends a GET with an `eventId`. The merchant then POSTs to Apple's gateway to fetch the event details, which stay available for 7 days. Events include `UNLINK` (with reasons like `UNLINKDEVICE`) and card changes such as a new expiry date.
- **Merchants** must call "Invalidate a Merchant Token" when the user cancels or switches payment method.
- **Optionally**, merchants can push branded usage information (past and upcoming payments) to Wallet through the Merchant Token Usage Information API. This is new since 2022.

### Cited Findings
- "Merchant tokens offer a reliable solution for taking recurring, deferred, and automatic reload payments with Apple Pay. Users can manage their merchant tokens in Wallet." — [Apple Pay Merchant Token Management API](https://developer.apple.com/documentation/merchanttokennotificationservices)
- "Apple Pay utilizes a tap-and-pull model… the Apple Pay server notifies you of an event. Then you can subsequently retrieve the event details using the provided `eventId`. You can access the event details for seven days." Also: "you can call the Apple Pay server to unlink Merchant Primary Account Numbers (MPANs). Access to the APIs between the Apple Pay server and the merchant requires mutual TLS." — [Apple Pay Merchant Token Management API](https://developer.apple.com/documentation/merchanttokennotificationservices)
- Lifecycle examples: "the card's expiration date changes, or the user or issuer deletes the token". — [Receiving and handling merchant token notifications](https://developer.apple.com/documentation/applepaymerchanttokenmanagementapi/receiving-and-handling-merchant-token-notifications)
- **Notification endpoint and handling.** Apple's documented endpoint format and behaviour — [Receiving and handling merchant token notifications](https://developer.apple.com/documentation/applepaymerchanttokenmanagementapi/receiving-and-handling-merchant-token-notifications):
  - The endpoint accepts `GET https://merchant.example.com/your-endpoint-for-notification/notification/merchantToken/{eventId}`. Apple appends `notification/merchantToken/{eventId}` to whatever base URL the merchant supplies.
  - Respond `200 OK` even if the token or event is unknown. Respond `500` if processing fails.
  - "Apple Pay immediately retries the notification up to three times if the response isn't 200."
  - Allow-list the inbound IPs `17.58.0.0/18` and `17.58.192.0/18`.
  - The server must support HTTPS with TLS 1.2.
- **Event retrieval and example payload.** Event details are fetched with `POST https://apple-pay-gateway.apple.com/paymentServices/v1/merchantId/{merchantId}/merchantToken/event/{eventId}`, which returns a `merchantTokenEventResponse`. Apple's example payload is `{ statusCode: 200, merchantTokenEvent: { merchantTokenIdentifier: 'MAPL...c5c2', eventType: 'UNLINK', reason: 'UNLINKDEVICE' } }`. Apple's guidance: "when a consumer revokes the payment authorization on a token and you receive the UNLINK event, trigger a notification to the customer to update their payment details before the next billing cycle commences." — [Merchant Integration Guide, p.19](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- Merchant tokens give visibility into "account status, bank card art, and card expiration date". — [Merchant Integration Guide, p.19](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- **Other API objects and endpoints:**
  - `TokenMetadata` and `EncryptedTokenMetadata`, which carry the MPAN and its expiry.
  - `CardMetadata`: expiry and suffix.
  - `CardArt`.
  - **Update Merchant Metadata**: changes the token's notification URL.
  - **Invalidate a Merchant Token**, with a `MerchantTokenUnlinkRequest` body. Its internal identifier is `post:paymentservices-v1-merchantId-{}-merchantToken-unlink`.

  — [Apple Pay Merchant Token Management API](https://developer.apple.com/documentation/merchanttokennotificationservices); [Invalidate a Merchant Token](https://developer.apple.com/documentation/merchanttokennotificationservices/unlinking-merchanttoken)
- `tokenNotificationURL` is optional. Per WWDC22, it lets you "receive notifications if the card issuer or the user deletes the token". — [WWDC22 10041](https://developer.apple.com/videos/play/wwdc2022/10041/)
- **WWDC25 (2025): the preauthorized payments view in Wallet.** Merchants can now add their own branding and payment details — [WWDC25 201](https://developer.apple.com/videos/play/wwdc2025/201/):
  - Location: "The new preauthorised payments view can be found in the Wallet app by selecting Payments from the new More menu, or via the card details view."
  - Users "can view all of their preauthorised payments in one place, and receive notifications about upcoming payments."
  - Merchants "can provide an icon, a custom merchant name, a description and image for every payment."
  - "If you do not provide Merchant Token Usage Information, customers will only see the default merchant name that comes from the payment network."
  - The data is "end-to-end encrypted between you and the customer's device… not even Apple can see any preauthorised payment information."
- **Usage Information package format:**
  - A zip with `usageInformation.json`, the merchant logo, product images and optional `.lproj` localizations, at most 5 MB in total.
  - Monetary values are not currency-converted.
  - Delivery runs through the "Retrieve Merchant Token Public Key", "MerchantToken Usage Data Availability Notification" and "Get MerchantToken Usage Information Package" endpoints, with objects like `UpcomingPayment`, `PastPayment`, `PaymentIssueDetails`, `RecurringPaymentDetails`, `AutomaticReloadPaymentDetails` and `DeferredPaymentDetails`.

  — [Adding merchant token usage information](https://developer.apple.com/documentation/applepaymerchanttokenmanagementapi/adding-merchant-token-usage-information); [Apple Pay Merchant Token Management API](https://developer.apple.com/documentation/merchanttokennotificationservices)
- **Developer Forums problems:**
  - A sandbox test of unlinking produced no notification.
  - Another poster said the docs on deactivating tokens after a cancellation seemed incomplete.

  — [Developer Forums thread 821041](https://origin-devforums.apple.com/forums/thread/821041); [Developer Forums thread 745315](https://developer.apple.com/forums/thread/745315) (via search snippets)

### Inferences
- Macoma should do the following:
  - Provide a `managementURL`, which is required.
  - Implement `tokenNotificationURL` (or rely on its processor to do so; see section 5).
  - On `UNLINK`, stop future charges and text the owner a link to re-authorize.
  - Call Invalidate when the owner cancels.
  - Optionally adopt the Usage Information API so Wallet shows "Macoma" branding and upcoming renewal/reload amounts. That would reduce "unknown charge" disputes.
- Users can see and manage these authorizations from Wallet without contacting Macoma. Macoma has to assume any token can disappear at any time.

### Gaps
- The full `eventType` and `reason` enums could not be retrieved; the `MerchantTokenEventResponse` doc page rendered without fields. Only `UNLINK` / `UNLINKDEVICE` are confirmed.
- The WWDC25 transcript does not explicitly say users can cancel a payment from the Wallet view, only that they can "manage the payment". The minimum OS for the preauthorized payments view (presumably iOS 26) was not stated in the transcript.

---

## 5. How processors (Stripe, Adyen) implement Apple Pay merchant tokens and recurring payments, and whether a Stripe Connect platform can use merchant tokens for connected accounts

### Takeaway
- **Stripe** supports MPANs in the Express Checkout Element, the web Payment Element and the mobile Payment Element by passing `applePay.recurringPaymentRequest`, `applePay.deferredPaymentRequest` or `applePay.automaticReloadPaymentRequest` (with `automaticReloadBilling`). Stripe Checkout requests merchant tokens automatically. Stripe recommends PaymentIntents/SetupIntents rather than the legacy Tokens/Charges APIs for recurring Apple Pay.
- **Adyen** passes `recurringPaymentRequest` (including `tokenNotificationURL`) in its Apple Pay component configuration and uses its standard tokenization (shopper reference plus recurring processing model) for later charges.
- **Stripe Connect:** no source found says how MPANs behave under Connect (direct vs destination charges, `on_behalf_of`). This is a key open gap. The Stripe docs could not be fetched directly.

### Cited Findings
- Stripe describes an MPAN as tying "together a payment card, a business, and a customer, and enables the wallet holder to manage access to a card stored in their Apple wallet". Stripe also says Apple's guidelines "recommend merchant tokens over device tokens (DPANs) because merchant tokens: Allow for continuity across multiple devices; Enable recurring payments independent of a device." — [Stripe: Apple Pay merchant tokens](https://docs.stripe.com/apple-pay/merchant-tokens) (via search snippet; page not fetchable here)
- Stripe: "You can add a merchant token when presenting Apple Pay in the Express Checkout Element, web Payment Element, and mobile Payment Element. Stripe automatically handles merchant token requests in Stripe Checkout integrations." — [Stripe: Apple Pay merchant tokens](https://docs.stripe.com/apple-pay/merchant-tokens) (via search snippet)
- Stripe's sample code passes `recurringPaymentRequest` (with `paymentDescription`, `regularBilling` and `managementURL`) and `deferredPaymentRequest` inside the `applePay` option of `elements.create('expressCheckout', …)`. It uses `automaticReloadBilling` for reload. — [Stripe merchant tokens, deferred/ECE variant](https://docs.stripe.com/apple-pay/merchant-tokens?mpan=deferred&pay-element=ece) (via search snippet)
- Stripe "discourages the legacy Tokens and Charges APIs for recurring Apple Pay payments and recommends PaymentIntents and SetupIntents". — [Stripe: Apple Pay recurring](https://docs.stripe.com/apple-pay/apple-pay-recurring) (via search snippet)
- Stripe lists Apple Pay as supporting Connect and recommends merchant tokens for merchant-initiated recurring and deferred payments. The search summary gave no Connect-specific MPAN details. — [Stripe Apple Pay (web)](https://docs.stripe.com/apple-pay.md?platform=web) (via search snippet)
- Adyen's React Native Drop-in guide says recurring Apple Pay requires creating a shopper token and then making later recurring transactions with it. It lists `tokenNotificationURL` inside `recurringPaymentRequest` as the endpoint for Apple Pay merchant-token lifecycle updates. — [Adyen Apple Pay React Native Drop-in](https://docs.adyen.com/payment-methods/apple-pay/react-native-drop-in) (via search snippet; docs.adyen.com not fetchable here)
- A third-party Adyen tutorial shows `RecurringProcessingModel = Subscription` with `EnableRecurring = true`. It says Adyen later returns the stored token and shopper reference via webhook, and mentions `UnscheduledCardOnFile` for unscheduled charges. — [Dev.to: Use Adyen tokenization to implement subscriptions](https://dev.to/adyen/use-adyen-tokenization-to-implement-subscriptions-in-net-4fkl) (secondary)
- Apple's integration guide says that when a PSP decrypts the payload, each PSP needs its own merchant identifier. — [Merchant Integration Guide, FAQ](https://developer.apple.com/apple-pay/Apple-Pay-Merchant-Integration-Guide.pdf)
- Apple HIG for intermediaries: "If you're not the end merchant, identify both businesses in the payment sheet… *Pay [End_Merchant_Business_Name (via Your_Business_Name)]*." — [HIG: Apple Pay](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

### Inferences
- If Macoma is the merchant of record (it charges the owner for its own subscription and reply packs on its own Stripe account), the Connect question doesn't arise. The standard Stripe path is:
  1. Use the Express Checkout Element or Payment Element with `applePay.recurringPaymentRequest` / `automaticReloadPaymentRequest`.
  2. Use `setup_future_usage: 'off_session'` on the PaymentIntent (or a SetupIntent).
  3. Make later off-session PaymentIntents against the saved PaymentMethod.

  This follows the usual Stripe saved-card pattern and is an inference. The MPAN-specific Stripe text was not directly verified.
- If Macoma wants to charge owners on behalf of connected accounts (other businesses), the merchant token would be bound to whichever Apple Pay merchant identity / merchant of record appeared on the payment sheet. Apple's "staged digital wallet / substitute merchant of record" ban means a token obtained in Macoma's name should not be used to charge for a different business. The sheet must name the end merchant ("Pay X (via Macoma)").
- Who receives `tokenNotificationURL` events when Stripe hosts Apple Pay (Stripe-managed merchant identifier) is unverified. Stripe's docs reportedly let merchants supply their own `tokenNotificationURL`, but how Stripe relays lifecycle events (if at all) could not be confirmed.

### Gaps
- **Stripe Connect plus MPAN:** no source found addresses whether MPANs work for direct charges on connected accounts, destination charges, or `on_behalf_of`, or which account the token is bound to. This needs direct reading of docs.stripe.com/apple-pay/merchant-tokens and Stripe Connect Apple Pay docs, which were not fetchable here.
- **Stripe event handling:** whether Stripe surfaces Apple MPAN lifecycle events (unlink, card update) as Stripe webhooks or PaymentMethod updates is unverified.
- **Adyen and Checkout.com:** exact field names and MPAN handling were not verified from primary docs. docs.adyen.com was blocked, and Checkout.com was not reached within the tool budget.

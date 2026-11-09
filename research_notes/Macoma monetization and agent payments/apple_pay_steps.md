# Apple Pay for Macoma: exact setup steps (Stripe, Connect, Wallet passes, Messages for Business)

Research date: 2026-10-22. **How each source was read:**
- **[F]** means I fetched the primary source and read it.
- **[S]** means the page could not be fetched from this environment. The egress proxy refused docs.stripe.com, stripe.com, support.stripe.com, register.apple.com and applepaypartners.apple.com. For these, the claim comes from a search-engine summary of that page. Re-check any [S] claim on the live page before relying on it.
- **Stripe facts that are [F]** come from Stripe's official OpenAPI spec on GitHub, API version `2026-09-30.endive`, fetched on 2026-10-22.
- **Repo context:** the code already uses Checkout Sessions for the subscription in `src/billing.ts`. For owner invoices, `src/business.ts` uses direct-charge invoices on connected accounts, with the `stripeAccount` header and `application_fee_amount`, and sends `hosted_invoice_url`. The steps below target that design.

## Q1. The ordered checklist for flow A (owner pays the Macoma subscription) and flow B (the owner's customer pays the owner's invoice)

### Takeaway
Macoma uses Stripe-hosted pages: Checkout for the subscription and the hosted invoice page for owner invoices. With those pages, Apple Pay needs no Apple Developer account, no certificate and no domain file. The work is:
1. Activate Stripe.
2. Leave Apple Pay "on" in the payment methods settings (for the platform and for connected accounts).
3. Test with a real card in Safari while using test keys.

Two things add more work:
- **Domain registration and the `/.well-known` file** are only needed if Macoma later embeds Apple Pay on its own pages (Express Checkout Element or Payment Element).
- **The Apple Developer Program ($99/yr)** is only needed for Wallet passes (C) or Apple Pay inside Messages for Business (D).

### Cited Findings

**Step 0. Prerequisites (founder, about 1 hour, free)**
- **Legal name.** Decide whether you enroll as a sole proprietor or an LLC. Stripe needs a verifiable EIN or SSN. A sole proprietor without an EIN can use an SSN (or an ITIN) instead. — [Stripe support: sole proprietor without EIN [S]](https://support.stripe.com/questions/signing-up-for-stripe-as-a-sole-proprietor-without-employer-id-number)
- **SSN is still required.** "Even when using an EIN to verify a business, you are still required to provide the SSN for the individuals associated with every US Stripe account." — [Stripe support: US account without tax ID [S]](https://support.stripe.com/questions/signing-up-for-a-us-stripe-account-without-a-tax-id-or-employer-id-number)
- **HTTPS.** Any page you host yourself that shows Apple Pay must be served over HTTPS. It needs a valid SSL certificate and TLS 1.2 or later with one of Apple's listed cipher suites, such as TLS_AES_128_GCM_SHA256 or ECDHE-RSA-AES128-GCM-SHA256. — [Apple: Setting Up Your Server [F]](https://developer.apple.com/documentation/applepayontheweb/setting-up-your-server)
- **Privacy statement.** "All websites that offer Apple Pay must include a privacy statement and adhere to the [Acceptable Use Guidelines]." — [Apple HIG: Apple Pay [F]](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

**Step 1. Create and activate the Stripe account (founder; dashboard.stripe.com; free)**
- **Data needed.** The representative's date of birth and the last 4 digits of their SSN are required for Stripe's mandatory identity verification. — [Stripe support [S]](https://support.stripe.com/questions/signing-up-for-a-us-stripe-account-without-a-tax-id-or-employer-id-number)
- **Bank account.** A linked bank account is needed for payouts, preferably a dedicated business account. This is a third-party source, not Stripe. — [Wise blog [S]](https://wise.com/us/blog/stripe-sole-proprietor)
- **What to look for and how this fails:** see Q2.

**Step 2. Confirm Apple Pay is enabled (founder; Stripe Dashboard payment methods settings; free)**
- **API setting.** In the API, the payment-methods setting is a Payment Method Configuration. Each one has an `apple_pay.display_preference.preference` of `on`, `off` or `none`.
- **No extra fee.** Stripe's own description: "There are no additional fees to process Apple Pay payments, and the pricing is the same as other card transactions." — [Stripe OpenAPI spec, POST /v1/payment_method_configurations [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)
- **Invoices.** Apple Pay is not a separate invoice payment-method type. The invoice `payment_settings.payment_method_types` list has `card` but no `apple_pay`. Apple Pay appears as a card wallet (`card.wallet.type = apple_pay`) on the resulting PaymentMethod. — [Stripe OpenAPI spec [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)

**Step 3 (flow A). Sell the subscription through Stripe Checkout (founder or AI agent in code; free beyond fees)**
- **No setup on hosted pages.** Stripe's Apple Pay guide says hosted Checkout and Payment Links work "with no additional configuration". Domain registration is only needed "for Elements or embedded Checkout". — [Stripe docs: Apple Pay [S]](https://docs.stripe.com/apple-pay)
- **Merchant tokens are automatic.** "Stripe automatically handles merchant token requests in Stripe Checkout integrations." — [Stripe docs: Apple Pay merchant tokens [S]](https://docs.stripe.com/apple-pay/merchant-tokens)
- **Custom Checkout domain.** If you set a custom domain such as `pay.macoma…` on Checkout or Payment Links, browser wallets keep working with "no custom registration of your domain needed with Apple or Google". — [Stripe support: custom domain FAQ [S]](https://support.stripe.com/questions/custom-domain-on-stripe-checkout-faq)

**Step 4 (flow B). Onboard each owner as a connected account, then invoice on that account**
- **Invoice on the owner's account.** To create an invoice that directly charges a connected account, create it while authenticated as the connected account. The customer must already exist on that account.
- **Platform fee.** The fee is set with `application_fee_amount`.
- **Who carries costs.** With direct charges, the connected account bears Stripe fees, refunds and chargebacks. — [Stripe docs: Create invoices with Connect [S]](https://docs.stripe.com/connect/invoices)
- **API rule for the fee.** "`application_fee_amount`: A fee in cents … applied to the invoice and transferred to the application owner's Stripe account. The request must be made with an OAuth key or the Stripe-Account header in order to take an application fee." — [Stripe OpenAPI spec, POST /v1/invoices [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)
- **Apple Pay on invoices.** Stripe's invoicing product page says each invoice is optimized for mobile, tablet and desktop "with a responsive design that offers Apple Pay and Google Pay". — [Stripe Invoicing [S]](https://stripe.com/invoicing)

**Step 5. Register a payment-method domain ONLY if Macoma embeds Apple Pay on its own site (founder; Dashboard → Settings → Payment method domains, or the API)**
- **Applies only to Elements and Embedded Checkout.** "Stripe Elements use registered payment method domains to control where certain payment methods are shown." On validation, "The payment method doesn't appear in Elements or Embedded Checkout for this domain until it is active." — [Stripe OpenAPI spec, payment_method_domain and /validate [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)
- **API calls:**
  - `POST /v1/payment_method_domains` with `domain_name`
  - `GET /v1/payment_method_domains` to list
  - `POST /v1/payment_method_domains/{id}/validate` to re-check after fixing a problem
- **What to look for.** The object has `apple_pay.status` of `active` or `inactive`. When inactive, `status_details.error_message` gives the reason. The object also has `enabled` and `livemode`. — [Stripe OpenAPI spec [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)
- **Every domain and subdomain counts.** Register each one, for example `yourdomain.com`, `www.yourdomain.com` and `shop.yourdomain.com`. Register domains for testing too. Use ngrok for a local HTTPS URL. — [Stripe docs: Apple Pay [S]](https://docs.stripe.com/apple-pay); [Stripe pmd-registration [S]](https://docs.stripe.com/payments/payment-methods/pmd-registration)
- **Once per domain.** "You only need to register your domain once", and the registration covers wallets you add later. — [Stripe support: register domains [S]](https://support.stripe.com/questions/register-domains-for-payment-methods)
- **The `/.well-known` file.** See Q4.

**Step 6. Test (founder on an iPhone or Mac; free)** — see Q7.

**Step 7. Put Apple Pay wording on the landing page (founder)** — see Q8.

### Inferences
- **No Apple account needed for A and B.** The repo uses Checkout (flow A) and the hosted invoice page (flow B). Steps 0–4 and 6–7 are therefore all that is needed for Apple Pay on A and B. Step 5 and every Apple Developer step can be skipped for launch.
- **Estimated time.** A founder could plausibly finish Steps 1–4 and 6 in one day, because they are dashboard settings plus code the repo already has. Stripe identity review can take longer. That timing is an estimate, not a sourced figure.
- **Do not hard-code `payment_method_types: ['card']` without checking.** Apple Pay is a card wallet, so it should still appear with `card` alone. However, listing types explicitly bypasses dynamic payment methods. Leaving `payment_method_types` unset lets the Dashboard settings in Step 2 decide.
- **Common reasons Apple Pay does not appear even when everything is configured:**
  - the browser is not Safari or a supported Apple device
  - no card is in Wallet
  - the page is not HTTPS
  - Apple Pay is turned `off` in the payment-method configuration
  - for Elements only, the domain is not registered or is `inactive`

### Gaps
- I could not open the live Stripe Dashboard or docs. The exact menu labels are unverified: "Settings → Payments → Payment methods" and "Settings → Payment method domains" at `dashboard.stripe.com/settings/payment_methods` and `/settings/payment_method_domains`. These are the commonly cited paths. Confirm them in the Dashboard.
- I found no sourced figure for how long Stripe account activation or verification typically takes.

## Q2. Stripe account activation: requirements, cost, time, what to look for, failure reasons

### Takeaway
A US account needs the legal entity type, an EIN or SSN, the representative's SSN (last 4) and DOB, and a bank account for payouts. A sole proprietor can activate with an SSN only. There is no setup or monthly fee.

### Cited Findings
- **EIN or SSN.** Stripe requires a verifiable EIN or SSN. Sole proprietors can say whether they have an EIN. "If you do not have an EIN, or if you would rather use your Social Security Number (SSN) instead, select the option that your business does not have an EIN." — [Stripe support [S]](https://support.stripe.com/questions/signing-up-for-stripe-as-a-sole-proprietor-without-employer-id-number)
- **SSN, DOB and EIN together.** The SSN of the associated individuals is required even with an EIN. DOB and the last 4 digits of the SSN are part of mandatory identity verification. — [Stripe support [S]](https://support.stripe.com/questions/signing-up-for-a-us-stripe-account-without-a-tax-id-or-employer-id-number)
- **No business license needed.** Stripe does not require a business license to open an account, though local or state registration rules still apply. This is a third-party claim. — [Wise blog [S]](https://wise.com/us/blog/stripe-sole-proprietor)
- **No fees for the account.** Standard US online card rate is 2.9% + 30¢, with "no setup or monthly fees on the standard plan". This is a third-party pricing guide; Stripe's pricing page was not fetchable. — [checkoutpage.com [S]](https://checkoutpage.com/blog/stripe-processing-fees); [flexprice.io [S]](https://flexprice.io/blog/stripe-pricing-breakdown-2026)

### Inferences
- **What to look for:** in the Dashboard, "payments" and "payouts" both enabled with no outstanding requirements. In the API, `charges_enabled` and `payouts_enabled` are `true` on the account.
- **Likely failure reasons, from general Stripe behavior rather than a fetched source in this session:**
  - the name or SSN does not match IRS or SSA records
  - an EIN is entered with a name that differs from the IRS CP-575 letter
  - the business website is missing, unreachable, or lacks terms, privacy and refund pages
  - a P.O. box is used as the address
  - the product description is vague or falls in a restricted category
- **Website pages.** The repo already has `public/privacy.html`, `public/terms.html` and `public/sms-terms.html`. That helps with both Stripe review and Apple's privacy-statement rule.

### Gaps
- Stripe's official activation checklist page (docs.stripe.com/get-started/account/activate) could not be fetched.
- No primary source was found for activation time or the exact list of rejection reasons.

## Q3. Does Apple Pay show automatically on Stripe Checkout, Payment Links and hosted invoice pages?

### Takeaway
Yes, for all three. They are Stripe-hosted, so Stripe handles Apple merchant validation, and domain registration only governs Elements and Embedded Checkout. Apple Pay only displays to buyers on Apple Pay-capable devices and browsers that have a card in Wallet.

### Cited Findings
- **Hosted Checkout and Payment Links.** Apple Pay works "with no additional configuration". Registration is needed only for Elements or embedded Checkout. — [Stripe docs: Apple Pay [S]](https://docs.stripe.com/apple-pay)
- **Registered domains only matter for Elements.** A payment method "doesn't appear in Elements or Embedded Checkout for this domain until it is active." Registered domains "control where certain payment methods are shown" for Elements. — [Stripe OpenAPI spec [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)
- **Hosted invoice page.** "Each invoice is optimized for mobile, tablet, and desktop with a responsive design that offers Apple Pay and Google Pay." — [Stripe Invoicing [S]](https://stripe.com/invoicing)
- **Device requirements.** "Apple Pay is available on all iOS devices with a Secure Element… In macOS, to authorize the payment, users need a Mac with Touch ID, or an Apple Pay-capable iPhone or Apple Watch."
- **Browsers.** Apple's JS APIs run in Safari: Apple Pay JS on iOS 10+ and macOS 10.12+; Payment Request API on iOS 11.3+.
- **In-app browsers.** "In iOS, Safari and SFSafariViewController objects support Apple Pay." — [Apple: Apple Pay on the Web [F]](https://developer.apple.com/documentation/applepayontheweb)
- **Third-party browsers.** HIG revision note dated December 16, 2025: "Clarified supported platforms, including web browsers and Apple Vision Pro." The HIG now says Apple Pay works "in apps and in any browser". — [Apple HIG: Apple Pay [F]](https://developer.apple.com/design/human-interface-guidelines/apple-pay)

### Inferences
- **Link previews from SMS.** Macoma texts a `hosted_invoice_url`. On an iPhone, tapping it opens Safari, which supports Apple Pay. If the link opens inside an in-app webview other than Safari or SFSafariViewController, Apple Pay may not appear. Stripe's own Apple Pay pages could not be fetched to confirm how they handle each webview.

### Gaps
- I could not fetch Stripe's hosted invoice page docs to confirm that the "Pay with Apple Pay" button respects the connected account's payment-method configuration under direct charges. Verify this with a test invoice on a test connected account.

## Q4. Payment-method domain registration and the `/.well-known/apple-developer-merchantid-domain-association` file

### Takeaway
Only needed for Elements or Embedded Checkout on Macoma-hosted pages. Register every domain and subdomain in both test and live mode, and keep it non-redirecting. If the Dashboard asks for the association file, host Stripe's file at that exact path with no `.txt` extension and no redirect, then validate. This file is Stripe's, not your own Apple file.

### Cited Findings
- **Where the file goes.** Stripe's Salesforce guide registers the domain under Payment method domains, then downloads the file. "It must be hosted at /.well-known/apple-developer-merchantid-domain-association, so https://example.com would serve it at https://example.com/.well-known/apple-developer-merchantid-domain-association", followed by Verify. — [Stripe docs: Salesforce B2C Commerce implementation guide [S]](https://docs.stripe.com/use-stripe-apps/salesforce-commerce-cloud/implementation-guide?locale=en-GB)
- **Whose file it is.** The file is the same for everyone using Stripe. It is Stripe's Apple Pay merchant ID, not the merchant's. When a domain is registered through the Payment Method Domains API, Stripe handles Apple merchant validation on its servers. This is a third-party source about 292 days old. — [Creare Web Solutions [S]](https://www.crearewebsolutions.com/blog/apple-pay-domain-registration-failed/)
- **No Apple Merchant ID or CSR for web.** Stripe's docs say you don't need to create an Apple Merchant ID or Certificate Signing Request for the web; Stripe creates them during merchant validation. — [Stripe pmd-registration [S]](https://docs.stripe.com/docs/payments/payment-methods/pmd-registration)
- **Apple's domain rules:**
  - "You must register and verify all top-level domains and subdomains where you'll display the Apple Pay button."
  - "Domains can't be behind a proxy or redirect, and must be accessible to the Apple servers."
  - "You can't register the same domain with a different Team ID." — [Apple: Configuring Your Environment [F]](https://developer.apple.com/documentation/applepayontheweb/configuring-your-environment)
- **Firewalls and bot protection.** If the domain is protected from public access, allow Apple's verification IP ranges. These include `17.23.4.96/27`, `17.32.139.128/26`, `17.253.0.0/16` and others on the page. — [Apple: Setting Up Your Server [F]](https://developer.apple.com/documentation/applepayontheweb/setting-up-your-server)
- **Status values.** The domain object reports `apple_pay.status` as `active` or `inactive`, with `status_details.error_message`. `POST /v1/payment_method_domains/{id}/validate` re-runs the checks after you fix them. — [Stripe OpenAPI spec [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)
- **Hosts that cannot serve files at a custom path.** A Shopify community thread reports that Shopify can't serve files at custom paths: uploads land on cdn.shopify.com. One reply says the file is "necessary but not sufficient". — [Shopify community [S]](https://community.shopify.com/t/how-to-upload-files-to-verify-domain-ownership-stripe-requires-file-verification/287133)
- **Domains already verified under another team.** One forum anecdote says Apple doesn't re-check the file after verification. Separately, a domain can't be registered under two Apple Team IDs at once. — [Apple Developer Forums [S]](https://developer.apple.com/forums/thread/695538); [Apple Developer Forums 698118 [S]](https://developer.apple.com/forums/thread/698118)

### Inferences
- **Common failure reasons:**
  - the file is served with a redirect (http→https, apex→www, or a trailing slash)
  - the file is behind Cloudflare bot protection, a WAF or basic auth
  - it is served as an HTML 404 page from a single-page-app catch-all route
  - it has a `.txt` extension added
  - only `www` was registered and not the apex domain, or the reverse
  - the domain was registered only in test mode and not in live mode
  - the domain was previously verified under someone else's Apple Team ID, for example an old Squarespace, Shopify or another payment service provider
- **For Macoma's Node server.** Serve the file as a static route at `/.well-known/apple-developer-merchantid-domain-association` with status 200, no redirect, and a content type of `text/plain` or `application/octet-stream`. Then register `macoma.<tld>` and `www.macoma.<tld>`.

### Gaps
- I could not confirm from a primary Stripe page whether the current Dashboard flow still requires hosting the file, or whether Stripe now verifies automatically. Sources conflict by age and context. Follow whatever the Dashboard's "Add domain" dialog shows.

## Q5. Connect (flow B): connected-account domains, Apple Pay on connected-account invoices, how the platform fee appears

### Takeaway
- **Hosted invoice pages:** Macoma creates direct-charge invoices with the `Stripe-Account` header, so no per-owner domain work is needed.
- **Macoma-hosted Elements pages with direct charges:** domains must be registered per connected account through the API with the `Stripe-Account` header. The Dashboard cannot do it.
- **Who pays what:** the owner is merchant of record and carries Stripe fees, refunds and chargebacks. Macoma's cut arrives as an application fee.

### Cited Findings
- **Domain registration API for Connect.** "If the platform creates direct charges, the platform's secret key authenticates the request and the Stripe-Account header is set to the connected account's Stripe ID. For destination charges or separate charges and transfers, the Stripe-Account header is omitted." — [Stripe pmd-registration [S]](https://docs.stripe.com/payments/payment-methods/pmd-registration)
- **Dashboard limitation.** Platforms that create direct charges must use the API, not the Dashboard, to manage domains for connected accounts. A third-party write-up suggests doing this during connected-account onboarding. — [Stripe docs [S]](https://docs.stripe.com/payments/payment-methods/pmd-registration); [Azuki Digital [S]](https://azukidigital.com/blog/2025/stripe-connect-apple-pay/)
- **Who carries costs on direct-charge invoices.** Invoices are created as the connected account with `application_fee_amount`. The connected account bears Stripe fees, refunds and chargebacks. — [Stripe docs: Create invoices with Connect [S]](https://docs.stripe.com/connect/invoices)
- **API fields:**
  - `application_fee_amount` on invoices is "transferred to the application owner's Stripe account".
  - `on_behalf_of` presents the invoice "with the branding and support information of the specified account". This applies to destination-style invoices.
  - `transfer_data.destination` is used for destination charges. — [Stripe OpenAPI spec, POST /v1/invoices [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)
- **Platform control of payment methods.** Payment Method Configurations accept a `parent` parameter ("Specify to create a child configuration"). This is the mechanism a platform uses to control which payment methods, including Apple Pay, its connected accounts show. — [Stripe OpenAPI spec [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)
- **Who the buyer sees.** "If you're not the end merchant, identify both businesses in the payment sheet… Pay [End_Merchant_Business_Name (via Your_Business_Name)]." — [Apple HIG: Apple Pay [F]](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- **Apple's prohibition on staged wallets.** Apple prohibits websites that constitute "a staged digital wallet (e.g., where a second payment transaction is conducted in order to complete the first transaction or where there is a substitute merchant of record in a transaction)". — [Apple Pay Acceptable Use Guidelines for Websites [F]](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)

### Inferences
- **Direct charges fit Apple's rules.** The owner's connected account is the merchant of record, so the card statement and payment sheet show the owner, not Macoma. Charging on Macoma's own account and paying owners out later could look like a "substitute merchant of record". Keep direct charges.
- **What the owner sees.** In their Stripe Express or Standard dashboard, each payment shows the gross amount, the Stripe processing fee, and a separate "application fee" line for Macoma's cut, then the net amount. This is from general Connect behavior; not fetched in this session.
- **Refunds.** Without `refund_application_fee=true` on a refund, Macoma keeps its fee by default and the owner absorbs it. Decide a policy and disclose it in the owner terms. Unverified in this session.
- **Owner onboarding steps:**
  1. `accounts.create`
  2. `accountLinks.create` for Stripe-hosted onboarding, where the owner enters SSN or EIN and a bank account
  3. wait for `charges_enabled=true` and `capabilities.card_payments=active`
  4. create customer, invoice items and invoice with `{stripeAccount}` plus `application_fee_amount`
  5. `finalizeInvoice`, then text `hosted_invoice_url`
  
  Failure reasons: the owner abandons onboarding, verification is pending (SSN mismatch), or `card_payments` is not active.

### Gaps
- I could not fetch Stripe's Connect docs page for "payment method configurations for connected accounts". Its exact Dashboard path and default Apple Pay state for new connected accounts are unverified.
- I could not fetch Stripe's statement of exactly how application fees appear in the connected account's dashboard.
- Connect pricing: Stripe's Connect page reportedly lists $2 per monthly active account plus 0.25% + 25¢ per payout when the platform handles pricing, and free when Stripe handles pricing. The page snapshot may be old. — [Stripe Connect pricing [S]](https://stripe.com/connect/pricing). Re-verify.

## Q6. Is an Apple Developer Program membership ($99/yr) needed?

### Takeaway
Not for Apple Pay on the web through Stripe's hosted pages or Elements, because Stripe uses its own Apple merchant ID. It is required when Macoma uses its own Apple identifiers and certificates:
- Wallet passes (C)
- Apple Pay in Messages for Business (D)
- a native iOS app
- a direct Apple Pay JS integration without Stripe

### Cited Findings
- **Not needed with Stripe on the web.** You don't need your own Apple Developer account, Merchant ID or CSR for web payments through Stripe. — [Stripe pmd-registration [S]](https://docs.stripe.com/docs/payments/payment-methods/pmd-registration); [Stripe support: enable Apple Pay [S]](https://support.stripe.com/questions/enable-apple-pay-on-your-stripe-account)
- **Needed for a direct integration.** Apple lists "An Apple Developer account and complete the registration" as a requirement for direct Apple Pay on the web. Setup "must" be done with "a Team Agent or Admin role": registering a merchant ID, creating a payment processing certificate and a merchant identity certificate, and verifying domains. — [Apple: Apple Pay on the Web [F]](https://developer.apple.com/documentation/applepayontheweb); [Apple: Configuring Your Environment [F]](https://developer.apple.com/documentation/applepayontheweb/configuring-your-environment)
- **Price.** "The Apple Developer Program is 99 USD per membership year. Prices may vary by region." — [Apple: Enrollment [F]](https://developer.apple.com/programs/enroll/)
- **Individual enrollment.** An individual or sole proprietor needs an Apple Account with two-factor authentication and their legal name; "Using an alias, nickname, or company name… will cause a delay". P.O. boxes are not accepted.
- **Organization enrollment requirements:**
  - a D-U-N-S Number
  - a legal entity: "We do not accept DBAs, fictitious business names, trade names"
  - a work email on the organization's domain
  - "a publicly available and functional" website — [Apple: Enrollment [F]](https://developer.apple.com/programs/enroll/)
- **Paid membership unlocks the identifier portal.** "To build more advanced app capabilities… you'll need to be an Apple Developer Program member." Certificates, Identifiers & Profiles become available on enrollment. — [Apple: Compare memberships [F]](https://developer.apple.com/support/compare-memberships/)
- **Pass Type IDs and certificates** are created in "Certificates, Identifiers & Profiles". — [Apple: Building a Pass [F]](https://developer.apple.com/documentation/walletpasses/building-a-pass)

### Inferences
- **Enroll as an organization.** If Macoma plans C or D, enroll as an organization (the LLC) rather than an individual. The seller or merchant name then shows as Macoma, not the founder's personal name.
- **Plan for the D-U-N-S wait.** Get the D-U-N-S number early. It is free from Dun & Bradstreet. Apple says to allow up to 5 business days for D&B to issue it, then up to 2 more business days for Apple to receive it before you can enroll as an organization. Email D&B if it takes longer than two weeks. [corrected in verification: earlier text said "from general knowledge, not fetched" and "days to weeks"] — [Apple Developer Help: D-U-N-S Number [F]](https://developer.apple.com/help/account/membership/D-U-N-S/)

### Gaps
- Apple's enrollment page does not state verification turnaround. The linked enrollment support page was not fetched.
- ~~I found no primary figure for D-U-N-S issuance time.~~ [corrected in verification: Apple states up to 5 business days from D&B plus up to 2 business days for Apple; see Inferences above.]

## Q7. Testing Apple Pay with Stripe

### Takeaway
Stripe does not use Apple's sandbox. Add a real card to Wallet on an iPhone or a Touch ID Mac, open your test-mode Checkout, invoice or Payment Link in Safari, and pay. Stripe swaps in a test token, so nothing is charged. Simulate declines with Stripe test mode, not Apple sandbox cards.

### Cited Findings
- **No Apple sandbox.** Stripe doesn't support Apple Pay's sandbox environment.
- **Real card in test mode.** Test mode accepts a real card: Stripe recognizes the test keys and returns a successful test token.
- **Native iOS.** Wallet won't accept Stripe test card numbers, so add a real card; Stripe swaps it for a test token.
- **Supported countries only.** Testing isn't possible where Apple Pay isn't supported. — [Stripe support: Testing Apple Pay [S]](https://support.stripe.com/questions/testing-apple-pay-with-stripe)
- **No real charge.** Testing this way "will not actually place a charge on your card". — [WooCommerce Stripe testing docs [S]](https://woocommerce.com/document/stripe/customer-experience/testing/)
- **Apple sandbox cards don't help with failures.** Apple's sandbox cards always succeed, which makes failure webhooks hard to trigger. — [Apple Developer Forums [S]](https://developer.apple.com/forums/thread/706585)
- **Apple's demo page.** Apple offers a demo page at applepaydemo.apple.com for trying Apple Pay transactions. — [Apple: Apple Pay on the Web [F]](https://developer.apple.com/documentation/applepayontheweb)

### Inferences
- **Test plan:**
  1. Flow A: open a test-mode Checkout Session in Safari on iPhone. Confirm the Apple Pay button and a successful `checkout.session.completed` event. Confirm the subscription payment method shows `card.wallet.type=apple_pay`.
  2. Flow B: create a test connected account, then a test invoice with an application fee. Open `hosted_invoice_url` on iPhone and pay with Apple Pay. Confirm `invoice.paid` and the application fee on the platform.
  3. Repeat both with live keys using a $1 real charge, then refund it.
- **What to look for:** the Apple Pay button appears; the webhook fires; the fee lands.
- **Common failures:**
  - testing in Chrome on a Windows or Android device
  - no card in Wallet
  - testing on an emulator with no Wallet
  - the domain not registered (Elements only)

### Gaps
- Stripe's current testing doc (docs.stripe.com/testing#wallets) could not be fetched to confirm whether any newer simulated-wallet option exists.

## Q8. Apple Pay marketing, buttons and trademark rules for Macoma's landing page and SMS copy

### Takeaway
Write "Apple Pay" exactly that way: two words, capital A and P, never plural or possessive, never translated. Add ® at the first body-copy mention in US materials. Use only Apple's mark artwork, and only in a payment-options context. Use Apple's API-rendered buttons; for invoices the fitting button is "Pay with Apple Pay". Apple's samples use "Now Accepting Apple Pay", not "Apple Pay accepted".

### Cited Findings
- **Spelling.** "Always typeset Apple Pay as two words with an uppercase A and uppercase P followed by lowercase letters. Never use the Apple logo to represent the name Apple in text."
- **Translation.** "Don't translate Apple Pay." Incorrect examples include "ApplePay", "APPLE PAY", and "Pay" without "Apple". — [Apple Pay Marketing Guidelines [F]](https://developer.apple.com/apple-pay/marketing/)
- **Trademark symbol.** "In marketing communications distributed only in the United States, the appropriate symbol (™, ℠, or ®) must follow each Apple trademark the first time it's mentioned", for example "Apple Pay®". "Don't add a trademark symbol to the Apple Pay UI assets provided by Apple."
- **Trademark list.** Check symbols against Apple's Trademark List (apple.com/legal/intellectual-property/trademark/appletmlist.html). — [Apple Pay Marketing Guidelines [F]](https://developer.apple.com/apple-pay/marketing/)
- **Never plural or possessive.** Use Apple Pay "exactly as shown in [the Apple Trademark List] — never make it plural or possessive". Don't include ® "when Apple Pay appears as a selection option during checkout." — [Apple HIG: Apple Pay [F]](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- **The mark is only for payment messaging.** "Use the Apple Pay mark in marketing communications only when promoting Apple Pay in relation to your payment options. Don't use the mark in general product or company promotions."
- **Artwork rules.** The mark comes "only in white with an outline rule". Use only Apple's artwork, downloaded from developer.apple.com/apple-pay/marketing/Apple-Pay-Mark.zip.
- **Size.** Don't display it smaller than other payment marks.
- **No effects.** Don't add shadows, rotation or animation. — [Apple Pay Marketing Guidelines [F]](https://developer.apple.com/apple-pay/marketing/)
- **Clear space: Apple's two pages conflict.**
  - The Marketing Guidelines say the minimum is "one quarter the height of the mark". — [Apple Pay Marketing Guidelines [F]](https://developer.apple.com/apple-pay/marketing/)
  - The HIG says "Maintain a minimum clear space around the mark of 1/10 of its height." — [Apple HIG [F]](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
  - Use 1/4 to satisfy both.
- **Apple's sample web copy.**
  - Web banner: "**Now Accepting Apple Pay** — Apple Pay is an easy and secure way to pay on [app name] in Safari."
  - Announcement: "Apple Pay is now available in [website or app name]."
  - You may "develop your own copy related to your offer" while following the naming rules.
  - The page does not list "Apple Pay accepted" or "Pay with Apple Pay" as approved phrases.
  - The page does not say whether any approval is required. — [Apple Pay Marketing Guidelines [F]](https://developer.apple.com/apple-pay/marketing/)
- **Button types.** Apple's button types include "Pay with Apple Pay", meant for "An app or website that lets people pay bills or invoices, such as those for a utility… or a service like plumbing or car repair". Others include "Subscribe with Apple Pay", "Buy", "Check Out", "Book", "Order", "Tip" and plain "Apple Pay".
- **Button rendering.** "Always use the Apple-provided API to display Apple Pay buttons… Don't create custom Apple Pay button designs."
- **Minimum button size.** For example, Book, Check Out and Subscribe need 140pt width, 30pt height, and margins of 1/10 of the height.
- **The mark is not a button.** "Never use it as a payment button."
- **Custom buttons.** A custom button must not say "Apple Pay"; show the mark or text elsewhere on the page instead. — [Apple HIG: Apple Pay [F]](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- **Parity rule for pages Macoma hosts.** "If any webpage of your website accepts other forms of third party payment methods, you must also offer Apple Pay as a payment option on such webpage, at least on parity with such other payment methods."
- **Prohibited categories.** These include tobacco or vape, firearms, drugs, pornography, counterfeit goods, unapproved personal fundraising, and currency or crypto transfers. "Apple reserves the right at any time to disable Apple Pay transactions on your websites." — [Apple Pay Acceptable Use Guidelines for Websites [F]](https://developer.apple.com/apple-pay/acceptable-use-guidelines-for-websites/)
- **Promotions.** An Apple Pay-exclusive promotion must apply only to Apple Pay purchases, be described on the site, and be "a line item in the paysheet". — [Apple Pay Marketing Guidelines [F]](https://developer.apple.com/apple-pay/marketing/)

### Inferences
- **Suggested landing-page line:** "Your customers can pay invoices with Apple Pay®". Put ® on the first body mention only. Show the official mark in a row with the other payment marks, at equal or larger size.
- **Avoid as a headline brand claim:**
  - "Pay with Apple Pay" in Macoma's own styled button (only Apple's rendered button may say this)
  - "Apple Pay's"
  - "ApplePay"
  - any implication of partnership or endorsement
- **SMS copy is fine.** For example: "Pay securely by card or Apple Pay: [link]". It follows the same naming rules; no ® is needed in a checkout-choice context.
- **Owner vertical risk.** Some owner verticals, such as vape shops, firearms, or cannabis-adjacent businesses, are prohibited for Apple Pay. They should be screened at onboarding, or their invoices sent with Apple Pay turned off.

### Gaps
- I found no explicit Apple statement on whether an "Apple Pay accepted" phrasing is allowed or disallowed. Apple's examples use "Now Accepting Apple Pay".
- The Apple Trademark List was not fetched to confirm the current symbol (® vs ™) for Apple Pay. Apple's own guidance examples use ®.

## Q9. Recurring payments with Apple Pay (merchant tokens / MPAN, renewal reliability, card updates)

### Takeaway
Stripe Checkout in subscription mode requests Apple Pay merchant tokens (MPANs) automatically. MPANs survive card reissue, so renewals are more reliable than with device tokens (DPANs). An MPAN is not guaranteed: issuer or network support decides, and Apple falls back to a DPAN.

### Cited Findings
- **Checkout handles it.** "Stripe automatically handles merchant token requests in Stripe Checkout integrations." Merchant tokens can also be requested via the Express Checkout Element and the Payment Element.
- **Stripe's recommendation.** "We recommend implementing Apple Pay merchant tokens to enable merchant-initiated transactions (MIT) such as recurring and deferred payments and automatic reloads." — [Stripe docs: merchant tokens [S]](https://docs.stripe.com/apple-pay/merchant-tokens); [Stripe docs: Apple Pay [S]](https://docs.stripe.com/apple-pay)
- **Payment Request Button is deprecated.** Stripe recommends the Express Checkout Element instead. — [Stripe docs: Payment Request Button [S]](https://docs.stripe.com/stripe-js/elements/payment-request-button)
- **Apple's definition.** MPANs are network tokens for recurring transactions that "persist independently of the underlying card, ensuring payment continuity after reissuance". — [Apple: Merchant Tokens [S]](https://developer.apple.com/apple-pay/merchant-tokens/). The page redirected to applepaypartners.apple.com, which was blocked.
- **Apple's recurring request object.** "You must include the recurringPaymentRequest property in the ApplePayPaymentRequest object to specify a request for a recurring payment." It provides "payment details and a way to manage payment methods", an optional billing agreement, and "merchant token life-cycle notifications". — [Apple: ApplePayRecurringPaymentRequest [F]](https://developer.apple.com/documentation/applepayontheweb/applepayrecurringpaymentrequest)
- **Apple's subscription UX rules:**
  - "Clarify subscription details before showing the payment sheet."
  - "Clearly communicate trial period terms": show the trial amount (including $0), the regular amount and the start date.
  - "Only show the payment sheet when a subscription change results in additional fees."
  - Treat the billing agreement as "a plain-language summary, not a substitute for formal terms." — [Apple HIG: Apple Pay [F]](https://developer.apple.com/design/human-interface-guidelines/apple-pay)
- **MPAN is not guaranteed.** Passing a recurring request "does not guarantee that Apple Pay will always create an MPAN". It depends on network, issuer and eligibility; otherwise a DPAN is returned. — [Basis Theory: Apple Pay guide [S]](https://developers.basistheory.com/docs/guides/apple-pay/implementation)
- **Unconfirmed claim about Visa.** One third-party blog claims Visa declines standing instructions built on device-bound wallet tokens issued after July 30, 2025. I could not verify this against Visa. — [cancelflow.dev [S, unverified]](https://cancelflow.dev/blog/apple-pay-google-pay-subscription-tokens) [verification note: search summaries of Visa's own acceptance article (support.visaacceptance.com KA-04318) say device-generated Apple Pay tokens stop being applicable for standing instructions from July 30, 2025, but also that a February 2025 announcement deferred restricting device tokens "until further notice". The page could not be opened from this environment. Treat the "Visa declines" claim as disputed, and request MPANs (Checkout already does) regardless.]

### Inferences
- **For flow A:** keep using Checkout `mode: 'subscription'` so Stripe asks for an MPAN automatically.
- **Plan for failed renewals anyway:** turn on Stripe's failed-payment retries and emails, and send a "card update" Billing customer-portal link by SMS.
- **Trial terms on the sheet.** If Macoma offers a free trial, the Checkout session should show the $0 trial and the post-trial price; Checkout does this when `trial_period_days` is set.
- **Billing fee.** Stripe Billing is reportedly 0.7% of billing volume on pay-as-you-go. Third-party sources only: [flexprice.io [S]](https://flexprice.io/blog/stripe-pricing-breakdown-2026); [checkoutpage.com [S]](https://checkoutpage.com/blog/stripe-processing-fees).

### Gaps
- No primary source gives renewal-success statistics for MPAN vs DPAN.
- I could not fetch Stripe's page to confirm whether Stripe Checkout sets a `managementURL` or token notification URL on Macoma's behalf.

## Q10. (C) Apple Wallet passes: Pass Type ID, CSR, WWDR, Node library, update web service, APNs, cost and timeline

### Takeaway
Wallet passes need:
- the paid Apple Developer Program ($99/yr)
- a Pass Type ID and a Pass Type ID certificate made from a CSR
- Apple's WWDR intermediate certificate
- a signed `.pkpass` bundle served as `application/vnd.apple.pkpass`
- optionally, an HTTPS web service plus APNs pushes (production only) for updates

The `passkit-generator` npm package (MIT, v3.7.0, updated 2026-10-14) handles the signing in Node.

### Cited Findings
- **Build steps.** "Create the source files… Create a pass type identifier. Generate a signing certificate. Create a digital signature for the pass. Create the signed bundle."
- **Pass Type ID.** In "Certificates, Identifiers & Profiles": "Select Identifiers and then click Add (+)… choose Pass Type IDs… Enter a description and the reverse DNS string." — [Apple: Building a Pass [F]](https://developer.apple.com/documentation/walletpasses/building-a-pass)
- **Certificate.** "Signing a pass requires a signing certificate for the pass type identifier. Before you can generate a signing certificate you need a certificate signing request (CSR)… choose Pass Type ID Certificate… upload the certificate signing request." — [Apple: Building a Pass [F]](https://developer.apple.com/documentation/walletpasses/building-a-pass)
- **Signing.** `manifest.json` holds SHA1 hashes of every file. Sign with "a PKCS #7 detached signature for the manifest that uses the private key of the pass identifier signing certificate". Zip the files and rename to `.pkpass`. — [Apple: Building a Pass [F]](https://developer.apple.com/documentation/walletpasses/building-a-pass)
- **Common build failures, per Apple:**
  - `passTypeIdentifier` doesn't match the certificate
  - `teamIdentifier` doesn't match the account
  - the certificate is expired
  - the manifest is missing files
  - required images are missing
  - JSON syntax errors
  - date fields are not ISO 8601
  
  Testing tip: "Test your pass by dropping it onto an iPhone that's running on Simulator." — [Apple: Building a Pass [F]](https://developer.apple.com/documentation/walletpasses/building-a-pass)
- **Distribution:**
  - inside an app or App Clip
  - "a download on a web page"
  - "an attachment in an email"
  - an "Add to Apple Wallet" button on the website, following Apple's guidelines
  
  To update a pass, reissue it with the same Pass Type ID and serial number. A bundle is `.pkpasses` (MIME `application/vnd.apple.pkpasses`), with "up to 10 passes or 150 MB". — [Apple: Distributing and updating a pass [F]](https://developer.apple.com/documentation/walletpasses/distributing-and-updating-a-pass)
- **Update web service:**
  - Add `webServiceURL` and `authenticationToken` to `pass.json`.
  - The device registers and sends a push token.
  - On a change, your server sends an APNs push. The push uses the pass's signing certificate and key and an empty JSON payload.
  - The device fetches the changed serial numbers, then each updated pass.
  - "Your web service must use an HTTPS connection for production."
  - "A push notification for a pass update works only in the production environment."
  - Suggested storage: three tables (devices, passes, registrations). — [Apple: Adding a Web Service to Update Passes [F]](https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes)
- **Node libraries.** `passkit-generator` ("The easiest way to generate custom Apple Wallet passes in Node.js"): v3.7.0, MIT, last modified 2026-10-14. An alternative is `@walletpass/pass-js` v7.2.0, modified 2026-05-11. [corrected in verification: `@walletpass/pass-js` is licensed AGPL-3.0-or-later, not MIT. AGPL has copyleft obligations for network services, so prefer the MIT-licensed `passkit-generator` unless counsel approves AGPL.] — [npm: passkit-generator [F]](https://www.npmjs.com/package/passkit-generator); [npm: @walletpass/pass-js [F]](https://www.npmjs.com/package/@walletpass/pass-js)
- **Cost.** The Apple Developer Program is 99 USD per year. — [Apple: Enrollment [F]](https://developer.apple.com/programs/enroll/)

### Inferences
- **What a Macoma pass would be.** A "receipt / loyalty / appointment" pass that the owner's customer adds after paying, which could hold the next appointment. That would use the "generic" or "eventTicket" pass style.
- **SMS delivery.** Passes can be linked from an SMS: a web download over HTTPS with the right MIME type opens the add-pass sheet in Safari.
- **Rough timeline for one developer:**
  - Apple enrollment: days, plus D-U-N-S if enrolling as an organization
  - 1 day for certificates and a static pass
  - 2–4 days for the update web service plus APNs
- **Running costs:** $99/yr plus hosting. These are estimates; no source gives build times.
- **Apple Pay is not involved.** Passes do not touch Apple Pay processing. They are independent of flows A and B and can be deferred past launch.

### Gaps
- I did not fetch Apple's page on the WWDR certificate. The current generation ("G4") and download link come only from general knowledge and the fetch tool's model, not a fetched page. Confirm at developer.apple.com/support/expiration/ or Apple PKI.
- Pass Type ID certificate validity period: not found in fetched sources.
- Apple's "Add to Apple Wallet" guidelines page was not fetched.

## Q11. (D) Apple Pay inside Apple Messages for Business: what the MSP and payment gateway need; the payment processing certificate

### Takeaway
This is a separate, heavier integration than web Apple Pay. Macoma needs its own Apple Developer membership and its own Apple Pay Merchant ID. It also needs:
- a payment processing certificate, which expires every 25 months
- a merchant identity certificate, as a .p12 file, for merchant sessions
- verified domains
- the merchant ID configured in the Messages for Business account
- a payment gateway URL that receives the encrypted token and charges it, for example through Stripe

Stripe's Checkout and invoice shortcuts do not apply here. Several details could only be read from search summaries.

### Cited Findings
- **Prerequisites.** "Before you are able to send an Apple Pay in Messages for Business payload across the messaging system, you must have a valid merchant account, identifiers, certificates, and domain registrations." — [Apple Messages for Business: Apple Pay [S]](https://register.apple.com/resources/messages/msp-api-tutorial/applepay)
- **Payment processing certificate.** "You must have a Payment Processing certificate associated with your Merchant account in order to have transactions accepted by the Apple Pay server. The Payment Processing certificate expires every 25 months." — [Apple Messages for Business: Apple Pay [S]](https://register.apple.com/resources/messages/msp-api-tutorial/applepay)
- **Certificate expiry and re-creation.** "The merchant identifier never expires." "The payment processing certificate expires every 25 months and can be revoked… just re-create the payment processing certificate." — [Apple Developer Help: Configure Apple Pay on the web [F]](https://developer.apple.com/help/account/capabilities/configure-apple-pay-on-the-web/)
- **Merchant identity certificate steps, per Apple Help:**
  1. Merchant IDs → your ID → "Apple Pay Merchant Identity Certificate" → Create Certificate
  2. upload the `.certSigningRequest`
  3. download the `.cer`
  
  To register a merchant domain: Add Domain → Download the file → "place the downloaded file in the specified location, then click Verify."
  
  Required role: "Account Holder or Admin." — [Apple Developer Help [F]](https://developer.apple.com/help/account/capabilities/configure-apple-pay-on-the-web/)
- **What each certificate does.** The payment processing certificate's public key is used by Apple Pay servers to encrypt payment data. "You, or your payment service provider, use the private key to decrypt data." The merchant identity certificate is a TLS certificate "used to authenticate your sessions with the Apple Pay servers". — [Apple: Configuring Your Environment [F]](https://developer.apple.com/documentation/applepayontheweb/configuring-your-environment)
- **MSP configuration.** The Merchant ID is entered in the Apple Pay section of the Messages for Business account. The business picks its supported networks: "Selection of at least one network is mandatory." — [Bird docs: Apple Messages for Business, Apple Pay [S]](https://docs.bird.com/applications/channels/channels/supported-channels/apple-messages-for-business/how-to/use-apple-pay)
- **What platforms ask for.** Typically "the Merchant Identity Certificate (the .p12 file), Merchant Certificate Password, Merchant Domain Name, and Payment Gateway URL". — [Webex Connect: AMB FAQs [S]](https://developers.webexconnect.io/reference/faqs-apple-messages-for-business)
- **Merchant session request.** It is made with the identity certificate and needs `merchantIdentifier`, `domainName` and `displayName`. — [Apple Developer Forums [S]](https://developer.apple.com/forums/thread/49912)
- **Format and processor notes from forums:**
  - One forum report says `.pem` is no longer accepted and `.p12` must be used. — [Apple Developer Forums [S]](https://developer.apple.com/forums/thread/679789)
  - A community note says the payment processing certificate may need to be created from the processor's CSR, e.g. Stripe's, so the processor can decrypt. — [GitHub maker95/ApplePayJS [S]](https://github.com/maker95/ApplePayJS)
- **Stripe's CSR for native flows.** Stripe supports native iOS Apple Pay by having you add a certificate made from Stripe's CSR through its iOS certificate settings. — [Stripe support: Enable Apple Pay [S]](https://support.stripe.com/questions/enable-apple-pay-on-your-stripe-account)
- **Apple's IP allowlist for merchant-session calls.** Allow `apple-pay-gateway.apple.com`, plus `apple-pay-gateway-cert.apple.com` for sandbox only. "Apple Pay requires SNI on all connections." — [Apple: Setting Up Your Server [F]](https://developer.apple.com/documentation/applepayontheweb/setting-up-your-server)

### Inferences
- **Probable path with Stripe:**
  1. Enroll in the Apple Developer Program.
  2. Create the Merchant ID `merchant.com.macoma…`.
  3. Download Stripe's CSR from the Stripe Dashboard's Apple Pay iOS-certificate setting.
  4. Create the payment processing certificate with that CSR, then upload the `.cer` back to Stripe. Stripe can then decrypt the Apple Pay tokens.
  5. Create a merchant identity certificate with your own CSR and convert it to .p12 for the MSP.
  6. Verify Macoma's domain under the Merchant ID.
  7. Give the MSP the Merchant ID, the .p12 and its password, the domain, and a Macoma `paymentGatewayUrl` endpoint.
  8. That endpoint receives the token and creates a Stripe PaymentMethod or charge.
- **Unverified:** whether Stripe accepts Messages-for-Business tokens this way, and whether an MSP (for example Bird, Sinch or LivePerson) supports Stripe as the gateway. Confirm with both before building.
- **Flow B is hard here.** In Messages for Business, the payment sheet would be under Macoma's merchant ID. For owner invoices, that risks Apple's "substitute merchant of record" prohibition, and Stripe direct charges on the owner's account would need Stripe Connect support for the decrypted token. A simpler route for D: send the hosted invoice link inside the Messages for Business chat. Safari opens it and Apple Pay works with no extra certificates.
- **Defer D.** It also needs Messages for Business approval and an MSP contract. Neither is required for the October 2026 SMS launch.

### Gaps
- register.apple.com (Apple's Messages for Business documentation) was blocked from this environment. Exact payload fields (`paymentGatewayUrl`, `fallbackUrl`, `orderTrackingUrl`, `paymentMethodUpdate`) and device requirements are unverified.
- MSP pricing and Messages for Business approval timeline: not found.
- I found no Stripe document confirming support for Apple Pay tokens originating from Messages for Business.

## Q12. Disputes, chargebacks and refunds with Apple Pay; what the owner sees

### Takeaway
Apple Pay payments are card payments in Stripe. Refunds (full or partial) and disputes use exactly the same flows as cards, with evidence submitted in Stripe. There is a fraud liability shift for Visa only on iOS 16.2+ (or European-issued Visa cards). Under direct-charge Connect, the owner's account bears refunds and chargebacks.

### Cited Findings
- **Disputes.** Users "can still dispute transactions after they complete payment. You can submit evidence to contest a dispute directly. The dispute process is the same as that for card payments."
- **Liability shift.** "For Visa, liability shift is limited to devices running iOS 16.2 and above. Devices running on iOS versions below 16.2 only receive liability shift on Visa if the card was issued in Europe."
- **Refunds.** "You can partially or fully refund any successful Apple Pay payment. The refund process is the same as that for card payments." — [Stripe docs: Apple Pay disputes and refunds [S]](https://docs.stripe.com/apple-pay/disputes-refunds)
- **Liability shift only covers fraud.** "A fraud liability shift does not answer claims about delivery, product quality, cancellations, or missing credits." This is a third-party source. — [Chargeflow [S]](https://www.chargeflow.io/chargebacks-101/apple-pay-chargeback)
- **Owner carries refunds and chargebacks.** With direct-charge invoices, the connected account bears Stripe fees, refunds and chargebacks. — [Stripe docs: Create invoices with Connect [S]](https://docs.stripe.com/connect/invoices)
- **Identifying Apple Pay payments.** The payment's card wallet type is recorded as `apple_pay` on the PaymentMethod (`card.wallet.type`). Disputes carry `payment_method_details` and `evidence` objects. — [Stripe OpenAPI spec [F]](https://github.com/stripe/openapi/blob/master/openapi/spec3.json)

### Inferences
- **What the owner sees.** In their Stripe dashboard, the payment shows as a card payment (Visa or Mastercard, etc.) labeled with an Apple Pay wallet. A dispute appears with a response deadline and an evidence form.
- **What Macoma should text the owner:** the amount, the reason code and the deadline. Offer to compile evidence: the invoice, the SMS thread, and the YES-approval log.
- **Refund policy decision.** Decide whether Macoma refunds its application fee on refunds or disputes. Stripe defaults to Macoma keeping it unless `refund_application_fee=true` is set; unverified in this session. [verification note: the OpenAPI spec confirms `refund_application_fee` is an optional boolean on refunds and that a partial refund returns a proportional share of the fee, but it does not state the default.]
- **Disclose fees.** Stripe's dispute fee is commonly cited as $15 in the US. Not fetched from Stripe; verify. [verification note: third-party sources found in verification conflict on whether the $15 is returned when the dispute is won, and one reports an additional $15 fee to counter a dispute. Stripe's pricing page was unreachable; budget $15 to $30 per contested dispute until confirmed.] Under direct charges the owner pays it, so disclose this in the owner terms.

### Gaps
- Stripe's US dispute fee and whether it is refunded when the dispute is won: not verified from a primary source in this session.
- Exact Express-dashboard presentation of disputes for connected accounts: not fetched.

## Verification pass

Adversarial check run on 2026-10-22. From this environment, developer.apple.com, raw.githubusercontent.com (Stripe OpenAPI spec `2026-09-30.endive`) and registry.npmjs.org could be opened. stripe.com, docs.stripe.com, support.stripe.com, visaacceptance.com and every third-party pricing blog failed DNS or were refused by the proxy. A claim is marked "confirmed" only when a page that states it was opened. A search-engine summary of a page does not count. This file makes no claims about Instinct or Meta Muse, so none were checked here.

| # | Claim | Verdict | Source URL | Note |
|---|---|---|---|---|
| 1 | Stripe standard US online card rate is 2.9% + 30¢, with no setup or monthly fee | unverifiable | https://stripe.com/pricing | The page was unreachable. Several 2026 search summaries agree on 2.9% + 30¢ and no monthly fee. They also list +1.5% for international cards and +1% for currency conversion, which the notes omit. Budget for both if owners have non-US customers. |
| 2 | Apple Pay carries no extra Stripe fee; pricing is the same as other card transactions | confirmed | https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json | The `apple_pay` description in Payment Method Configuration says so word for word. |
| 3 | Apple Developer Program costs $99/yr. Organization enrollment needs a D-U-N-S Number and a legal entity (no DBAs), and the D-U-N-S Number is free | corrected | https://developer.apple.com/programs/enroll/ ; https://developer.apple.com/help/account/membership/D-U-N-S/ | The $99, "Prices may vary by region", no-DBA rule, work-domain email and functional website were all confirmed. The D-U-N-S timing was corrected inline: up to 5 business days at D&B plus up to 2 at Apple, not "days to weeks". Nonprofits, accredited schools and government entities can request a fee waiver. |
| 4 | Hosted Checkout and Payment Links show Apple Pay "with no additional configuration"; domain registration matters only for Elements and Embedded Checkout | unverifiable | https://docs.stripe.com/apple-pay | The domain-scope half was confirmed in the OpenAPI spec (`payment_method_domain`: "doesn't appear in Elements or Embedded Checkout for this domain until it is active"). The "no additional configuration" quote lives on the unreachable Stripe docs page. Test it on a live Checkout Session. |
| 5 | Stripe-hosted invoice page offers Apple Pay, including on direct-charge invoices for connected accounts | unverifiable | https://stripe.com/invoicing | The page was unreachable. The OpenAPI spec shows `card` but no `apple_pay` among invoice payment-method types, which fits Apple Pay arriving as a card wallet but does not prove the button renders. Test with a test connected account. |
| 6 | Connect costs $2 per monthly active account plus 0.25% + 25¢ per payout when the platform handles pricing, and is free when Stripe handles pricing | unverifiable | https://stripe.com/connect/pricing | The page was unreachable. Search summaries of stripe.com/*/connect/pricing match these figures and add Instant Payouts at 1% of volume. A third-party summary defines "active" as any month the account receives a payout. |
| 7 | Stripe Billing pay-as-you-go is 0.7% of billing volume | unverifiable | https://stripe.com/billing/pricing | The page was unreachable. A search summary of stripe.com/en-us/billing/pricing matches 0.7% with no recurring fee, charged on top of processing fees. |
| 8 | Stripe's US dispute fee is $15 | unverifiable | https://stripe.com/pricing | The page was unreachable. Third-party sources conflict on whether the fee is refunded when the dispute is won, and one cites a second $15 fee to counter a dispute. A caveat was added inline. |
| 9 | Invoice `application_fee_amount` requires an OAuth key or the `Stripe-Account` header; Macoma keeps its fee on refunds unless `refund_application_fee=true` | confirmed (first half) / unverifiable (default) | https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json | The header requirement was confirmed word for word. The spec documents `refund_application_fee` as an optional boolean with proportional refunds but does not state the default. A note was added inline. |
| 10 | Payment processing certificate expires every 25 months; the merchant ID never expires; the role required is Account Holder or Admin | confirmed | https://developer.apple.com/help/account/capabilities/configure-apple-pay-on-the-web/ | All three statements appear on the page word for word. |
| 11 | Visa liability shift for Apple Pay applies only on iOS 16.2+ (below that, only for European-issued cards) | unverifiable | https://docs.stripe.com/apple-pay/disputes-refunds | The page was unreachable. A search summary quotes the same wording from Stripe's page and adds, from support.stripe.com, that liability shift does not apply to merchant-initiated (recurring) charges. That matters for subscription renewals. |
| 12 | Wallet pass Node libraries: `passkit-generator` v3.7.0, MIT, updated 2026-10-14; alternative `@walletpass/pass-js` v7.2.0 | corrected | https://registry.npmjs.org/passkit-generator ; https://registry.npmjs.org/@walletpass%2Fpass-js | `passkit-generator` was confirmed as v3.7.0, MIT, published 2026-10-14T22:19Z. `@walletpass/pass-js` is AGPL-3.0-or-later, a licence risk the notes did not flag. It was corrected inline. |

Other checks done along the way (not in the 12):
- **Confirmed:** the HIG "in apps and in any browser" line and the December 16, 2025 revision note. The HIG has a newer revision dated June 8, 2026.
- **Confirmed:** the Marketing Guidelines say clear space is one quarter of the mark's height, and the HIG says 1/10.
- **Confirmed:** the ® rule for the first US body-copy mention, Apple's parity rule, and the "staged digital wallet / substitute merchant of record" prohibition.
- **Disputed:** the Visa July 30, 2025 device-token claim. A note was added inline.

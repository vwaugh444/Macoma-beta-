# Macoma Front End, Phone-OTP Onboarding and Account Connectors (as of 2026-10-22, US launch)

Research method: about 20 web searches and fetches on 2026-10-22. Several primary pages could not be fetched because the sandbox's DNS failed for developers.google.com, deepstrike.io and switchlabs.dev, so search-result summaries stand in for those pages. Each one is flagged where it is used. Claims without a fetched source appear only under Inferences or Gaps.

## Scroll-driven animation for the landing page (CSS scroll-timelines, GSAP, Motion, Lottie/Rive vs video)

### Takeaway
CSS scroll-driven animations (`animation-timeline: view()/scroll()`) now work in Chrome/Edge and in Safari 26+ (September 2025). Firefox stable still has them behind a flag, so use them as a progressive enhancement with a static fallback. GSAP, including ScrollTrigger and all former Club plugins, has been 100% free for commercial use since Webflow's acquisition. That makes it the safest cross-browser choice when the slide-in/out choreography is complex.

### Cited Findings
- Chrome's scroll-driven animations guide lists Safari support from version 26, with Firefox still behind a flag. — [Chrome for Developers](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)
- Scroll-driven animations "finally landed in Safari 26" (blog dated 2025-09-17), with a `view()` + `animation-timeline` example. — [Cyd Stumpel](https://cydstumpel.nl/?p=1170)
- A 2026 article (secondary) says Safari 26.4 added threaded (off-main-thread) scroll-driven animations and 26.5 fixed progress-accuracy and `animation-play-state` bugs. It also says Firefox 152 (June 2026) still gates the feature behind `layout.css.scroll-driven-animations.enabled`. Neither claim was verified against WebKit or Mozilla release notes. — [buildmvpfast](https://www.buildmvpfast.com/blog/css-scroll-driven-animations-replace-js-2026). Another 2026 blog claims consistent support in all three engines, which conflicts with the Firefox-flag claim. — [codercops](https://blog.codercops.com/blog/css-view-transitions-scroll-animations-2026)
- Webflow: "everyone, whether or not they're a Webflow customer, can use all of GSAP's tools free of charge, including the previously paid Club plugins. The standard license was also expanded to cover commercial work." — [Webflow blog](https://webflow.com/blog/gsap-becomes-free)
- The GSAP README (v3.15.0) says Webflow's support made the full toolset free, "even for commercial use", and calls ScrollTrigger "the standard for scroll-driven animations". — [GSAP README on jsDelivr](https://cdn.jsdelivr.net/npm/gsap@3.15.0/README.md)

### Inferences
- Recommended layering: (1) Use CSS `animation-timeline: view()` with `animation-range: entry/exit` for simple per-card slide in/out, wrapped in `@supports (animation-timeline: view())`. Firefox gets a static or IntersectionObserver fallback. (2) If you need pinned sections, scrubbing through a chat thread, or sequencing several phones, use GSAP ScrollTrigger, which is free, framework-agnostic and works in plain HTML (fits the current Express + static HTML stack). (3) Motion (formerly Framer Motion) only makes sense if the site moves to React. It adds no capability here that GSAP or CSS lack.
- Phone message-thread "videos" are better built as code-rendered HTML/CSS bubbles animated with CSS or GSAP than as video. Text stays crisp at any DPR, the payload is tiny (KB, not MB), copy is easy to localize and A/B test, the content is accessible and indexable, and it costs nothing in mobile data. Lottie (After Effects to JSON) or Rive (state-machine runtime) are a middle ground if a designer wants richer motion. Rive's interactivity suits a "tap to see reply" demo. File sizes and runtime weights for Lottie and Rive were not researched (see Gaps).
- Always honor `prefers-reduced-motion: reduce` by disabling scroll-scrub and showing static frames.

### Gaps
- No primary WebKit release notes or caniuse page was fetched, so the exact Safari 26.x and Firefox status should be re-checked on caniuse.com/css-scroll-driven-animations before launch.
- No current Lottie or Rive runtime-size or performance benchmarks were gathered.

## Video performance and real AI video vs code-rendered animation

### Takeaway
If you use real video, use `<video autoplay loop muted playsinline poster=...>` with WebM/AV1 listed before an MP4/H.264 fallback. Keep it out of the LCP path: give it a poster, or keep video below the fold and lazy-start it. For text-message demos, code-rendered animation beats AI-generated video on legibility, weight, editability and accuracy.

### Cited Findings
- web.dev recommends `<video autoplay loop muted playsinline>` to replace GIF-like content and lists the WebM `<source>` before MP4 because "browsers take the first format they support". It recommends verifying with Lighthouse. — [web.dev: Replace GIFs with video](https://web.dev/articles/codelab-replace-gifs-with-video)
- `muted` is what lets browsers permit autoplay, and `playsinline` prevents iOS forcing fullscreen. Since Chrome 116, a video's poster image or first frame can count as the LCP element. A poster plus `prefers-reduced-motion` handling and real-user LCP re-measurement are advised. Lighthouse 13 folded the "Use video formats for animated content" audit into the "Improve image delivery" insight. (Secondary source.) — [OpenReplay blog](https://blog.openreplay.com/replace-gifs-with-mp4/)

### Inferences
- Practical encoding ladder: AV1 in WebM or MP4 first (best compression; supported on recent Chrome/Firefox/Safari with hardware decode), HEVC as an optional Apple-only source, then H.264 MP4 as the universal fallback. Keep clips short (5-10 s loops) at roughly 720p, which for UI-style content is typically well under 1 MB per clip. These numbers are rules of thumb, not sourced.
- Use `preload="none"` or `preload="metadata"` on below-the-fold clips and start or pause them with IntersectionObserver so off-screen videos neither download nor decode. Reserve space with `width`/`height` or `aspect-ratio` to avoid CLS. Do the scroll work in CSS or compositor transforms (transform/opacity only) to protect INP.
- AI-generated video (Veo, Sora, Runway, Kling) is a poor fit for the core product demos. Generators still render on-screen text and UI unreliably, so message bubbles must be exact. Every copy change means regenerating, it costs megabytes per clip on mobile, and fabricated-looking UI can undercut trust. AI video can still work for an ambient hero or b-roll shot (for example, a person glancing at their phone in a shop), composited with a code-rendered phone. This is an inference: no 2026 benchmark of text fidelity in these models was gathered.

### Gaps
- No current generator pricing or terms (Veo/Sora/Runway/Kling) and no text-rendering fidelity evaluations were gathered.
- No current AV1/HEVC browser-support matrix was fetched.

## Framework and hosting for a solo founder

### Takeaway
No sources were fetched for this question. The recommendations below are inferences from the stack constraints.

### Cited Findings
- None fetched this session. See Gaps.

### Inferences
- **Lowest-change option:** keep Express (which already hosts the Twilio webhooks and the agent) and serve the marketing page as static HTML/CSS plus GSAP, with a small vanilla-TS onboarding page (`/start`, `/connect`). This avoids a second deploy target and keeps OAuth callbacks on the same origin as session cookies.
- **If a framework is wanted:** Astro is the best fit for a mostly static, animation-heavy marketing page. It ships zero JS by default, and "islands" can hold the OTP form and connect page. It deploys static to Cloudflare Pages or Vercel, and the API stays on Express. Next.js is the choice if the onboarding app becomes a substantial React dashboard: the largest ecosystem, first-class on Vercel, but heavier and with more platform coupling. SvelteKit is lean but has a smaller ecosystem. Remix has been folded into React Router v7, so there is less reason to choose it in 2026 (unverified; confirm).
- **Hosting:** Cloudflare Pages/Workers offers a generous free tier, a global CDN, Turnstile on the same platform and cheap egress for video. Vercel has the best Next.js DX, but bandwidth and function pricing can surprise teams serving video. Either way, OAuth callback and token-storage endpoints belong on the long-running Express backend (Render, Fly, Railway, etc.), not on edge functions, because they need KMS access and stable secrets handling.

### Gaps
- No current Vercel or Cloudflare pricing pages, and no Astro, Next.js or SvelteKit release notes, were fetched. The report writer should treat this section as unsourced judgment.

## Phone OTP: Twilio Verify vs DIY, fraud protection, WebOTP and one-time-code, passkeys

### Takeaway
Use Twilio Verify. It starts at $0.05 per successful verification plus channel fees and includes Fraud Guard against SMS pumping. Add Cloudflare Turnstile or reCAPTCHA in front of the "send code" endpoint, restrict SMS geo-permissions to the US (plus Canada if needed), set `autocomplete="one-time-code"` on the input, and send origin-bound SMS (`@macoma.ai #123456`) so iOS/macOS Safari and Android Chrome can autofill.

### Cited Findings
- Twilio Verify pricing "starts at $0.05 per successful verification", plus channel fees, with volume discounts. You pay only for successful verifications. The fact sheet says Verify Fraud Guard blocks artificially inflated traffic (AIT, i.e. SMS pumping) in real time. — [Twilio Verify](https://www.twilio.com/en-us/user-authentication-identity/verify); [Twilio Verify fact sheet](https://static1.twilio.com/en-us/user-authentication-identity/verify/fact-sheet)
- A secondary 2026 estimate puts the US SMS channel fee at about $0.0083 per message and notes that SMS attempts are billed even when undelivered. — [Authgear](https://www.authgear.com/post/twilio-verify-pricing-and-alternatives)
- `autocomplete="one-time-code"` triggers Safari's code suggestion (web.dev cites Safari 12+ on iOS/iPadOS/macOS; another version says origin-bound rules apply from iOS 14). Codes bound to an origin are not suggested on other domains, which protects against phishing. — [web.dev SMS OTP form best practices](https://web.dev/articles/sms-otp-form)
- The WebOTP API (`navigator.credentials.get({otp:{transport:['sms']}})`) works only in Chromium on Android. Chrome on iOS doesn't support it, and other engines don't implement it. Safari uses the same origin-bound SMS format for its autofill. An origin-bound SMS received on iOS can be forwarded to macOS when iMessage sync is on. — [Chrome for Developers: cross-device WebOTP](https://developer.chrome.com/blog/cross-device-webotp)

### Inferences
- DIY OTP (generating codes and sending them with Programmable Messaging) saves the $0.05 but means building rate limiting, code hashing and expiry, retries and fraud blocking yourself. SMS pumping losses can easily exceed the savings, so Verify is worth it at launch volumes.
- Defenses to configure: Twilio Messaging geo-permissions limited to US/CA; Fraud Guard set to standard or max; per-IP and per-number rate limits on `/otp/send`; Turnstile (free) or reCAPTCHA verified server-side before calling Verify; reject non-mobile or VoIP numbers using Twilio Lookup line-type intelligence (cost not researched).
- The verified phone number is the account identity, and because SMS is the product channel it doubles as proof of possession. Offer a passkey (WebAuthn) as an optional step on the connect page so returning web visits (managing connectors, billing) skip SMS. Passkeys are not needed for the SMS agent itself.
- Message template: `Your Macoma code is 123456\n\n@macoma.ai #123456`. The last line must be the origin-bound line.
- US A2P 10DLC or toll-free verification for the agent's own outbound texting is a separate requirement that Verify does not cover for non-OTP messages. It is assumed to be covered by other researchers.

### Gaps
- No primary source on whether Fraud Guard costs extra, and no current Lookup pricing.
- The exact iOS minimum version for origin-bound autofill is inconsistent across web.dev versions.

## Connectors: Google, Microsoft, Intuit, Square, Stripe, Shopify (effort, cost, approval timelines)

### Takeaway
Gmail is the long pole. Its restricted scopes require Google OAuth verification plus a CASA security assessment from an authorized lab, revalidated every 12 months. Lab prices quoted in 2025-2026 range from about $540 to about $1,800 per year for Tier 2 at low-cost labs, and several thousand dollars for Tier 3. Calendar uses sensitive scopes, which need verification but no CASA. Microsoft needs publisher verification (free, via a Microsoft Partner Network ID) or users in many tenants can't consent. Intuit requires an app assessment questionnaire before production keys. Square has no gate found, but tokens expire every 30 days. Stripe uses Connect OAuth to Standard accounts. Shopify now routes even unlisted multi-merchant apps through app review, with long and unpredictable queues.

### Cited Findings

**Google (Gmail restricted, Calendar sensitive)**
- Apps using restricted Gmail/Drive scopes must pass a CASA audit by a Google-approved lab and revalidate yearly. The pass certificate is a Letter of Validation (LOV) valid for 12 months. (Secondary; page not fetchable.) — [DeepStrike CASA guide](https://deepstrike.io/blog/google-casa-security-assessment-2025)
- Lab pricing table (secondary): TAC Security $540 (Tier 2) / $4,500 (Tier 3); Leviathan Security $800-$1,200 (Tier 2) / $5,000-$8,000 (Tier 3). — [Switch Labs](https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option)
- An article rebutting the "$50,000 Gmail add-on" myth puts Tier 2 through TAC Security at $540 to $1,800 per year. — [Bright Softwares](https://bright-softwares.com/blog/en/google-workspace/the-50000-gmail-add-on-myth-what-google-s-casa-certification-really-costs). An indie developer's anecdotal forum quotes were $15k-$40k. — [Latenode community](https://community.latenode.com/t/is-casa-tier-2-assessment-necessary-for-all-gmail-api-apps-options-for-indie-developers/22861)
- Sources conflict on the tier. One says `gmail.readonly` triggers Tier 3 (a full pen test); a Google Groups thread (about 2.5 years old) says Tier 2 is mandatory for all restricted scopes and Tier 2 self-scan is no longer allowed. Another describes the newer nomenclature AL1/AL2 (formerly Tiers 1-3), assigned by Google. — [DeepStrike](https://deepstrike.io/blog/google-casa-security-assessment-2025); [Google Groups](https://groups.google.com/g/google-apps-script-community/c/XgsHT2Fr7u8)
- A startup's write-up describes passing CASA Tier 2 "in a weekend" using Claude for remediation (anecdotal). — [Orbis](https://meetorbis.com/blog/how-we-passed-google-casa-tier-2-with-claude)
- Google's official restricted-scope verification page could not be fetched (DNS failure in the sandbox): [developers.google.com restricted-scope-verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

**Microsoft Graph (Outlook/M365)**
- Since November 2020, under risk-based step-up consent, users can't consent to most newly registered multitenant apps without a verified publisher. Microsoft recommends tenants allow user consent only for verified publishers with low-impact permissions; otherwise an admin must consent. — [Microsoft Learn: application consent experience](https://learn.microsoft.com/entra/identity-platform/application-consent-experience)
- The verified badge means the publisher verified their identity with a Microsoft Partner Network (MPN/Cloud Partner Program) account. A verified badge does not remove the "This app may be risky" warning. — [Nylas Microsoft verification guide](https://developer.nylas.com/docs/provider-guides/microsoft/verification-guide.md); [Nylas support](https://support.nylas.com/hc/en-us/articles/28841177145117-Understanding-This-App-May-Be-Risky-Warnings-Post-Publisher-Verification)
- A Microsoft Q&A answer (February 2026) says app updates can remove the Verified badge until re-certification. — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5789743/publisher-verification-for-teams-app-when-app-is-i)

**Intuit QuickBooks Online**
- Every app that connects to production QuickBooks Online companies must complete Intuit's app assessment questionnaire, listed or not. Approval unlocks production credentials, and Apideck advises submitting early and asking Intuit Developer Support for a timeline. — [Apideck QBO compliance](https://developers.apideck.com/connectors/quickbooks/docs/application_owner+app_compliance)
- The process is "usually fast". Intuit asks for more information if a submission falls short. — [Railz](https://help.railz.ai/en/articles/6289296-how-to-request-quickbooks-online-production-access)
- Apps on the Intuit App Store, or with more than 500 connections, are reviewed annually (or more often at Intuit's discretion), and issues must be fixed within 2 weeks of notification. — [Apideck](https://developers.apideck.com/connectors/quickbooks/docs/application_owner+app_compliance)

**Square**
- Square OAuth access tokens expire every 30 days. Square "strongly recommends" refreshing asynchronously every 7 days or less, checking token age on load (alert if older than 8 days), keeping tokens server-side only, and letting sellers view and revoke access. With PKCE, refresh tokens are single-use and expire after 90 days. — [Square: move OAuth to production](https://developer.squareup.com/docs/oauth-api/movetoprod); [Square: refresh, revoke, limit scope](https://developer.squareup.com/docs/oauth-api/refresh-revoke-limit-scope)
- A community post says the `oauth.authorization.revoked` webhook fires on merchant revocation (unverified against official docs). — [Square forums](https://developer.squareup.com/forums/t/oauth-token-issues/26359)

**Stripe**
- Extensions that need access to a user's existing Stripe account must use OAuth with Standard connected accounts and should not use OAuth with Express. The sample authorize link uses `scope=read_only`. — [Stripe: building extensions](https://edge-docs.stripe.com/building-extensions); [Stripe: Standard accounts](https://docs.stripe.com/docs/connect/standard-accounts)
- A connected account's type can't be changed after creation. Express is for platforms onboarding new accounts, where the platform handles disputes and refunds. — [Stripe: Connect account types](https://docs.stripe.com/docs/connect/accounts)
- A single June 2026 source says Accounts v2 (`/v2/core/accounts`) is the recommended path for new platforms, but OAuth-based onboarding must stay on v1 (unverified). — [DEV Community](https://dev.to/astraedus/building-a-multi-tenant-saas-with-stripe-connect-in-2026-jjn)

**Shopify**
- An unlisted app is still a public app and goes through app review. Custom distribution skips review but is limited to a single shop, or shops within one Plus organization, and duplicating custom apps per merchant violates the Partner Program Agreement. Shopify gives no timeframe and won't expedite unlisted apps. — [Shopify dev community](https://community.shopify.dev/t/unlisted-shopify-app-with-oauth-review-required-before-installation/33131); [Review timeline thread](https://community.shopify.dev/t/review-timeline-for-unlisted-shopify-app/29152)
- One 2026 developer report describes `shpat_` admin tokens deprecated on January 1 and App Store review queues of 4+ months with no SLA (anecdotal). — [Shopify dev community](https://community.shopify.dev/t/shopify-where-is-the-bridge-shpat-deprecated-jan-1-app-store-reviews-are-4-months-new-merchants-are-stranded/34558). A third-party blog estimates 7-14 business days. — [Growave](https://www.growave.io/it/blog/how-long-does-shopify-app-review-take)

### Inferences
- **Launch sequencing for a solo founder:**
  - Phase 1: Google Calendar (sensitive scopes; brand verification typically takes days to weeks), Gmail via a unified platform's managed app or with `gmail.send` only, Microsoft (do publisher verification on day 1), Stripe `read_only`, and Square.
  - Phase 2: start QuickBooks production access immediately (questionnaire), and start your own Gmail restricted-scope verification plus CASA in parallel. Budget about $1-2k/yr for the lab plus 4-10 weeks of calendar time (inferred from the sources above; not confirmed by Google).
  - Phase 3: Shopify, because of the review-queue risk. Notion OAuth was not researched.
- Under Google's "Testing" publishing status, apps are capped at 100 test users with 7-day refresh-token expiry (from memory; unverified this session). That is enough for a closed beta before CASA.

### Gaps
- Google's official current CASA tier/AL mapping for Gmail scopes, its review SLA and its exemption rules (such as the 100-user testing cap) could not be fetched.
- No primary Square App Marketplace review requirements; no Stripe Apps vs Connect OAuth comparison; no Notion OAuth research.

## Unified-integration platforms (Composio, Nango, Paragon, Merge, Pipedream Connect, Arcade) and CASA

### Takeaway
Composio's managed Gmail OAuth app lets you ship without your own Google verification or CASA, at the cost of a Composio-branded consent screen and shared quota. For production branding you bring your own Google client, and then verification and CASA are yours again. Prices vary widely: Arcade Team $25/mo + usage, Composio free tier then about $29/mo, Nango free then from $50/mo (another source says $500), Pipedream Connect Startup $99/mo annual. Paragon and Merge were not priced.

### Cited Findings
- Composio registers and maintains OAuth apps for popular toolkits (GitHub, Gmail, Slack) with zero setup. In production, users should see your app name, so the docs recommend your own credentials. Managed apps share quota, while your own app has a dedicated one. — [Composio docs: managed vs custom auth](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app)
- Composio's blog says the managed Gmail app means "no Google verification on your end", while noting that this doesn't mean Google approved your app. — [Composio blog](https://composio.dev/blog/ship-gmail-integration-in-minutes)
- Composio KB: Google can block sign-in when an OAuth app requests a sensitive or restricted scope not approved for that app. Use the auth config's existing scopes, or create and verify your own app. — [Composio KB](https://docs.composio.dev/kb/guide/platform-google-oauth)
- Pricing (secondary comparisons; they conflict):
  - Composio: free Hobby (100k tool calls/mo per one source, about 5k per another), then Pro $29/mo.
  - Arcade: free tier with 2,000 tool calls and 2,000 auth events/mo; Team $25/mo + $0.10/auth event + $0.01/tool call.
  - Pipedream Connect: Startup $99/mo annual or $150 monthly, with 100 external users and 10k credits; the free plan has no production environment.
  - Nango: free, then paid from $50/mo, or "Growth from $500/mo" per another source.
  - Sources: [Swytchcode pricing comparison](https://www.swytchcode.com/content/composio-pricing-compared); [Nango: Composio vs Nango](https://nango.dev/blog/composio-vs-nango/)
- Nango offers white-label auth on all plans, while Composio is platform-branded. Arcade emphasizes per-user authorization, OpenTelemetry audit logs and IdP integration. — [Swytchcode](https://www.swytchcode.com/content/arcade-vs-composio-vs-nango-vs-swytchcode); [Nango blog](https://nango.dev/blog/composio-vs-nango/)
- Nylas forum: using a vendor's hosted OAuth for restricted Google scopes still raises verification questions. — [Nylas forums](https://forums.nylas.com/t/google-verification-requirement-with-nylas-hosted-oauth-for-restricted-scopes/855)

### Inferences
- **Only a managed or shared OAuth app avoids CASA.** Any platform used with your own Google client ID (required for a "Macoma" consent screen) leaves verification and CASA with you. Nango (open source and self-hostable, white-label) fits best for owning tokens with your own clients. Composio or Arcade fit best for the fastest start with managed apps plus ready-made agent tools. Pipedream Connect has the broadest catalog but the highest entry price.
- **Security posture:** a unified platform holds every user's refresh tokens, so check SOC 2 Type II, data residency, the BYO-encryption or self-host option, and token export so you aren't locked in. These were not verified per vendor this session.

### Gaps
- No primary pricing pages were fetched, and Paragon and Merge pricing and positioning (Merge targets B2B unified APIs: accounting, HRIS, CRM) are not covered. SOC 2 status per vendor is not verified. No vendor confirmed its managed Gmail app's CASA status.

## MCP remote servers with OAuth as the connector layer; Claude connectors; Messages API `mcp_servers`

### Takeaway
Yes: Macoma can pass per-user remote MCP servers to the Messages API through `mcp_servers` (beta header `mcp-client-2025-11-20`) with a per-user `authorization_token`. However, Macoma must run the OAuth flow, store the tokens and refresh them itself; the API does not do this. Only MCP tools are supported, the server must be publicly reachable over HTTP, and the feature is not eligible for zero data retention (ZDR). Claude.ai's own connectors are remote MCP servers using MCP's OAuth 2.1 authorization; the 2025-11-25 spec makes Client ID Metadata Documents (CIMD) the preferred client registration, with Dynamic Client Registration (DCR) as a fallback.

### Cited Findings
- MCP connector: beta header `mcp-client-2025-11-20` (the earlier `mcp-client-2025-04-04` is deprecated). It is available on the Claude API, Claude Platform on AWS and Microsoft Foundry, and is not eligible for ZDR. Only tool calls from the MCP spec are supported; servers must be public over Streamable HTTP or SSE, and stdio servers are not supported. — [Anthropic MCP connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- Config has two parts: `mcp_servers[]` with `{type:"url", url, name, authorization_token}`, and a `tools[]` entry `{type:"mcp_toolset", mcp_server_name, default_config, configs}` that supports allowlists, denylists and per-tool settings such as `defer_loading`. Multiple servers with different tokens can be used in one request. — [Anthropic MCP connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- "API consumers are expected to handle the OAuth flow and obtain the access token prior to making the API call, and to refresh the token as needed." — [Anthropic MCP connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- MCP authorization spec 2025-11-25: CIMD (a client_id that is an HTTPS URL to the client's metadata) is the SHOULD default. Registration order is pre-registered client, then CIMD (if `client_id_metadata_document_supported`), then DCR (RFC 7591), then manual. Risks include SSRF and phishing, so servers should show the client_id hostname. — [den.dev](https://den.dev/blog/mcp-november-authorization-spec/); [WorkOS](https://workos.com/blog/mcp-client-registration-cimd-vs-dcr)
- One blog claims a 2026-07-28 spec revision deprecates DCR in favor of CIMD and requires `iss` validation (unverified against modelcontextprotocol.io). — [SSOJet](https://ssojet.com/blog/mcp-authorization-spec-2026-07-28-what-changed)

### Inferences
- **Architecture options:**
  - (A) **Direct APIs + local tools:** Macoma holds the Google/Microsoft/etc. tokens and exposes its own tool functions to Claude via normal tool use. This gives maximum control and ZDR compatibility, and is the simplest given the existing Express code.
  - (B) **MCP connector:** use first-party remote MCP servers where vendors provide them (several SaaS vendors run official remote MCP servers), or your own or Composio/Arcade-hosted MCP endpoints, attached per request with the user's token. This cuts tool-writing effort but adds a beta dependency, no ZDR, and a server-side round-trip from Anthropic to the MCP server.
  - (C) **Hybrid:** Macoma's own MCP server fronts Google/Microsoft with Macoma's verified OAuth clients and is passed via `mcp_servers` with a Macoma-issued per-user token. This is likely the cleanest: one connector abstraction, provider tokens never leave Macoma, and the token sent to Anthropic is a short-lived, scoped Macoma token rather than a raw Gmail token.
- Using a vendor's remote MCP server does not remove that vendor's OAuth app review: the consent is to the MCP server operator's client.
- Because the agent runs over SMS without a browser, every OAuth consent must happen in the web connect page. Later "connect X" requests from SMS should reply with a magic link to that page.

### Gaps
- No Anthropic help-center page on claude.ai custom connectors (callback URL, DCR/CIMD behavior) was fetched, and the 2026-07-28 spec claim is unverified.

## Token storage security

### Takeaway
Use envelope encryption: a per-record data key (AES-256-GCM) wrapped by a KMS key. Scope every token row to user_id and provider, use the user and connection IDs as AAD, rotate refresh tokens on every refresh where the provider issues new ones, refresh proactively (Square: at most every 7 days), and on disconnect call the provider's revoke endpoint and delete the ciphertext. Square's production checklist is the one sourced example of these operational rules.

### Cited Findings
- Square requires server-side-only token storage, proactive refresh at most every 7 days, staleness alerts, and seller-visible status plus revocation. PKCE refresh tokens are single-use, with 90-day expiry. — [Square move-to-production](https://developer.squareup.com/docs/oauth-api/movetoprod); [Square refresh/revoke](https://developer.squareup.com/docs/oauth-api/refresh-revoke-limit-scope)
- The Anthropic MCP connector puts token acquisition and refresh on the API consumer. — [Anthropic MCP connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)

### Inferences
- **Concrete design:**
  - Schema: `connections(id, user_id, provider, scopes, status, enc_access, enc_refresh, wrapped_dek, kms_key_id, expires_at, last_refreshed_at)`.
  - Encryption: AWS KMS or GCP Cloud KMS `GenerateDataKey`; AES-GCM with AAD = `user_id|provider|connection_id`. Cache plaintext data keys in memory only, and briefly.
  - Access and logging: log every decrypt. Give the SMS agent's worker decrypt rights, but never the web tier.
  - Refresh: a background job refreshes tokens before expiry. Treat `invalid_grant` as a disconnected state and text the user a reconnect link.
  - Rotation and revocation: store the new refresh token atomically when a provider rotates it (single-use refresh tokens, as with Square PKCE). On disconnect, call the provider's revoke endpoint, then hard-delete.
  - Least privilege: request the smallest scopes (for example `gmail.send` or `gmail.compose` before `gmail.readonly`; Stripe `read_only`).
- CASA reviewers check exactly these controls (encryption at rest, key management, logging), so building them first also shortens CASA remediation. This is an inference from CASA being an OWASP ASVS-based assessment, which was not verified this session.

### Gaps
- No primary KMS docs or OWASP ASVS/CASA control lists were fetched.

## UX for the "connect your accounts" page and the SMS handoff

### Takeaway
No UX sources were fetched. These recommendations are inferences.

### Cited Findings
- Microsoft shows "Unverified" in place of the publisher name for unverified apps, which hurts conversion on the consent screen. Publisher verification is a UX prerequisite. — [Microsoft Learn consent experience](https://learn.microsoft.com/entra/identity-platform/application-consent-experience)

### Inferences
- **Flow:**
  1. Landing page, then the OTP form.
  2. On successful verify, set an httpOnly session and navigate the same tab to `/connect`. A separate window is not needed and new windows are often blocked on mobile.
  3. Show connector cards grouped as "Personal" (Gmail, Calendar, Outlook) and "Business" (QuickBooks, Square, Stripe, Shopify). Each card has its permission summary, a Connect button and a connected state.
  4. Offer "Skip for now" and "Done".
  5. On "Done", POST `/onboarding/complete`; the server sends the first agent text immediately. Show a "We just texted you at (•••) •••-1234" screen with an `sms:` deep link to the Macoma number and a "Didn't get it? Resend" button.
- **Popup vs redirect:** on mobile (most users arriving from SMS or ads), use a full-page redirect with a `state` parameter carrying the CSRF nonce and return path. Popups are unreliable on iOS and in in-app browsers (Instagram/TikTok webviews also block Google OAuth via the "disallowed_useragent" policy, so detect webviews and prompt "Open in Safari/Chrome"). On desktop a popup that `postMessage`s back keeps context; redirect is the safe default for both.
- **Progressive connection:** ask for one connector at onboarding, chosen by a "What do you want help with?" chip. Let the agent request others in context over SMS ("I can check that if you connect QuickBooks: macoma.ai/c/abc") using a short-lived signed magic link. This is also the pattern Claude's connectors use: connect when needed.
- **Incremental scopes:** start Gmail with a lower scope tier and escalate with Google's incremental authorization only when needed, so most users never see restricted-scope warnings before CASA is complete.

### Gaps
- No usability studies or conversion data on popup vs redirect, or on skip-able onboarding, were gathered. The webview OAuth block is from memory and not re-verified.

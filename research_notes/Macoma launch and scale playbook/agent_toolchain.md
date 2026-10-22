# AI Agent Toolchain for a One-Person Company Running Macoma (as of Oct 22, 2026)

Scope: the agents and tools a solo founder uses to build, design, publish, deploy, secure and operate Macoma, an SMS AI assistant for small business owners (Node/TypeScript, Twilio, Stripe, Postgres planned, OAuth connectors, GitHub, built on Claude).
Method note: about 20 searches and fetches. Official pages were used where they could be reached (claude.com/pricing, code.claude.com docs, GitHub changelog/docs, Twilio help). Many vendor prices come from third-party aggregators. Those are marked "(3rd-party)" and need checking on the vendor page before anyone budgets with them. Anything labelled "estimate" is my own inference.

## 1. Coding agents: which to use for what, and what they cost

### Takeaway
Make Claude Code the main tool, because Macoma already runs on Claude and one subscription covers CLI, web/cloud sessions, routines and the GitHub Action. A solo founder on Max (from $100/mo) can run nearly all coding through it. Use Cursor only if an IDE with tab-completion is wanted. Treat Codex, Copilot agent, Devin and Jules as optional second opinions or cheap async workers, not a second core platform.

### Cited Findings
**Claude plans and API (official page, fetched Oct 2026)**
- Pro: $17/mo on annual billing ($200 paid up front), or $20 month-to-month. Includes Claude Code. — [Claude pricing](https://claude.com/pricing)
- Max: "from $100/month" (5x and 20x tiers). Team Standard seat: $20/mo annual or $25 monthly. Team Premium seat: $100 annual or $125 monthly. Enterprise: $20/seat/mo annual, 20-seat minimum, plus usage at API rates. Every paid tier includes Claude Code. — [Claude pricing](https://claude.com/pricing)
- API list prices per MTok as fetched: Opus 5.5 at $4 in / $20 out (cache read $0.20). Sonnet 5.5 at $2 / $10. Haiku 5.5 at $0.10 / $0.50 for prompts of 100K tokens or less, and $0.50 / $2.50 above that. Batch saves 50%. Opus fast mode costs 2x. — [Claude pricing](https://claude.com/pricing). **Conflict:** a third-party guide quotes Opus 5 at $5/$25 and says Sonnet 5 rose from $2/$10 to $3/$15 on Sep 1, 2026 — [Verdent](https://verdent.ai/guides/claude-managed-agents-pricing). Re-check the live rate card and the `claude-api` model list before modelling unit costs.
- Max 20x price: the fetched page shows only "from $100", so the 20x price was not confirmed (see Gaps).

**Claude Code surfaces**
- Routines: scheduled cloud agents that run on Anthropic infrastructure while the laptop is closed. They can be triggered by a schedule, an HTTP API call, or a GitHub event (PR or release). Research preview launched Apr 14, 2026. Reported daily run limits: Pro 5, Max 15, Team/Enterprise 25 (3rd-party). — [Daniel Vaughan](https://codex.danielvaughan.com/2026/04/14/claude-code-routines-launch/), [MakerKit guide](https://makerkit.dev/blog/tutorials/claude-code-routines-guide), [Rick High](https://rickhigh.substack.com/p/claude-code-advanced-the-four-ways)
- Desktop scheduled tasks and `/loop` run on your own machine and need it switched on. Remote Control lets you continue a local session from another device: the files and tools stay on your machine and only the UI is remote. — [Rick High](https://rickhigh.substack.com/p/claude-code-advanced-the-four-ways)
- Routines can be set up at claude.ai/code/routines, with `/schedule` in the CLI, or in the Desktop app. One source says API and GitHub triggers can only be added in the web UI (may be outdated). — [MakerKit](https://makerkit.dev/blog/tutorials/claude-code-routines-guide)
- Claude Managed Agents (hosted agent loop): $0.08 per session-hour of active runtime plus standard token rates. — [Claude pricing](https://claude.com/pricing). Idle, rescheduling and terminated time is not billed. Batch and fast-mode discounts don't apply. Web search costs $10 per 1k searches (3rd-party). — [TrueFoundry](https://www.truefoundry.com/blog/claude-managed-agents-pricing), [Verdent](https://verdent.ai/guides/claude-managed-agents-pricing)

**Alternatives (all 3rd-party and conflicting; check before buying)**
- Cursor: Hobby free, Pro $20 (includes a $20 credit pool; Auto mode unlimited), Pro+ $60, Ultra $200, Teams $40/user. Annual billing about 20% cheaper. Bugbot (PR review) has been out of beta since Aug 2025; per-tier price not found. — [Jetadmin](https://www.jetadmin.io/blog/untitled-31/), [eesel](https://eesel.ai/blog/cursor-pricing), [WeAreFounders](https://www.wearefounders.uk/cursor-pricing-2026-every-plan-explained-and-the-hidden-costs-nobody-mentions/)
- OpenAI Codex: Free, Go $8, Plus $20, Pro from $100. Reportedly moved to token-based billing on Apr 2, 2026, with OpenAI estimating $100–200 per developer per month for active use. — [techsy.io](https://techsy.io/en/blog/background-coding-agents-compared), [davidveksler cheatsheet](https://cheatsheets.davidveksler.com/ai-coding-agents-compared.html)
- GitHub Copilot coding agent: from Copilot Pro at $10/mo. Billing reportedly moved to GitHub AI Credits ($0.01 each) on Jun 1, 2026. — [ssojet](https://ssojet.com/blog/best-cloud-coding-agents), [morphllm](https://morphllm.com/comparisons/github-copilot-alternatives)
- Devin: entry price cut from $500 to $20/mo in Apr 2026. Max $200. — [AI Agent Index](https://theaiagentindex.com/compare/devin-vs-openai-codex), [fungies](https://fungies.io/?p=39323)
- Google Jules: free tier of 15 tasks/day; Pro about $19.99; up to 300 tasks/day on AI Ultra ($124.99). One source reports SWE-bench Verified at 51.8% for Jules vs 80.8% for Claude Code (benchmark versions are unclear). — [techsy.io](https://techsy.io/en/blog/background-coding-agents-compared), [rework](https://resources.rework.com/de/tools/ai-agents/best-ai-coding-agents-2026)

### Inferences
- Suggested task routing:
  - Interactive feature work and refactors across Twilio webhooks, Stripe and OAuth: Claude Code CLI or Desktop, in plan mode first.
  - Overnight or async issue-to-PR work: Claude Code web sessions or routines triggered by GitHub issues/labels.
  - Recurring chores (dependency triage, log digests, eval runs): routines.
  - Checking in from a phone: Remote Control.
  - Second-opinion review: Codex or Copilot review, run on a few PRs only.
  - Product runtime: Claude API directly, or Managed Agents for long-running tool loops.
- Cost estimate: Max 5x at $100 is the right default for a founder coding daily. Pro at $20 will likely hit limits. Move to Team only when a second human or Claude Code Review is needed (review reportedly requires Team/Enterprise; see section 2).

### Gaps
- Exact Max 5x/20x prices and current Claude Code usage limits: not visible on the fetched page.
- Official docs pages for routines and Remote Control were not fetched. Routine run limits come from third parties.
- Current Opus/Sonnet 5.x prices conflict between sources.

## 2. Code review, CI and quality

### Takeaway
Layer it: GitHub Actions CI (typecheck, lint, tests) as required checks, then one AI reviewer (Claude Code Review if on Team, otherwise the Claude GitHub Action, or CodeRabbit for cheap per-seat review), then Dependabot or Renovate. Greptile costs more and is only worth it if deep codebase-graph review is wanted.

### Cited Findings
- Claude Code Review has no fixed per-review price. Cost is token-based and depends on review level, diff size and complexity. Admins see the average cost per review in Admin settings and can set an org-wide monthly cap at claude.ai/admin-settings/usage. "After every push" mode multiplies cost by pushes per PR. — [Claude Code docs: code review costs](https://code.claude.com/docs/en/code-review-costs.md)
- Third-party estimates of $15–25 per review trace back to a VentureBeat estimate, not an official price. Reportedly Team/Enterprise only and GitHub-only at launch. — [emelia.io](https://emelia.io/hub/claude-code-review-test), [Tenki](https://www.tenki.cloud/blog/claude-code-review-enterprise-pricing), [codeant](https://www.codeant.ai/blogs/anthropic-claude-code-review)
- Greptile: $30 per developer seat per month, including 50 reviews; $1 per extra review. — [aicodereview.cc](https://aicodereview.cc/blog/greptile-pricing), [morphllm](https://www.morphllm.com/comparisons/coderabbit-vs-greptile)
- CodeRabbit: tiers conflict across sources (Lite $12 / Pro $24 / Pro Plus $48, or Pro $24 annual / $30 monthly). The free tier has rate limits. — [techplained](https://www.techplained.com/best-ai-code-review-tools), [devtoollab](https://devtoollab.com/blog/coderabbit-alternatives)

### Inferences
- For a solo dev on Max, the cheapest strong option is the Claude Code GitHub Action (`/install-github-app`) using API key or subscription auth. It is billed by tokens and costs roughly a few dollars per PR (estimate). Add CodeRabbit's free or Pro tier for a second model's view.
- Required CI checks (estimate of good practice): `tsc --noEmit`, eslint, unit tests (vitest), integration tests against Twilio and Stripe test mode (Stripe test keys, Twilio magic numbers), and a Postgres migration dry-run in a service container. GitHub Actions minutes are free for public repos, and private repos get a free monthly allowance (check the GitHub plan).
- Use Renovate if grouping and automerge for patch updates is wanted. Use Dependabot for zero config. In either case, gate automerge on green CI and never automerge major versions.

### Gaps
- Official CodeRabbit, Greptile and Bugbot pricing pages were not fetched.
- Claude GitHub Action per-PR cost: no measured figure found.

## 3. Security

### Takeaway
For a solo repo, the free GitHub controls (secret scanning and push protection on public repos, Dependabot alerts, branch rulesets, 2FA) plus Socket or Semgrep CE cover most of the risk. Pay for GitHub Secret Protection ($19) and Code Security ($30) per active committer only if the repo is private and CodeQL or Autofix on private code is wanted. That costs $49/mo for one committer.

### Cited Findings
- GitHub Secret Protection costs $19/mo per active committer and includes push protection, AI detection and secret scanning alerts. GitHub Code Security costs $30/mo per active committer and includes code scanning (CodeQL), Copilot Autofix and the dependency review action. Both have been sold standalone to Team plan customers since Apr 1, 2025. — [GitHub changelog](https://github.blog/changelog/2025-03-04-introducing-github-secret-protection-and-github-code-security/)
- Active committers are counted over the previous 90 days, and a free secret risk assessment includes a pricing calculator. — [GitHub docs](https://docs.github.com/en/code-security/how-tos/secure-at-scale/configure-organization-security/configure-specific-tools/estimating-the-price-of-secret-protection)
- Claude Code safety controls:
  - Deny rules apply in every mode, including `bypassPermissions`.
  - Writes to protected paths (`.git`, `.claude`, `.husky`, `.mcp.json`, `.npmrc`, shell rc files) are never auto-approved except under bypass.
  - The Bash sandbox blocks network by default and limits write paths at the OS level. Strict sandbox mode disables retrying outside the sandbox.
  - Managed settings can turn off auto mode (`permissions.disableAutoMode`) and bypass mode (`permissions.disableBypassPermissionsMode`).
  - `bypassPermissions` should only be used "in isolated environments like containers, VMs... without internet access."
  - Cloud sessions ignore `bypassPermissions` or `dontAsk` as the default mode.
  - — [Claude Code docs: permission modes](https://code.claude.com/docs/en/permission-modes)
- Claude Code ships a built-in `/security-review` command for pending changes. Seen in this environment's skill list; the official docs page was not fetched.

### Inferences
- Minimum checklist (estimate of best practice for an SMS and payments product):
  - Hardware key (FIDO2/passkey) on GitHub, Stripe, Twilio, the cloud provider, the domain registrar and email.
  - Branch ruleset on `main`: require PR, green checks and linear history; block force-push. For a solo founder, require the AI review check and require approval of your own PR, using GitHub's "require approval of most recent push" pattern or a self-review checklist.
  - Pin GitHub Actions to commit SHAs. Commit `package-lock.json` and use `npm ci`. Consider `--ignore-scripts` with an allowlist.
  - Use Socket for npm supply-chain alerts on PRs.
  - Use OIDC from GitHub Actions to the cloud instead of long-lived keys. Give separate least-privilege IAM roles to deploy, migrations and runtime.
  - Use Twilio API keys (not the master auth token), scoped per environment, and validate the `X-Twilio-Signature` on webhooks.
  - Use Stripe restricted keys and verify webhook signatures.
  - Keep OAuth refresh tokens for connectors encrypted at rest (KMS envelope encryption).
- An SMS product also needs A2P 10DLC registration to send to US numbers. Carrier filtering is a deliverability and compliance "security" issue (see section 7).

### Gaps
- Socket.dev, Snyk and Semgrep pricing: not found in searches (Socket and Semgrep have free tiers, per training knowledge, unverified for 2026).

## 4. Design, brand and marketing media

### Takeaway
Use Claude (artifacts, and Claude Code generating real React/Tailwind) for UI and landing pages, with Figma only if a design system is needed. v0, Lovable and Bolt are good for throwaway prototypes but duplicate what Claude Code already does. For video: Sora is reportedly shut down. Veo 3.1 (API) or Kling are the choices for generated clips. Code-rendered motion (Remotion or HTML animations written by Claude) is cheaper, brand-exact and has no licensing ambiguity for product demos.

### Cited Findings
- Figma Make: free Starter tier. Professional costs $16 per full seat per month with 3,000 AI credits. Organization costs $55/seat. Its unique advantage is reading your Figma files and design system natively (3rd-party). — [salesdorado](https://salesdorado.com/en/?p=71166), [daviesmeyer](https://ai-solutions.daviesmeyer.com/en/blog/figma-make-vs-lovable-vergleich)
- Lovable: €25/mo entry and €50 next tier, unlimited users. Bolt: Pro $25/mo with 10M tokens; Teams $30/member. Prices checked Sep 26, 2026 (3rd-party). — [jetadmin Lovable vs Bolt](https://www.jetadmin.io/blog/lovable-vs-bolt/amp/), [aiagentrank](https://aiagentrank.io/blog/lovable-vs-bolt)
- Sora: sources say OpenAI shut it down, but disagree on dates (Mar 24, 2026, or web Apr 26 and API Sep 24, 2026). — [Piktochart](https://piktochart.com/blog/best-sora-alternatives/), [coverr](https://coverr.co/blog/runway-vs-sora-vs-veo-3-1-vs-kling-pricing-2026)
- Veo 3.1: native 9:16, audio, up to 60-second clips. About $0.40/sec Standard or $0.05/sec Lite. Another estimate is about $0.35/sec, roughly $2.80 per 8-second clip on Vertex. — [rangy](https://rangy.ai/blog/veo-vs-kling-vs-runway), [coverr](https://coverr.co/blog/runway-vs-sora-vs-veo-3-1-vs-kling-pricing-2026)
- Kling 3.0: about $6.99–8/mo Standard, with no API at standard pricing. Runway Gen-4.5: $12/mo entry, $95+ for higher tiers, strongest for editing-led workflows. — [coverr](https://coverr.co/blog/runway-vs-sora-vs-veo-3-1-vs-kling-pricing-2026), [provimedia](https://provimedia.de/en/blog/ai-video-tools-2026)
- None of the sources found clearly covered commercial-use licensing. Check each vendor's terms. — [coverr](https://coverr.co/blog/runway-vs-sora-vs-veo-3-1-vs-kling-pricing-2026)

### Inferences
- Logo and brand: generate concepts with an image model, then have a human or designer redraw the final mark as a vector. Purely AI-generated marks may not be registrable or copyrightable in the US (US Copyright Office position; not re-verified here). File the trademark on the name, not the AI image.
- Product demo videos for an SMS product are mostly phone-screen mockups of text threads. Remotion or React animations written by Claude Code render these exactly and cost nothing per render.

### Gaps
- v0 by Vercel pricing: not found.
- Commercial-use terms and indemnity for Veo, Kling and Runway: not verified.
- Midjourney, Ideogram and Recraft pricing: not searched.

## 5. Publishing, deploy and infrastructure

### Takeaway
Put the marketing site on Vercel or Cloudflare Pages (preview deploys per PR). Put the Node API that receives Twilio and Stripe webhooks on Render or Railway at the start: managed Postgres, preview environments, and no ops. Move to Fly.io or AWS only when cost or scale requires it. Express all infrastructure as code (render.yaml, railway.json or Terraform) so that agents edit config through PRs, not consoles.

### Cited Findings
- Render: Starter web service $7/mo, Standard $25, Pro $85–450. Managed Postgres compute from about $6/mo, plus storage at $0.30/GB/mo. Supports 100-minute HTTP responses. — [findstack](https://findstack.com/resources/railway-vs-render-vs-fly-io), [Render](https://render.com/articles/best-railway-alternatives)
- Railway: usage-based. Hobby $5/mo (acts as a spend cap); Pro $20/seat. Credit card required for Hobby since Mar 2026. Had an 8-hour full-platform outage on May 19–20, 2026, when Google Cloud wrongly suspended its account. — [techsy.io](https://techsy.io/en/blog/railway-vs-render-vs-fly-io), [devopsboys](https://devopsboys.com/blog/render-vs-railway-vs-fly-io-paas-2026)
- Fly.io: billed per VM-second plus egress ($0.02/GB in NA/EU). Volume snapshot fees ($0.08/GB/mo) added in Jan 2026, and inter-region private network charges in Feb 2026. Postgres is not fully managed. — [sota.io](https://sota.io/blog/railway-vs-render-vs-fly-pricing-2026), [findstack](https://findstack.com/resources/railway-vs-render-vs-fly-io)
- Estimated cost of a small Node API plus Postgres: about $5/mo on Railway and $2–4 on Fly. One estimate puts Fly cheapest at scale (about $200/mo). — [findstack](https://findstack.com/resources/railway-vs-render-vs-fly-io)

### Inferences
- The Railway outage argues for keeping Postgres backups off-platform (nightly `pg_dump` to S3 or R2) whichever host is chosen.
- Preview environments plus a seeded staging DB with Twilio test credentials let Claude Code web sessions verify PRs end-to-end without touching production.

### Gaps
- Vercel and Cloudflare 2026 pricing: not found in searches.
- AWS (App Runner, ECS, RDS) cost comparison: not researched.

## 6. Operating the agent business: Managed Agents, observability, errors, uptime

### Takeaway
At launch, call the Claude API directly from the Node service. Macoma's SMS turns are short request/response loops, so Managed Agents' $0.08 per session-hour mainly pays off for long, tool-heavy background jobs, such as a nightly per-customer task. Use Langfuse (self-host or the $29 Core plan) for traces and evals, Sentry or PostHog for errors, and Better Stack's free tier for uptime, a status page and phone alerts.

### Cited Findings
- Managed Agents: $0.08 per active session-hour plus tokens. Idle time is not billed. No batch or fast-mode discounts. — [Claude pricing](https://claude.com/pricing), [TrueFoundry](https://www.truefoundry.com/blog/claude-managed-agents-pricing)
- Langfuse: free Hobby; Core $29/mo; Pro $199; Enterprise $2,499. MIT-licensed self-hosting. Braintrust: free tier with 1M trace spans per month; Pro $249/mo. Helicone: free Hobby; Pro $79; Team $799, and one review says it is in maintenance mode (3rd-party). — [Langfuse](https://langfuse.com/resources/engineering/best-braintrustdata-alternatives.md), [PromptLayer](https://blog.promptlayer.com/braintrust-alternatives-the-best-prompt-management-platforms-in-m2026/), [costbench](https://costbench.com/compare/helicone-vs-langfuse/)
- Better Stack free tier: 10 uptime monitors, 3 GB logs (3-day retention), 100K exceptions/mo, 5K session replays, 1 status page, 1 responder. — [agentdeals](https://agentdeals.dev/vendor/betterstack)
- Sentry Developer (free): 5,000 errors/mo, 1 user, 50 replays, 30-day retention. — [ssojet](https://ssojet.com/blog/best-sentry-alternatives-error-tracking)
- PostHog free tier: 1M analytics events, 5K session replays and 100K errors per month, then usage-based. — [braindetox](https://braindetox.kr/en/posts/free_saas_monitoring_sentry_posthog_2026.html), [PostHog vs Sentry](https://posthog.com/blog/posthog-vs-sentry)

### Inferences
- Eval loop (estimate):
  - Log every SMS turn to Langfuse with user/business IDs hashed.
  - Keep a golden set of about 200 real (redacted) conversations.
  - A weekly routine runs the eval set against the current prompt and model and posts a diff to a GitHub issue.
  - Prompt or model changes merge only if evals don't regress.
- Use the Better Stack responder for on-call alerts (phone call or push). Alert on: the Twilio webhook endpoint being down, the Stripe webhook failure rate, and Claude API error rate or latency.

### Gaps
- Official Langfuse, Sentry and Better Stack pricing pages and Instatus pricing: not fetched.
- Official Managed Agents docs on scheduled deployments: not fetched.

## 7. Back office

### Takeaway
Incorporate with Stripe Atlas ($500) and bill with Stripe Billing. Use PostHog for analytics, Resend for transactional email, and a light support inbox (Help Scout free tier or Plain), with Intercom Fin only once ticket volume justifies $0.99 per resolution. Defer Vanta or Drata (about $7.5K–20K/yr) until an enterprise customer asks for SOC 2. Budget for Twilio A2P 10DLC registration from day one.

### Cited Findings
- Stripe Atlas: about $500 one-time, including Delaware filing and expedited processing, plus Stripe credits and partner perks (3rd-party). Clerky: about $799–819 for the lifetime package, plus the $89 Delaware fee. — [Rho](https://www.rho.co/blog/stripe-atlas-review), [flowjam](https://www.flowjam.com/blog/clerky-review-2026-complete-guide-pricing-alternatives)
- Vanta and Drata are quote-only. Vanta median about $20K/yr (Vendr data), with $7.5K–12K estimated for a small startup. Drata Core floor about $12K in 2026, and frameworks such as ISO 27001 cost about $5K extra. — [SpendHound](https://www.spendhound.com/marketplace/vanta-pricing), [knowlee](https://www.knowlee.ai/blog/tools/drata-pricing-2026), [costbench](https://www.costbench.com/compare/drata-vs-vanta/)
- Intercom Fin: $0.99 per resolution, 50-outcome monthly minimum. Seats $29 / $85 / $132 per agent per month on annual billing (sources conflict). A customer who simply stops replying counts as a "resolution". Help Scout: free up to 5 users, then from $25/user. — [dragapp](https://dragapp.com/blog/intercom-pricing/), [gleap](https://www.gleap.io/blog/intercom-fin-ai-pricing-2026)
- Twilio A2P 10DLC:
  - Brand registration: $4.50 one-time for Sole Proprietor or Low Volume Standard; $46 for a Standard brand with secondary vetting. These are TCR fees raised on Aug 1, 2025 and passed through at cost.
  - Campaign vetting: about $15 per use case.
  - Monthly campaign fees: about $1.50–10.
  - Carrier surcharges: about $0.003–0.005 per segment on top of Twilio's base rate.
  - — [Twilio support](https://support.twilio.com/hc/en-us/articles/1260803965530), [usagepricing](https://www.usagepricing.com/blueprint/activity/twilio-2025-08-01-price-change), [calilio](https://www.calilio.com/blogs/10dlc-pricing)

### Inferences
- Macoma's own support channel could be Macoma itself (an SMS support line answered by Claude, with escalation to the founder). That dogfoods the product and avoids Fin fees early.
- Accounting (estimate): QuickBooks Online or Xero plus a bookkeeping service (Pilot, or Bench alternatives such as Kick or Digits) at about $0–300/mo before revenue. Not verified this session.

### Gaps
- Resend, PostHog paid tiers, Plain, QuickBooks, Pilot, CRM (Attio, HubSpot free) and legal templates (Clerky docs, Termly/iubenda for privacy and TCPA consent language): not priced this session.
- Twilio's base US SMS price per segment: not confirmed.

## 8. Marketing and growth with agents

### Takeaway
Agents do the production work: drafts, SEO/AEO pages, short-form video variants, outreach lists. The founder keeps the voice and approves everything. For a product aimed at small business owners, the highest-leverage loop is product-led: every SMS Macoma sends on a customer's behalf can carry an opt-in referral path. This section is mostly inference.

### Cited Findings
- Veo 3.1 supports native 9:16 vertical with audio, which suits Reels, Shorts and TikTok. — [rangy](https://rangy.ai/blog/veo-vs-kling-vs-runway)
- The session's Sanity `seo-aeo-best-practices` skill covers JSON-LD, sitemaps and AI-answer (AEO) readiness as an agent workflow (environment skill list; no external source).

### Inferences
- A weekly content routine:
  1. A Claude routine pulls anonymized usage themes from PostHog and Langfuse.
  2. It drafts one comparison or how-to page plus three social scripts.
  3. Claude Code renders demo clips with Remotion.
  4. The founder approves, then publishes.
- Referral: Stripe coupons plus a referral code per business; PostHog to measure the K-factor.
- TCPA and CTIA rules mean marketing SMS needs explicit opt-in. Never let a growth agent send outbound SMS campaigns on its own.

### Gaps
- No credible 2025–2026 founder write-ups were fetched on agent-driven growth results. Treat this section as hypothesis.

## 9. Guardrails, repo structure, operating cadence and budget

### Takeaway
Agents write code and open PRs. Humans merge, deploy to production, touch money and touch secrets. Enforce this with deny rules, hooks, branch rulesets and separate credentials, not just instructions in CLAUDE.md.

### Cited Findings
- Deny rules block in every permission mode. `dontAsk` auto-denies anything that would prompt and suits CI. Protected paths are never auto-approved. A PreToolUse hook can approve calls but cannot override protected-path protection. Managed settings can disable auto and bypass modes. — [Claude Code docs: permission modes](https://code.claude.com/docs/en/permission-modes)
- Claude Code Review spend can be capped org-wide in admin settings. — [Claude Code docs](https://code.claude.com/docs/en/code-review-costs.md)

### Inferences
**Never autonomous**
- Production DB writes or migrations.
- Stripe live-mode keys, refunds or price changes.
- Sending real SMS outside test numbers.
- Rotating or reading secrets.
- DNS or registrar changes.
- Merging to `main` without a green CI run and human approval.
- Deleting data or buckets.
- Granting OAuth scopes.

**Suggested repo layout**
- `CLAUDE.md`: under about 200 lines. Covers architecture, commands (`npm test`, `npm run typecheck`), conventions, and "never" rules mirrored in settings.
- `.claude/settings.json`:
  - Deny `Bash(psql*prod*)`, `Bash(stripe * --live*)`, `Read(.env*)`, `Bash(fly secrets*)`, `Bash(git push --force*)`.
  - Allow test and lint commands.
  - `defaultMode: plan` or `acceptEdits`.
- `.claude/hooks/`:
  - A PreToolUse hook that blocks any command containing production connection strings.
  - A PostToolUse hook that runs prettier and tsc on edited files.
  - A Stop hook that runs tests.
- `.claude/skills/`: `twilio-webhook`, `stripe-billing-change`, `db-migration` (writes migration plus rollback, never applies it), `release-notes`.
- `.claude/agents/`: subagents for `security-reviewer` and `test-writer`.
- Branch ruleset plus required checks on GitHub.

**Weekly cadence (estimate)**
- Mon: triage issues and Langfuse failures; label "agent-ok" issues for cloud sessions or routines.
- Daily: review agent PRs morning and evening; ship to staging, then promote to production by hand.
- Wed: eval run plus a prompt or model review.
- Thu: content and growth batch.
- Fri: dependency and security PRs, a cost review (Anthropic console, Twilio, hosting), and a backup restore test monthly.

**Monthly tool budget (all estimates, excluding Claude API and Twilio usage, which scale with users)**
- Pre-launch, about $150–250/mo:
  - Claude Max $100
  - Render or Railway $10–30
  - Figma or Kling optional $0–20
  - Free tiers of Sentry, PostHog, Better Stack, Langfuse and CodeRabbit
  - Domain and email about $10
  - One-time costs: Atlas $500, 10DLC about $50–65
- About 1k users, about $400–900/mo in tools:
  - Claude Max or Team
  - Langfuse Core $29
  - Hosting plus Postgres $50–150
  - Better Stack or Sentry paid tier $30–100
  - Help Scout or Plain $25–50
  - Bookkeeping $100–300
  - GitHub Secret Protection and Code Security $49 if the repo is private
  - Claude API tokens: about 1k users × 100 SMS turns/mo × about 3K tokens, roughly 300M tokens/mo. That is about $100–600 depending on model mix and caching (Haiku vs Sonnet).
- About 100k users, about $5K–15K/mo in tools:
  - Team plan seats
  - Vanta about $1.5K/mo
  - Langfuse Pro or self-hosted
  - Hosting $500–2K
  - Intercom Fin or Plain
  - Model and Twilio costs then dominate. Tens of thousands of dollars per month in usage is likely; model it per customer.

### Gaps
- No primary source was found for solo-founder cost benchmarks at these stages. All budget figures are estimates.
- The official hooks reference and skills docs were not fetched this session. Hook examples are based on documented capabilities in the permission-modes page.

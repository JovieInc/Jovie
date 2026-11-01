<!-- Generated from canon/sources-of-truth.json by scripts/sources-of-truth.mjs --write. Do not edit. -->

# Sources of truth

Every fact has ONE owner. Before adding a fact, find its domain here. Never copy a value into another file: import it, generate it, or read it from the owner. canon/SOURCES_OF_TRUTH.md is rendered from this file (node scripts/sources-of-truth.mjs --write).

Machine-readable map: [`sources-of-truth.json`](./sources-of-truth.json). Rule for agents: [`.claude/rules/source-of-truth.md`](../.claude/rules/source-of-truth.md).

| Fact domain | Owner kind | One owner | Derived surfaces | Live authority checked against |
|---|---|---|---|---|
| Models and prices per access path | file | `ops/registry/capacity.json` | `canon/CAPACITY.md`<br>`scripts/backlog-orchestrator/config/model-registry.json`<br>`canon/virtual-models.json`<br>`apps/web/lib/constants/ai-models.ts` | provider model lists (checked by the model-registry-sync worker, not here) |
| Plans, prices, offers | file | `apps/web/lib/config/plan-prices.ts` | `apps/web/lib/billing/offer-truth.ts`<br>`apps/web/lib/config/pricing.ts`<br>`apps/web/data/marketingPricingPlans.ts`<br>`apps/web/lib/entitlements/registry.ts`<br>`apps/web/app/api/stripe/pricing-options/route.ts`<br>`apps/docs/app/docs/plans-pricing/page.mdx`<br>`apps/web/content/legal/terms.md` | Stripe prices |
| Stripe price ids | external | Stripe (mirror: `apps/web/lib/stripe/price-ids.ts`) | `apps/web/lib/stripe/price-contract.ts`<br>`apps/web/lib/stripe/price-id-mapping.ts`<br>`apps/web/scripts/check-stripe-price-ids.mjs` | Stripe prices |
| Entitlements and plan limits | file | `apps/web/lib/entitlements/registry.ts` | `apps/web/lib/entitlements/server.ts`<br>`apps/web/lib/rate-limit/config.ts`<br>`apps/web/data/marketingPricingPlans.ts` | - |
| Feature flags | file | `apps/web/lib/flags/registry.ts` | `apps/web/lib/flags/code-flags.ts`<br>`apps/web/lib/db/schema/feature-flags.ts` | - |
| Rate limits and API budgets | file | `apps/web/lib/rate-limit/config.ts` (moves to #23531) | `apps/web/lib/auth/rate-limit-rules.ts`<br>`packages/api-client/providers.json` | - |
| Which provider serves which model call (Gateway vs Workers AI) | file | `apps/web/lib/ai/routing.json` | `apps/web/lib/ai/routing.ts`<br>`apps/web/lib/ai/sdk.ts` | (Summer mirror: apps/summer/PROVIDER_FALLBACK.md in summer-config) AI Gateway /v1/report, Cloudflare Workers AI analytics, relay /health and Vercel env flags, proven by scripts/ai-routing-check.mjs |
| Credentials and spend | file | `ops/registry/credentials.json` | `ops/registry/spend.json`<br>`.github/preview-env-registry.json` | - |
| Automations (crons, workflows, lanes clocks) | file | `canon/automation-registry.jsonl` | `docs/CRON_REGISTRY.md`<br>`vercel.json`<br>`apps/web/vercel.json` | - |
| Design tokens | file | `apps/web/design/tokens.json` | `design.tokens.json`<br>`canon/DESIGN.md` | - |
| Marketing copy, nav and footer | record | `apps/web/lib/content-records/registry.ts` (moves to #23595) | `apps/web/lib/content-records/marketing-page.ts`<br>`apps/web/data/product-truth/claims.ts` | - |
| Positioning lines per surface (one-liner, what-we-build, deck title, heroes, bios) | file | `canon/positioning-variants.json` | `scripts/positioning/rank.mjs` | live experiment results (content-record experiment funnel, Statsig), recorded in gbrain experiments/* |
| Product claims and proof | file | `apps/web/data/product-truth/claims.ts` | `apps/web/data/product-truth/registry.ts`<br>`apps/web/data/product-truth/claim-digest.gen.json` | - |
| Email streams and sending domains | file | `apps/web/lib/email/stream-registry.json` | `apps/web/lib/email/streams.ts`<br>`apps/web/lib/notifications/sender-policy.ts`<br>`apps/web/lib/inbox/constants.ts`<br>`apps/web/lib/email/legal-footer.ts`<br>`docs/company/email-sending-streams.md` | DNS (SPF, DKIM, DMARC) for the sending domains; Resend domain verification |
| Legal claims (privacy, terms, cookies) | file | `apps/web/content/legal/privacy.md` | `apps/web/content/legal/terms.md`<br>`canon/COMPLIANCE.md`<br>`apps/web/lib/email/legal-footer.ts` | - |
| Retention windows and numeric limits quoted in copy | file | `apps/web/lib/analytics/data-retention.ts` | `apps/web/content/legal/privacy.md`<br>`apps/web/app/api/cron/data-retention/route.ts` | - |
| Linear workflow states | external | Linear (team workflow settings) (mirror: `.claude/rules/linear.md`) | `scripts/lib/linear-issue-intake.mjs`<br>`scripts/lib/linear-sync-on-merge.mjs` | - |
| Agent fleet, identities and ownership | file | `ops/registry/fleet.json` | `canon/agent-identities.json`<br>`canon/ownership.json`<br>`canon/FLEET.md` | - |
| Repository and product boundaries | file | `docs/company/REPOSITORY_SOURCE_CONTRACT.md` | `canon/ownership.json` | - |
| Release channels and rings | file | `packages/release-channel-contracts` | `canon/RELEASE_CHANNELS.md` | - |
| Environment variable names and production build | external | Vercel project env and the production build (mirror: `apps/web/lib/env-server-schema.ts`) | `apps/web/lib/env-public.ts`<br>`apps/web/lib/observability/build-info.ts`<br>`apps/web/app/api/health/build-info/route.ts` | Vercel env names and production build-info |
| Binding invariants | file | `canon/invariants.jsonl` | `scripts/invariants/registry.mjs` | - |
| Engineering wins and the numbers in engineering posts | file | `canon/wins/wins.jsonl` | `apps/web/content/engineering/`<br>`docs/metrics/wins-latest.json` | the measurement source named in each metric, re-run after deploy |
| Public numbers and proof stats (counts, speed, benchmarks, milestones) | file | `apps/web/data/proof-stats/registry.json` | `apps/web/lib/proof-stats/registry.ts`<br>`apps/web/lib/proof-stats/format.ts`<br>`scripts/invariants/stat-claims/check.mjs`<br>`docs/proof/STATS.md` | production database (counts), Public Profile Benchmark receipts (speed, agent score), founder-approved Summer cards (comparative claims) |

- **Models and prices per access path.** Model ids, access paths (subscription, gateway, API) and per-path price. The model-registry-sync worker (branch opus/model-registry-sync) adds scripts/model-id-guard.mjs and its ratchet; this map does not duplicate that guard.
- **Plans, prices, offers.** ARTIST_VISIBILITY_OFFER and PLAN_PRICES. Stripe is the live authority for what is charged.
- **Stripe price ids.** Stripe holds the price objects; price-ids.ts is the only reader of price env vars.
- **Entitlements and plan limits.** Plan features and numeric limits per plan; server gates, usePlanGate, pricing page and rate limits derive from it.
- **Feature flags.** Flag keys and defaults. Runtime overrides live in the feature-flags table and Statsig.
- **Rate limits and API budgets.** Web request limits today. PR #23531 adds the outbound API rate-limit registry and headroom file; when it lands, point this owner at it.
- **Which provider serves which model call (Gateway vs Workers AI).** Per-caller route (workers-first, gateway-first, gateway-only), models, Gateway key and $/day ceiling. Runtime routing reads it; docs, memory and prose must not restate it.
- **Credentials and spend.** Metadata only. Spend caps and runway in ops/registry/spend.json; checked daily by scripts/credentials-spend-check.mjs.
- **Automations (crons, workflows, lanes clocks).** One line per automation; CI fails on a cron with no live entry.
- **Design tokens.** Machine-readable token source; the repo-root export and CSS are generated from it.
- **Marketing copy, nav and footer.** Content records (marketing page specs; site-chrome for header and footer in #23595). The registry file declares the record kinds; the records themselves live in the content-records table.
- **Positioning lines per surface (one-liner, what-we-build, deck title, heroes, bios).** Meaning and message roles stay in canon/POSITIONING.md (founder-locked). This file holds the concrete lines, the competing variants and the active id per surface. It changes only through scripts/positioning/rank.mjs (gates plus persona panel) and live experiments logged in canon/growth-experiments.jsonl. Private consumers (fundraising answers.yaml, deck.yaml) bind with {p:<surface>}.
- **Product claims and proof.** Each public claim names its evidence; copy that states a capability must derive from a claim.
- **Email streams and sending domains.** Every email stream (transactional, lifecycle, founder, broadcast, inbox, cold) bound to provider, sending domain and address, reply-to, required headers, postal footer, consent, suppression, rate limit, approval and deliverability thresholds. The send gateway (apps/web/lib/email/gateway) and the mail rules in scripts/lib/external-api-guard.mjs read it. Cold never runs on jov.ie or the Resend account and is closed until Tim approves a cold path.
- **Legal claims (privacy, terms, cookies).** Privacy policy, terms and cookies in apps/web/content/legal. COMPLIANCE.md is the register of what must be true.
- **Retention windows and numeric limits quoted in copy.** DEFAULT_RETENTION_DAYS and CHAT_RETENTION_DAYS. Privacy policy and pricing copy quote these; they must derive from this owner, not restate it.
- **Linear workflow states.** Linear holds the states; the rule documents which transitions agents make.
- **Agent fleet, identities and ownership.** Which agents exist and how they are reached. Identities in canon/agent-identities.json; who owns what in canon/ownership.json.
- **Repository and product boundaries.** Which code is public, which is private, and where each product lives.
- **Release channels and rings.** Machine-readable channel contract (Stable, Beta, Nightly).
- **Environment variable names and production build.** The schema names every env var the app reads; Vercel holds the values; /api/health/build-info reports the running commit.
- **Binding invariants.** Binding and adopted company invariants; enforcement consumers name the checks.
- **Engineering wins and the numbers in engineering posts.** One record per measured engineering win with before/after, source, query, PRs and post-deploy receipts. Status is computed (scripts/lib/wins-ledger.mjs), never stored.
- **Public numbers and proof stats (counts, speed, benchmarks, milestones).** Definition of every stat: template, rounding, threshold, freshness SLA, fallback, methodology, legal class, visibility. Measured values are the proof-stats/observations content record, written only by apps/web/lib/proof-stats (hourly production refresh and /api/internal/proof-stats intake). Copy binds with {stat:<id>}; scripts/invariants/stat-claims fails hand-written numeric claims.

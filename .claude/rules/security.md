---
paths: ["apps/web/app/api/**", "apps/web/lib/**", "packages/**", ".github/**", "scripts/**"]
---

# Security & Trust Boundaries

CSP, webhooks, secrets, email, fail-closed persistence, biome-ignore, environment variables.

## Public/Webhook Coordination Must Be Durable

- **NEVER** rely on in-memory rate-limit, dedupe, or coordination state for public endpoints, webhooks, or automation triggers.
- Public traffic controls and webhook dedupe MUST use durable storage (Redis, database, or another cross-instance store).
- Cold starts, deploys, and horizontal scale must not reset critical protections or duplicate suppression.

For webhook signature verification: verify before parsing business logic.

## No Unlimited Anything

- **EVERY** user-facing or system-facing capability, quota, rate, or resource (dictation, API calls, tokens, compute, storage, any consumable) MUST have an abuse limit.
- Enforce limits server-side wherever possible; client-side limits are UX only.
- Keep each limit in one configurable setting per capability, never scattered literals.
- Document each limit: capability, value, scope, and behavior when hit. A capability without a documented limit is incomplete.

## Server-Side External HTTP Must Be Bounded

- **ALWAYS** use a shared timeout + retry wrapper for server-side external HTTP on request handlers, webhooks, cron jobs, and admin/HUD paths.
- Raw `fetch()` is forbidden on these paths unless the PR explicitly documents why timeout/retry is intentionally omitted.
- Non-critical notifications and observability sinks must not sit on revenue-critical or user-facing success paths without bounded failure handling.

## Persistence-Critical Success Must Fail Closed

- Helpers performing persistence-critical writes must throw on failure; they must not swallow errors and return `undefined`, `null`, or empty-success sentinels.
- User-facing success responses must only be returned after the critical write succeeds.
- If a follow-up side effect is optional, isolate it explicitly so the primary success path stays truthful.

## CSP Domains Must Stay In Sync With Providers

When adding a new DSP, social platform, or any feature that loads external images or media in the browser, update `apps/web/constants/platforms/cdn-domains.ts`:

- Image CDNs → `PLATFORM_CDN_DOMAINS` (governs CSP `img-src` + Next.js `remotePatterns`)
- Audio/video CDNs → `PLATFORM_MEDIA_DOMAINS` (governs CSP `media-src`)

These registries are the **single source of truth** consumed by the CSP builder, Next.js config, and avatar hostname validation. Do **NOT** edit CSP directives in `content-security-policy.ts` directly — add domains to the registry instead.

## Outbound Email Personalization Must Fail Safe

- In cold email, lifecycle email, or claim-invite copy, **NEVER** greet recipients with raw usernames, handles, emoji names, or other guessed merge fields.
- Only use a personalized first-name greeting when the source string clearly looks like a conventional human first-and-last name; if there is real doubt, fall back to a generic opener.
- When fixing one risky personalization path, search sibling email templates that use the same creator/user fields and apply the same guard there.

## Entitlements: Single Source of Truth

Entitlements behavior must stay centralized and predictable. Use these files as the canonical chain:

1. `apps/web/lib/entitlements/registry.ts` — plan matrix (features, limits, marketing metadata)
2. `apps/web/lib/entitlements/server.ts` — per-request user entitlement resolution
3. `apps/web/types/index.ts` — shared contract (`UserPlan`, `UserEntitlements`)

**Required patterns:**

- Always enforce access via `getCurrentUserEntitlements()` in API routes/actions.
- Always derive plan capabilities from `ENTITLEMENT_REGISTRY`; do not duplicate booleans/limits in call-sites.
- Billing outages degrade gracefully to free-tier entitlements (`getCurrentUserEntitlements` never throws). `BillingUnavailableError` is retained for backwards compatibility but is no longer thrown by default.
- Treat admin role as independent from billing status; use role-check-backed `isAdmin`.

**Forbidden patterns:**

- Reading billing rows directly in handlers to decide feature access.
- Recreating entitlement maps in pages/components/tests instead of importing canonical sources.
- Granting paid access based only on a raw `plan` string when canonical booleans/limits exist.

For deeper implementation guidance: `.claude/skills/entitlements.md`.

## No biome-ignore Comments

- **NEVER** add `// biome-ignore` comments to bypass linting.
- Fix the underlying issue instead.
- If truly necessary, discuss with maintainers first.
- For JSON-LD or structured data, prefer plain `<script type="application/ld+json">{...}</script>` children or `safeJsonLdStringify()` from `apps/web/lib/utils/json-ld.ts` instead of `dangerouslySetInnerHTML` plus suppression.

## No Direct middleware.ts Creation

- `middleware.ts` requires careful review.
- Propose changes via PR description, don't create directly.

The `file-protection-check.sh` hook blocks new `middleware.ts` creation.

## Environment Variables

**NEVER** hardcode secrets. Always use environment validation:

```typescript
// CORRECT: Use validated env
import { env } from '@/lib/env';
const apiKey = env.STRIPE_SECRET_KEY;

// WRONG: Direct process.env access
const apiKey = process.env.STRIPE_SECRET_KEY; // No validation!
```

Required variables are defined in `lib/env.ts` with Zod validation.

## Secrets Hygiene

- Use Doppler or the existing secret-management path (see `.claude/rules/environment.md`).
- Do not commit `.env`, local settings, tokens, credentials, screenshots with secrets, or generated secret dumps.
- Do not add secrets to `CLAUDE.md`, `AGENTS.md`, `CODEX.md`, `.claude/`, `.cursor/`, `.codex/`, docs, tests, or fixtures.
- If a secret appears in the repo, stop and report it.

## Dependency Review Blocks Vulnerable or Copyleft Upgrades

Source Validation's Security Evidence job runs `actions/dependency-review-action` at `a1d282b36b6f3519aa1f3fc636f609c47dddb294` (`v5.0.0`) on `pull_request`. The config is `.github/dependency-review-config.yml`.

- Fail the pull request when an added or upgraded dependency has a high or critical vulnerability, or a GPL/AGPL-family license. `fail-on-severity: high` includes critical. `warn-only` stays false.
- The action compares only the pull request's manifest and lockfile diff. It does not rescan the whole tree, and it does not replace the scheduled osv-scanner or Trivy jobs.
- The denylist covers the GPL and AGPL SPDX ids, including the deprecated short forms. LGPL is not on it. Do not drop an id, lower the severity, or remove the step.
- `comment-summary-in-pr` stays `never`. The job token is read-only.

## CI Seeding Guardrail

- In shared CI lanes that audit public routes (`Lighthouse`, `a11y`, public smoke), seed scripts must fail only on required schema.
- Optional fixtures that depend on add-on relations, such as `promo_downloads`, must warn and skip when the relation is missing unless that lane explicitly provisions the schema first.
- Playwright route-audit specs must not resolve manifests or env-dependent surface lists in a way that can crash the module import. Catch resolution failures and surface them through an always-registered test or equivalent explicit failure path; `beforeAll` alone is insufficient if manifest failure can result in zero generated tests.
- Test-bypass health/debug endpoints must fail closed on production deploys. Preview-only bypass logic may exist for CI smoke runs, but `VERCEL_ENV=production` must hard-block access regardless of spoofable headers or bypass flags.

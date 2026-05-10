---
# Machine-readable risk taxonomy. The generator at scripts/audit-test-coverage.ts
# reads this front-matter to produce docs/TEST_COVERAGE_HEATMAP.md.
#
# Schema per surface:
#   id              slug identifier
#   surface         human-readable label
#   glob            file glob (relative to repo root) that defines this surface
#   key_ranges      file:line-line ranges containing the critical-path branches
#   blast_radius    1-5 — what fails if this breaks (5 = revenue/all-users)
#   reversibility   1-5 — how hard to recover (5 = irreversible: charged card, leaked data)
#   visibility      1-5 — user-facing impact (5 = front-and-center UI)
#   target_coverage 0-100 — meaningful coverage target (branch where applicable)
#   target_e2e      integer — number of E2E specs that should touch this
#   owner           github handle
#   last_incident   YYYY-MM-DD or null
#   lessons_ref     anchor in LESSONS.md
#   notes           free text
#   last_reviewed   YYYY-MM-DD — flagged stale after 90 days
schema_version: 1
last_reviewed: 2026-05-10
surfaces:
  - id: stripe-webhooks
    surface: Stripe webhooks
    glob: apps/web/app/api/stripe/webhooks/**
    key_ranges:
      - apps/web/app/api/stripe/webhooks/route.ts:1-250
    blast_radius: 5
    reversibility: 5
    visibility: 3
    target_coverage: 90
    target_e2e: 1
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      Idempotency keyed on stripe_event_id unique constraint.
      Signature verification via stripe.webhooks.constructEvent.
      Every handled event type must have a dedicated branch test.
    last_reviewed: 2026-05-10

  - id: entitlements-registry
    surface: Entitlements registry
    glob: apps/web/lib/entitlements/**
    key_ranges:
      - apps/web/lib/entitlements/registry.ts:1-654
      - apps/web/lib/entitlements/server.ts:1-166
    blast_radius: 5
    reversibility: 4
    visibility: 4
    target_coverage: 95
    target_e2e: 0
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      Single source of truth for plan capabilities. 4 plans × 26 booleans + 5 numeric limits.
      Legacy plan aliases (founding→pro, growth→max) must be covered.
      Already in stryker.config.mjs mutate[]; add a registry.test.ts targeted by Stryker testFiles.
    last_reviewed: 2026-05-10

  # proxy.ts is one 1412-line file. Three logical regions (Clerk routing,
  # investor portal, audience block) share the file, so file-level v8 coverage
  # reports the same number for all three. Until the extraction documented in
  # docs/PROXY_EXTRACTION_CANDIDATES.md ships, track proxy.ts as a single
  # surface. Per-region key_ranges are kept so future per-line tracking can
  # split this row without losing context.
  - id: proxy
    surface: Proxy middleware (auth + investor + audience)
    glob: apps/web/proxy.ts
    key_ranges:
      - apps/web/proxy.ts:97-246
      - apps/web/proxy.ts:249-453
      - apps/web/proxy.ts:1028-1402
    blast_radius: 5
    reversibility: 5
    visibility: 5
    target_coverage: 85
    target_e2e: 2
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      Houses Clerk auth proxy (1028-1402), investor portal token validation
      (249-453), audience block + fingerprint (97-246), and main request
      router (490-856). Per-region coverage requires the extraction plan in
      docs/PROXY_EXTRACTION_CANDIDATES.md. Until then, this surface tracks
      the file as one. Three env Clerk key pairs (dev/stg/prd) must not cross.
    last_reviewed: 2026-05-10

  - id: dev-test-auth-bypass
    surface: Dev test-auth bypass
    glob: apps/web/app/api/dev/test-auth/**
    key_ranges:
      - apps/web/app/api/dev/test-auth/enter/route.ts:1-200
      - apps/web/app/api/dev/test-auth/session/route.ts:1-200
      - apps/web/lib/auth/test-mode.ts:1-100
    blast_radius: 5
    reversibility: 5
    visibility: 2
    target_coverage: 90
    target_e2e: 0
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      MUST fail closed in production. Test:
      - VERCEL_ENV=production → 404 on every endpoint
      - NODE_ENV=production → 404
      - Spoofable headers (x-vercel-env) → 404 regardless
      - persona param accepts only allowlist
    last_reviewed: 2026-05-10

  - id: api-routes-contract
    surface: API route schema contracts
    glob: apps/web/app/api/**/route.ts
    key_ranges: []
    blast_radius: 3
    reversibility: 3
    visibility: 4
    target_coverage: 80
    target_e2e: 0
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      Every route must validate input with zod and return a typed response.
      Parametric contract sweep test asserts: auth check, parse failure shape,
      success shape. Excludes /cron, /webhooks, /dev (covered separately).
    last_reviewed: 2026-05-10

  - id: webhook-signatures
    surface: Webhook signature verification
    glob: apps/web/app/api/webhooks/**
    key_ranges: []
    blast_radius: 4
    reversibility: 4
    visibility: 1
    target_coverage: 85
    target_e2e: 0
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      Covers: linear, resend, resend-inbound, sentry, sms, stripe-connect, stripe-tips.
      Plus stripe at apps/web/app/api/stripe/webhooks (separate row, higher priority).
      Test: missing-signature, invalid-signature, replay (timestamp out of window),
      valid signature with malformed body.
    last_reviewed: 2026-05-10

  - id: public-profile-isr
    surface: Public profile ISR rendering
    glob: apps/web/app/[username]/**
    key_ranges: []
    blast_radius: 4
    reversibility: 2
    visibility: 5
    target_coverage: 75
    target_e2e: 3
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      1h revalidate with cache-tag invalidation. SSR/ISR rendering must not
      crash on minimal/maximal profile shapes. Visual regression already covers
      public/[username] light/dark/mobile in tests/e2e/visual-regression.spec.ts.
    last_reviewed: 2026-05-10

  - id: claim-onboarding
    surface: Onboarding & profile claim flow
    glob: apps/web/app/onboarding/**
    key_ranges:
      - apps/web/app/claim/[token]/route.ts:1-200
      - apps/web/app/api/onboarding/intake/route.ts:1-200
    blast_radius: 4
    reversibility: 3
    visibility: 5
    target_coverage: 75
    target_e2e: 2
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      Includes profile claim race condition handling. Plan assignment correctness
      at onboarding completion. Already has e2e/onboarding.spec.ts as golden path.
      Source: apps/web/app/onboarding/** + apps/web/app/claim/** + apps/web/app/api/onboarding/**.
    last_reviewed: 2026-05-10

  - id: marketing-static
    surface: Marketing pages (must be fully static)
    glob: apps/web/app/(marketing)/**
    key_ranges: []
    blast_radius: 2
    reversibility: 1
    visibility: 5
    target_coverage: 30
    target_e2e: 4
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      All pages must export revalidate=false. No headers()/cookies()/fetch no-store.
      Pricing accuracy: rendered numbers must match lib/entitlements/registry
      via shared fixture import (no duplicate price tables).
      Primarily covered by visual regression and a static-export lint check.
    last_reviewed: 2026-05-10

  - id: rls-access-control
    surface: Postgres RLS policies
    glob: apps/web/lib/db/schema/**
    key_ranges: []
    blast_radius: 5
    reversibility: 5
    visibility: 3
    target_coverage: 80
    target_e2e: 0
    owner: '@itstimwhite'
    last_incident: null
    lessons_ref: null
    notes: >-
      Integration test at apps/web/tests/integration/rls-access-control.test.ts
      currently describe.skip'd. Must run against a non-BYPASSRLS role on a real
      Neon ephemeral branch. Covers owner-read, owner-write, cross-user denial.
    last_reviewed: 2026-05-10
---

# Test Risk Register

> **Question this answers:** "Which surfaces in the codebase carry the highest blast radius if they break, and what coverage do they require?"
>
> This file is the **input taxonomy** for the risk-based testing strategy. The auto-generated heatmap at [`TEST_COVERAGE_HEATMAP.md`](TEST_COVERAGE_HEATMAP.md) joins these rows with measured coverage to produce a prioritized action list.

## Scoring

Each surface has three dimensions (1-5):

- **Blast radius** — what fails downstream. 5 = revenue or all paying users.
- **Reversibility** — how hard to recover. 5 = irreversible (charged card, leaked data).
- **Visibility** — user-facing impact. 5 = front-and-center UI.

The heatmap generator computes a numeric priority score and joins it with measured `coverage_pct` and `mutation_score` from `apps/web/coverage/coverage-final.json` and `apps/web/reports/stryker-incremental.json`.

## Active Surfaces

| Surface | Glob | Blast | Rev | Vis | Target Cov | Target E2E |
|---------|------|-------|-----|-----|------------|------------|
| Stripe webhooks | `apps/web/app/api/stripe/webhooks/**` | 5 | 5 | 3 | 90% | 1 |
| Entitlements registry | `apps/web/lib/entitlements/**` | 5 | 4 | 4 | 95% | 0 |
| Proxy middleware (auth + investor + audience) | `apps/web/proxy.ts` | 5 | 5 | 5 | 85% | 2 |
| Dev test-auth bypass | `apps/web/app/api/dev/test-auth/**` | 5 | 5 | 2 | 90% | 0 |
| API route contracts | `apps/web/app/api/**/route.ts` | 3 | 3 | 4 | 80% | 0 |
| Webhook signatures | `apps/web/app/api/webhooks/**` | 4 | 4 | 1 | 85% | 0 |
| Public profile ISR | `apps/web/app/[username]/**` | 4 | 2 | 5 | 75% | 3 |
| Onboarding & claim | `apps/web/app/(onboarding)/**` | 4 | 3 | 5 | 75% | 2 |
| Marketing (static) | `apps/web/app/(marketing)/**` | 2 | 1 | 5 | 30% | 4 |
| RLS access control | `apps/web/lib/db/schema/**` | 5 | 5 | 3 | 80% | 0 |

## Maintenance

This file is **hand-curated** — the surface taxonomy is product judgment, not derivable from code.

- Owners review their rows quarterly. The `last_reviewed` field flags rows >90 days old in the heatmap.
- When a surface is sunset, **delete the row** rather than letting it rot. The generator emits a `Stale risk rows` section flagging globs that match zero files.
- When a new high-risk surface ships, add a row in the same PR. The generator emits an `Unmapped high-churn files` section flagging files with significant 90-day churn that don't match any glob.

## Related Docs

- [`TEST_COVERAGE_HEATMAP.md`](TEST_COVERAGE_HEATMAP.md) — computed view of this register + coverage data
- [`TESTING_GUIDELINES.md`](TESTING_GUIDELINES.md) — testing principles and PR review checklist
- [`SCHEMA_MAP.md`](SCHEMA_MAP.md) — DB tables referenced from `rls-access-control`
- [`API_ROUTE_MAP.md`](API_ROUTE_MAP.md) — API endpoints referenced from `api-routes-contract`
- [`CRON_REGISTRY.md`](CRON_REGISTRY.md) — includes the nightly `test-coverage-audit` cron
- [`../LESSONS.md`](../LESSONS.md) — postmortem-derived risk surfaces referenced via `lessons_ref` field

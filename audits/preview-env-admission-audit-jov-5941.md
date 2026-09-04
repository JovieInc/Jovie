# Preview / Ephemeral Environment Admission Audit — JOV-5941

Date: 2026-09-03 · Issue: [JOV-5941](https://linear.app/jovie/issue/JOV-5941/lock-hosted-previews-and-ephemeral-databases-as-explicit-expiring) · Branch: `fallback/JOV-5941-fix`

## Policy under audit

The normal development path is local/CI proof → `main` → current staging. A PR must not automatically create a hosted Vercel preview or a Neon branch. Hosted isolation exists only as an explicit, expiring exception admitted by the `requires_preview` risk policy or by manual dispatch, carrying the `jovie-preview-env-admission/v1` contract and a `jovie-preview-env-cleanup/v1` teardown receipt.

## Creation-path inventory (post-change)

| Path | Automatic on PR? | Admission |
|---|---|---|
| Vercel Git integration (all 4 `vercel.json` projects) | **No** — `ignoreCommand` builds only `main`/`production` refs; every other ref skips | n/a (never a preview) |
| `ci.yml` job `neon-db` | No — `workflow_dispatch` only | Admission receipt emitted per run (2h Neon TTL) |
| `ci.yml` job `ci-pr-vercel-preview` | No — manual dispatch with `run_preview_deploy=true` | Admission receipt pinned to exact dispatched SHA (24h TTL) |
| `ci.yml` fallback Neon creators (`ci-lighthouse-dashboard-pr`, `ci-golden-path`, `ci-admin-smoke`) | No — `workflow_dispatch` only | Registry-bound, 2h Neon TTL |
| `e2e-full-matrix.yml`, `nightly-tests.yml`, `visual-regression.yml` | No — weekly/nightly/daily cron | Registry-bound as `scheduled-evidence`, 2h Neon TTL |
| `production-release.yml`, `eve-pilot.yml` | No — release/shadow lanes | Standing surfaces (staging/production/shadow), not exceptions |

Machine enforcement: `scripts/lib/__tests__/preview-env-contract.test.mjs` scans every workflow for creation primitives (`neon-create-branch-with-retry`, `neonctl branches create`, `vercel-prebuilt-deploy.sh`, `vercel deploy`) and fails if any site is not covered by `.github/preview-env-registry.json` with a complete admission binding; it also fails if any `vercel.json` lets a non-`main`/`production` ref build.

## Representative PR classes

Classification source: `.github/ci-harness/manifest.json` `riskRules` via `scripts/lib/ci-harness.mjs` (`requiresPreview` per rule).

| PR class | Example paths | Risk rule match | `requiresPreview` | Hosted isolation created? |
|---|---|---|---|---|
| Docs-only | `docs/**`, `*.md` | none | no | **Zero previews, zero ephemeral DBs.** No workflow job fires; Vercel Git integration skips the ref. |
| Copy-only | marketing copy in static pages | none (or `public-ui` if in `apps/web/app/(marketing)`) | no / signal-only | **Zero.** `requiresPreview` is a routing signal that admits manual dispatch; it never starts a lane. |
| Ordinary low-risk UI | `apps/web/components/**` | `public-ui` (medium) | yes (signal) | **Zero automatic.** A preview may be *admitted* via manual dispatch when review evidence needs it; the admission receipt records work ID, SHA, owner, TTL. |
| API-write | `apps/web/app/api/**` (non-billing) | none high-risk unless auth/billing | no | Zero automatic; manual dispatch only with admission receipt. |
| Migration | `drizzle/migrations/**` | `db-migrations` (high) | yes (signal) | Zero automatic. Database-affecting proof uses the dispatched `neon-db` lane → isolated branch + admission receipt + 2h TTL. |
| Auth | `apps/web/lib/auth/**` | `auth-identity` (high) | yes (signal) | Zero automatic; manual golden-path/admin-smoke dispatch with admission receipt. |
| Infrastructure | `.github/workflows/**` | `ci-workflows` (high) | yes (signal) | Zero automatic; the machine guard blocks any *new* creation site lacking the contract. |

**Finding:** after this change, no PR class creates hosted isolation from a source-PR event. `requires_preview` admits; manual dispatch or the scheduled evidence lanes create — always with the contract.

## Lifecycle proof obligations

- **Terminal event cleanup:** `pull_request: closed` fires `neon-ephemeral-branch-cleanup.yml` (deletes matching branches) and `vercel-preview-cleanup.yml` (cancels queued/building + deletes preview deployments for the closed ref). Both emit `jovie-preview-env-cleanup/v1` receipts; both are idempotent (already-deleted/absent resources are tolerated) and skip safely on fork PRs without secrets.
- **Dropped cleanup event:** the daily `neon-scheduled-cleanup.yml` heartbeat (plus the fail-closed orphan proof in `scripts/ci/neon-orphan-reaper.mjs`, which only deletes branches whose owning workflow run is completed) reconciles missed events exactly once — deletion of an already-deleted branch is a no-op, so no duplicate mutation. TTL (`expires_in_hours: 2` on Neon branches; 24h admission TTL on previews) is the backstop, never the primary mechanism.
- **Orphan visibility:** the Ovie HUD `/hud` "Env exceptions" section (`apps/web/lib/hud/env-exceptions.server.ts` + `HudEnvExceptionsPanel`) renders active exceptions with owner, age, cost budget, evidence purpose, and cleanup state; expired-but-not-cleaned and orphaned entries render as blockers naming the owner and cleanup action.
- **Evidence validity:** expired or unknown environments never count as certification evidence (`isLivePreviewEnvAdmission` fails closed; HUD rows expose `countsAsEvidence: false`).
- **Data boundary:** ephemeral Neon branches are empty isolated databases created from the project schema — no staging or production data is copied into an isolated environment by any lane.

## Optimization-contract exception (JOV-5941)

This issue is release-infrastructure/policy work with no product surface, variant, or user-facing outcome. The optimization contract (stable variant identity, exposure, outcome, attribution, eligible context dimensions, hypothesis/primary metric, guardrails, privacy/consent, optimizer owner/cadence, decision writeback, rollback) is **declared not applicable**: there is nothing to expose or optimize. The measurable proxies are operational and enforced by gates rather than experiments: zero automatic preview/branch creation (machine guard), 100% admission-receipt coverage on admitted lanes (contract validation), and orphan count trending to zero (heartbeat reconciliation + HUD blockers). Rollback is the revert of this branch (restores `turbo-ignore`-gated Git-integration previews and removes the receipt steps).

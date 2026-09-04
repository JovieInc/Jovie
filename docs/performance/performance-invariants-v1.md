# Performance invariants (contract)

JOV-5888 (parent JOV-5887). The standing performance invariant pack lives in GBrain at
`jovie/coordination/performance-invariants-v1`. This file is the repo-side contract: it names
the authoritative sources, the rules that bind repo edits, and known holes. It invents no
numbers — budgets live in the sources below and in the GBrain page, not here.

## Sources of truth (ranked)

| # | File | Owns | Enforcement today |
|---|------|------|-------------------|
| 1 | `apps/web/scripts/performance-route-manifest.ts` | Route budgets (FCP/LCP/CLS/TTFB, `interactive-shell-ready`, `warm-shell-response`, `skeleton-to-content`, `usable-alias-result`) and resource budgets in transferSize KB | `performance-budgets-guard.ts` in `production-release.yml` — warning-only |
| 2 | `apps/web/.lighthouserc.json` | Production Lighthouse for `/` and `/tim` | production-controller / postdeploy — perf assertions warn; only accessibility ≥ 0.9 errors |
| 3 | `apps/web/.lighthouserc.{dashboard,onboarding,admin,chat,public-launch,pr}.json` | Per-surface Lighthouse thresholds (error level) | `ci.yml` `ci-lighthouse-*` jobs — `workflow_dispatch` only |
| 4 | `apps/web/scripts/performance-interaction-manifest.ts` | Interaction latency / dropped frames (jank) classes | `perf:interactions` — manual |
| 5 | `docs/performance/route-budgets.json`, `apps/web/scripts/compare-chunks.ts` | Aspirational initial-JS gzip targets | Unwired; `bundle-baseline.json` is empty. Targets, never gates |

Rows 1–4 fail surfaces; row 5 numbers are citable targets only. Where two live sources
disagree, the stricter number governs and the file is named in the audit report.

## Rules binding repo edits

1. A perf gate that only warns is red on a certified surface — flip existing assertions to
   blocking in place; never add a parallel tool.
2. Unknown is red: no measurement in 7 days on a certified surface is a FAIL.
3. Budgets move one way: raising a row 1–3 number needs founder approval and a Linear ID in
   the file's note; lowering is free.
4. Weight budgets are transfer (compressed) bytes, per `performance-budgets-guard.ts`.
5. INP is measured (`apps/web/lib/monitoring/web-vitals.ts`), not budgeted, until a repo
   file names an INP budget.

## Known holes (recorded 2026-09-03, JOV-5888 verification pass)

- `apps/web/performance-budgets.config.js` is a stale, unreferenced legacy copy of the route
  manifest (e.g. `/app/chat` LCP 2500 vs manifest 3000). Never cite it for a budget.
- `test:lighthouse:admin:pr` (`apps/web/package.json`) navigates `/app/ov/*` URLs, but
  `.lighthouserc.admin.pr.json` asserts on `/app/admin/(growth|creators|users|releases)` and
  no `/app/ov` routes exist — the admin Lighthouse assertions never bind.
- `docs/launch/LAUNCH_GATES.md` names the dashboard/onboarding Lighthouse jobs "Lighthouse
  (dashboard PR)" / "Lighthouse (onboarding PR)"; the current job display names are
  "Lighthouse (dashboard manual)" / "Lighthouse (onboarding manual)".

Fixes for these holes are separate flips, one PR per file, per the enforcement path in the
GBrain page. This contract file intentionally changes no product or CI behavior.

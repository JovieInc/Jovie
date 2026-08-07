# GH-15576 Investigation — Production Controller manual recovery for df3af0f

**Status:** Investigation complete; production already recovered via successor SHA `4c47adc`. This investigation performs **no production mutation**. Incident SHA `df3af0f` was **never promoted** (staged hard gate fail-closed).  
**Profile:** `JOVIE_AGENT_PROFILE=coder`  
**Worktree:** `codex/gh-15576-production-controller-manual-recovery-required-f-2026-08-07T05-52-12-851z`  
**Date:** 2026-08-07

## Issue
- https://github.com/JovieInc/Jovie/issues/15576
- Labels: bug, ops, area:ops, infra, P0, ci, incident, needs:human
- Body: Automatic recovery failed closed (`controller_completed_without_marker`). Inspect exact controller evidence before any manual rerun or production mutation: https://github.com/JovieInc/Jovie/actions/runs/31077924180

## Controller evidence (failed generation)
- Run: https://github.com/JovieInc/Jovie/actions/runs/31077924180
- SHA: `df3af0faa8f2e1e92f8547728d7cc0a77613d900`
  - Commit: `fix(profile): keep drawer open across background data churn (JOV-4848) (#15575)`
- Source CI: 31077827437 attempt 1
- Staging deploy / migrate / canary: **success**
- Build and stage production deployment: **success**
  - Staged deployment ID: `dpl_4ZJC6eP3Wwy9N2Zyv7XHRFmyaiQW` (present in Production Verified env; promote never ran)
- Failed step: `Prove canonical navigation budgets on exact staged build`
  - Six-route browser budgets (creator nav): **warning-only** (`::warning::Canonical six-route browser budgets failed`)
  - Public-profile alias usable-result on **immutable staged** deployment: **hard FAIL**
    - Route: `public-profile-listen` → `/dualipa/listen`
    - `PASS usable-alias-result: 671.6ms / 1000.0ms` (median)
    - `FAIL usable-alias-result-max: 2216.4ms / 1500.0ms` (sample 2/5 spike; other samples ~649–679ms)
    - Samples: 671.6 / **2216.4** / 679.6 / 649.3 / 649.5 ms
    - Other public-profile routes (music, subscribe, tip, releases, tour): measured clean in the same step (no max FAIL in summary; listen was the hard stop)
- Promote to production: **skipped** (correct fail-closed — no partial alias mutation)
- Sentry / OAuth / public-profile alias post-promote gate / rollback: **skipped**
- Production release result: **failure**
- Production Verified: **failure** → no generation marker
  - Finalization error: `Release generation lacks exact passing gate, canonical deployment, or SHA evidence.`
- Incident class: `controller_completed_without_marker`

## Live state (investigation probes, 2026-08-07T05:55:56Z)
```
main HEAD:                  af6ea008fdc3ee0a37f02bda4a60f46c5038eeed
jov.ie/api/version:         {"buildId":"4c47adc"}
staging.jov.ie/api/version: {"buildId":"af6ea00"}
jov.ie/api/health:          {"status":"ok"}
```

**buildId provenance:** production `4c47adc` maps to full SHA `4c47adce9b9d01d8c68832db604299e1160c767d` (PR #15589 — post-promote alias gate warning-only).

**Ancestry (no-rerun proof):** `git merge-base --is-ancestor df3af0faa8f2e1e92f8547728d7cc0a77613d900 origin/main` → true. Incident SHA is a historical ancestor of current main; re-running its controller generation would re-enter the sole `production-mutation` lease for a superseded commit that never promoted.

Production serves the durable successor SHA `4c47adc`, not the incident SHA `df3af0f`. Staging may lead on docs-only main HEAD (`af6ea00` from #15591). Recovery for the marker gap is **already complete** via successor Production Verified on `4c47adc` — no re-promote of `df3af0f` is required.

## Durable posture already on main
- Issue #15586 / PR #15589 (`4c47adce9b9`): post-promote jov.ie alias gate is **warning-only** (cold-cache max noise)
- **Staged** immutable public-profile budget gate remains **hard** (intentional; this incident failed that hard gate before promote)
- Successor controller success: https://github.com/JovieInc/Jovie/actions/runs/31146704103
  - head: `4c47adce9b9d01d8c68832db604299e1160c767d`
  - Production release result: **success**
  - Production Verified: **success**
- In-flight controller for current main docs HEAD: https://github.com/JovieInc/Jovie/actions/runs/31151149419 (`af6ea008fdc…`, in progress at investigation time)
- Sister investigation patterns: #15583 → #15591 (docs), #15585 → #15590 (docs)

## Root-cause class
Same cold-cache / single-sample max spike family as #15585/#15583/#15586, but **earlier in the pipeline**:
- #15585/#15583 failed the **post-promote** alias gate after a successful promote
- #15576 failed the **pre-promote staged hard** public-profile max budget, so promote correctly never ran

No residual product bug in the df3af0f change set for this incident. The controller failed closed as designed.

## Recovery path
- Do **not** re-run controller for `df3af0f` (`needs:human`; sole production lease; re-mutation unsafe and unnecessary)
- Stale SHA is an ancestor of current main; production already advanced past it with verified marker evidence on `4c47adc`
- Close #15576 when this investigation lands (marker already exists for a later generation; no human promote needed for df3af0f)

## Subagent verdicts
| Agent | Verdict |
|---|---|
| security | **SAFE** — docs-only; does not enter `production-mutation` lease; no secrets |
| review | **APPROVE** — investigation-only close; no residual code fix for this issue |
| testing | **PASS** — deploy-workflow contract tests lock warning-only post-promote + hard staged gates |

## Agent actions
- gbrain org-chart + production-controller ownership query (no exclusive claim conflict; Gem owns CI/control plane; this is investigation-only)
- Full failed-run job graph + staged performance-gate log extraction
- Live version/health probes on jov.ie + staging.jov.ie
- Confirmed ancestry of incident SHA under current main
- Confirmed successor Production Verified success for `4c47adc`
- **No** production mutation from this investigation (incident SHA never promoted; no re-run; no secrets; no product-code change)

## Verification
```text
pnpm --filter web exec vitest run tests/unit/ci/deploy-workflow.test.ts
# Test Files  1 passed (1)
# Tests  98 passed (98)
# Duration  8.78s
```

Confirms warning-only post-promote alias gate + hard staged public-profile gate contracts remain locked by tests.

# GH-15583 Investigation — Production Controller manual recovery for 09b87bc

**Status:** Investigation complete; durable fix already on main. No production mutation.  
**Profile:** `JOVIE_AGENT_PROFILE=coder`  
**Worktree:** `codex/gh-15583-production-controller-manual-recovery-required-f-2026-08-07T05-06-59-726z`  
**Date:** 2026-08-07

## Issue
- https://github.com/JovieInc/Jovie/issues/15583
- Labels: bug, ops, area:ops, infra, P0, ci, incident, needs:human, codex-in-progress
- Body: Automatic recovery failed closed (`controller_completed_without_marker`). Inspect exact controller evidence before any manual rerun or production mutation: https://github.com/JovieInc/Jovie/actions/runs/31087134709

## Controller evidence (failed generation)
- Run: https://github.com/JovieInc/Jovie/actions/runs/31087134709
- SHA: `09b87bc500b2470188565cc19c91eddd74b34cfe`
- Promote: **success** (`dpl_JBDCkJsBU68SB29HM8MXE9Kd4zWY`)
- Failed gate: `Production public-profile alias usable-result gate`
  - `FAIL usable-alias-result-max: 1588.9ms / 1500.0ms` on `/dualipa/listen`
  - Median usable-alias-result **709.6ms PASS** (budget 1000ms)
  - Other routes (music, subscribe, tip, releases, tour): all PASS
- Sentry / OAuth: success
- Rollback: skipped (performance gate is not a confirmed structural regression)
- Production release result / Production Verified: failure → no generation marker
- Incident class: `controller_completed_without_marker`

## Live state (investigation probes, 2026-08-07T05:19:00Z)
```
main HEAD: c25d2cdb2bbaf067fe182460d945c6001638d613
jov.ie/api/version:         {"buildId":"4c47adc"}
staging.jov.ie/api/version: {"buildId":"c25d2cd"}
jov.ie/api/health:          {"status":"ok"}
```

**buildId provenance:** production `4c47adc` maps to full SHA `4c47adce9b9d01d8c68832db604299e1160c767d` (PR #15589 — post-promote alias gate warning-only).

**Ancestry (no-rerun proof):** `git merge-base --is-ancestor 09b87bc500b2470188565cc19c91eddd74b34cfe origin/main` → true. Incident SHA is a historical ancestor of current main; re-running its controller generation would re-enter the sole `production-mutation` lease for a superseded commit.

Production serves the durable-fix SHA `4c47adc`, not the incident SHA `09b87bc`. Staging may lead on docs-only main HEAD (`c25d2cd` from #15590). Recovery for the marker gap is **already complete** via successor Production Verified on `4c47adc` — no re-promote of `09b87bc` is required.

## Durable fix already shipped
- Issue #15586 (closed) — same root cause (post-promote jov.ie alias max budget cold-cache noise)
- PR #15589 merged as `4c47adce9b9` — post-promote alias gate is **warning-only**
- Staged immutable public-profile budget gate remains **hard**
- Successor controller success: https://github.com/JovieInc/Jovie/actions/runs/31146704103
  - head: `4c47adce9b9d01d8c68832db604299e1160c767d`
  - Production public-profile alias usable-result gate: **success**
  - Production release result: **success**
  - Production Verified: **success**
- Sister investigation for the next flaky generation: #15585 → PR #15590 (docs)

## Recovery path
- Do **not** re-run controller for `09b87bc` (`needs:human`; sole production lease; re-mutation unsafe and unnecessary)
- Stale SHA is an ancestor of current main; production has already advanced past it with verified marker evidence on `4c47adc`
- Close #15583 when this investigation lands (marker already exists for a later generation; no human promote needed for 09b87bc)

## Subagent verdicts
| Agent | Verdict |
|---|---|
| security | **SAFE** — docs-only; does not enter `production-mutation` lease; no secrets |
| review | **APPROVE** — same class as #15585/#15586; no residual release bug for this PR |
| testing | **PASS** — 98/98 deploy-workflow tests; warning-only jov.ie + hard staged contracts locked |

## Agent actions
- gbrain org-chart + production-controller ownership query (no exclusive claim conflict)
- Full failed-run job graph + alias-gate log extraction
- Live version/health probes on jov.ie + staging.jov.ie
- Confirmed warning-only contract on main (`production-release.yml` JOV-4854)
- Confirmed successor Production Verified success for `4c47adc`
- **No** production mutation, re-run, secrets, or product-code change

## Verification
```text
pnpm --filter web exec vitest run tests/unit/ci/deploy-workflow.test.ts
# Test Files  1 passed (1)
# Tests  98 passed (98)
# Duration  7.09s
```

Confirms warning-only post-promote alias gate + hard staged public-profile gate contracts remain locked by tests.

## Subagent results (session)
- security: SAFE (no production mutation / secrets / re-run)
- review: APPROVE investigation-only close; note staging may lead on docs HEAD
- testing: PASS 98/98 (subagent 5.62s; parent 7.09s)

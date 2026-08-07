# GH-15585 Investigation — Production Controller manual recovery for 1e2699c

**Status:** BLOCKED on human/ops publish path for issue comment; no code PR (durable fix already on main).  
**Profile:** `JOVIE_AGENT_PROFILE=coder`  
**Worktree:** `codex/gh-15585-production-controller-manual-recovery-required-f-2026-08-07T04-36-55-456z`  
**Date:** 2026-08-07

## Issue
- https://github.com/JovieInc/Jovie/issues/15585
- Labels: bug, ops, area:ops, infra, P0, ci, incident, needs:human, codex-in-progress
- Body: Automatic recovery failed closed (`controller_completed_without_marker`). Inspect exact controller evidence before any manual rerun or production mutation: https://github.com/JovieInc/Jovie/actions/runs/31102479742

## Controller evidence (failed generation)
- Run: https://github.com/JovieInc/Jovie/actions/runs/31102479742
- SHA: `1e2699c789c288acbe89796e8174e18fde05e2ec`
- Promote: **success** (`dpl_BovPudQE7LEocoGCkyySrcTyhFTW`)
- Failed gate: `Production public-profile alias usable-result gate`
  - `FAIL usable-alias-result-max: 1667.7ms / 1500.0ms` on `/dualipa/listen`
  - Median 747.2ms PASS; other routes PASS
- Sentry / OAuth: success
- Rollback: skipped
- Production Verified: failure → no generation marker

## Live state (investigation)
```
main HEAD: 4c47adce9b9d01d8c68832db604299e1160c767d
jov.ie/api/version:       {"buildId":"1e2699c"}
staging.jov.ie/api/version: {"buildId":"4c47adc"}
jov.ie/api/health:        {"status":"ok"}
```

## Durable fix already shipped
- Issue #15586 (closed) — same root cause
- PR #15589 merged as `4c47adce9b9` — post-promote alias gate warning-only
- Staged immutable public-profile budget gate remains hard
- `release-result` requires job success, not `performance_status=passed`

## Recovery path
- Do **not** re-run controller for `1e2699c` (needs:human; sole production lease; re-mutation unsafe)
- Wait for current-main controller: https://github.com/JovieInc/Jovie/actions/runs/31146704103
- Close #15585 when Production Verified succeeds for current main (or human records marker evidence)

## Subagent verdicts
| Agent | Verdict |
|---|---|
| security | SAFE comment-only; no production mutation |
| review | Approve disposition; no residual release-result/warn bug |
| testing | cancelled by host permission prompt; parent re-ran deploy-workflow tests |

## Agent actions
- gbrain org-chart + production-controller ownership query
- Full failed-run job graph + logs
- Live version/health probes
- Confirmed warning-only contract on main
- **No** production mutation, re-run, secrets, or duplicate code PR

## Verification (parent coder)
```text
pnpm --filter web exec vitest run tests/unit/ci/deploy-workflow.test.ts
# Test Files  1 passed (1)
# Tests  98 passed (98)
# Duration  6.82s
```

Confirms warning-only post-promote alias gate + hard staged public-profile gate contracts remain locked by tests.

## Publish path
GitHub issue comment + label mutation were blocked by host auto-mode (external publish). Artifact retained at `.context/gh-15585-investigation.md` for handoff. Durable code fix already on main via #15589 — no product PR opened.

Fixes #15576

## Summary
Investigation-only close for Production Controller manual recovery on SHA `df3af0f`.

**Incident run:** https://github.com/JovieInc/Jovie/actions/runs/31077924180  
**Class:** `controller_completed_without_marker`  
**Root cause:** **pre-promote staged hard** public-profile usable-result **max** budget miss on `/dualipa/listen` (`2216.4ms / 1500ms`) on immutable staged deployment `dpl_4ZJC6eP3Wwy9N2Zyv7XHRFmyaiQW`. Median usable-alias-result **PASS** (671.6ms). Sample 2/5 was the sole spike; other samples ~649–679ms. Promote **never ran** (fail-closed). Six-route creator browser budgets were warning-only in the same step.

**Not the same failure surface as #15583/#15585:** those failed the **post-promote** jov.ie alias gate after a successful promote. This generation failed the **staged hard** gate before promote.

**Durable posture already on main:** #15589 / `4c47adce9b9` makes the post-promote jov.ie alias gate **warning-only** (JOV-4854); staged immutable gate remains hard (intentional).

**Successor proof:** https://github.com/JovieInc/Jovie/actions/runs/31146704103 — Production Verified **success** on `4c47adc`.

**Live probes (2026-08-07T05:55:56Z):**
- `jov.ie/api/version` → `{"buildId":"4c47adc"}` (= `4c47adce9b9d01d8c68832db604299e1160c767d`)
- `staging.jov.ie/api/version` → `{"buildId":"af6ea00"}` (docs-only HEAD may lead)
- `jov.ie/api/health` → `{"status":"ok"}`

**Ancestry (no-rerun proof):** `git merge-base --is-ancestor df3af0faa8f2e1e92f8547728d7cc0a77613d900 origin/main` → true.

**Disposition:** Do **not** re-run controller for superseded SHA `df3af0f` (`needs:human`; sole production lease; promote never ran for this SHA). Artifact: `.context/gh-15576-investigation.md`.

Sister pattern: #15583 → #15591, #15585 → #15590 (docs).

## Risk
- Docs/investigation only — no workflow, release, auth, billing, or production mutation.
- No re-run of Production Controller for the stale generation.
- This investigation performs no production mutation; incident SHA was never promoted.

## Verification
```text
pnpm --filter web exec vitest run tests/unit/ci/deploy-workflow.test.ts
# Test Files  1 passed (1)
# Tests  98 passed (98)
# Duration  8.78s
```

Subagent testing: 98/98 (~8.7s). Confirms warning-only post-promote alias gate + hard staged public-profile gate.

### Subagents
| Agent | Verdict |
|---|---|
| security | SAFE — docs-only; does not enter production-mutation lease |
| review | APPROVE — investigation-only close; staged-hard vs post-promote-warning distinction correct |
| testing | PASS — 98/98 deploy-workflow contract tests |

### CodeRabbit (local)
- Pre-commit review: 1 minor finding addressed (scope “no production mutation” to the investigation; state incident SHA was never promoted).

## Cost Impact
- None (markdown investigation only).

## Bug-to-Test
- bug-to-test: waived — investigation-only; durable post-promote warning-only fix and regression tests already landed in #15589 / `deploy-workflow.test.ts`. Staged hard gate remains intentional policy.

<!-- agent-run-artifact
{
  "id": "hermes-codex-github-15576",
  "source": "hermes",
  "sourceRunId": "github-15576",
  "kind": "workflow",
  "status": "review",
  "title": "Production controller investigation for #15576 (df3af0f)",
  "summary": "Documented exact controller evidence for controller_completed_without_marker on df3af0f. Pre-promote staged hard public-profile max miss; promote skipped. Durable successor Production Verified on 4c47adc. No production mutation. Host auto-mode blocked gh pr create; branch pushed for finisher.",
  "modelRoute": "escalation/grok-4.5",
  "allowedActions": ["open_pr"],
  "forbiddenActions": ["merge", "deploy", "mutate_production_data", "change_auth", "change_billing", "change_security", "rerun_production_controller"],
  "humanApprovalRequired": false,
  "humanGate": {
    "required": false,
    "status": "not_required",
    "reason": "Docs-only investigation; needs:human satisfied by explicit no-mutation disposition (incident SHA never promoted)",
    "reviewer": null,
    "reviewedAt": null
  },
  "linearIssueId": "JOV-4849",
  "linearIssueUrl": "https://linear.app/jovie/issue/JOV-4849",
  "pullRequestUrl": null,
  "adminSurface": null,
  "verificationGates": [
    {
      "name": "gstack.qa.exhaustive",
      "required": true,
      "status": "passed",
      "evidenceUrl": null,
      "summary": "Failed-run job graph + staged performance-gate logs + live version/health probes + successor Production Verified proof + ancestry no-rerun proof",
      "checkedAt": "2026-08-07T05:55:56Z"
    },
    {
      "name": "gstack.review",
      "required": true,
      "status": "passed",
      "evidenceUrl": null,
      "summary": "Review subagent APPROVE; security SAFE; CodeRabbit minor finding addressed",
      "checkedAt": "2026-08-07T06:01:00Z"
    },
    {
      "name": "gstack.ship",
      "required": true,
      "status": "blocked",
      "evidenceUrl": null,
      "summary": "Host auto-mode blocked gh pr create and issue comment; branch pushed with investigation commit for finisher",
      "checkedAt": "2026-08-07T06:03:00Z"
    },
    {
      "name": "github.ci",
      "required": true,
      "status": "queued",
      "evidenceUrl": null,
      "summary": "Awaiting PR open",
      "checkedAt": "2026-08-07T06:03:00Z"
    },
    {
      "name": "unit.deploy-workflow",
      "required": true,
      "status": "passed",
      "evidenceUrl": null,
      "summary": "98/98 tests passed in tests/unit/ci/deploy-workflow.test.ts",
      "checkedAt": "2026-08-07T05:56:44Z"
    }
  ],
  "costEstimate": null,
  "blockedReason": "Host auto-mode blocked external GitHub publish (gh pr create, gh issue comment). Branch is pushed; deterministic finisher or human can open PR.",
  "createdAt": "2026-08-07T05:55:56Z",
  "updatedAt": "2026-08-07T06:03:00Z",
  "metadata": {
    "issueNumber": 15576,
    "issueUrl": "https://github.com/JovieInc/Jovie/issues/15576",
    "controllerRun": "https://github.com/JovieInc/Jovie/actions/runs/31077924180",
    "successorRun": "https://github.com/JovieInc/Jovie/actions/runs/31146704103",
    "incidentSha": "df3af0faa8f2e1e92f8547728d7cc0a77613d900",
    "durableFixSha": "4c47adce9b9d01d8c68832db604299e1160c767d",
    "stagedDeploymentId": "dpl_4ZJC6eP3Wwy9N2Zyv7XHRFmyaiQW",
    "investigationPath": ".context/gh-15576-investigation.md",
    "branch": "codex/gh-15576-production-controller-manual-recovery-required-f-2026-08-07T05-52-12-851z",
    "headSha": "3a73eef6716253996cccd5d099f29037528d47cc",
    "prCompareUrl": "https://github.com/JovieInc/Jovie/compare/main...codex/gh-15576-production-controller-manual-recovery-required-f-2026-08-07T05-52-12-851z?expand=1"
  }
}
-->

---
id: 2026-10-02-pr-recovery-stall
status: draft
severity: sev2
detected: 2026-10-02T13:30Z
failure_classes: [non-convergent-control-loop, pre-merge-parity-gap]
incident_issue: JOV-7455
actions: [JOV-7460, JOV-7461, JOV-7462, JOV-7468, JOV-7469]
gbrain: ops/postmortems/2026-10-02-pr-recovery-stall
---

# PR recovery stopped converging under backlog load

Author: Codex PR drain session. Review: pending Summer. Process: [README](README.md).

## Summary

A 112-PR inventory contained 38 generated coverage-report drafts. The green
enrollment sweep repeatedly exceeded GitHub's GraphQL resource limit, and both
enrollment and draft promotion missed completion of the renamed Source
Validation workflow. A separate source-validation selection gap let an unwired
script test enter the queue and fail the combined-head structural gate. Scripts
and web-test type checks were also absent from source admission. Advancing the
changelog archive to October hid an older release link from server-rendered HTML
and blocked subsequent combined builds with an orphan-page regression.

## Impact

| Measure | Value |
| --- | --- |
| Start | Unverified; historical job failures predate this remediation. |
| Time to detect | Historical duration unverified; incident recorded at 13:30 UTC on October 2. |
| Time to own | JOV-7455 opened in the remediation session at 13:30 UTC. |
| Time to repair | Enrollment repair merged at 16:18 UTC; source-admission and report-retirement runtime verification remain open. |
| What was blocked | Automatic admission/promotion and PR backlog convergence; individual source proofs did not guarantee combined-head success. |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| Before 13:22, October 2 | Closed 37 older report-only drafts, retaining #19944; promoted seven reviewed source-green drafts. | GitHub PR closure and ready transitions. |
| 13:22 | Published the enrollment and report-publication repair. | [PR #19958](https://github.com/JovieInc/Jovie/pull/19958). |
| 13:27 | Source Validation rejected two outdated workflow-contract assertions in the repair; corrected before admission. | [Source run 37012682048](https://github.com/JovieInc/Jovie/actions/runs/37012682048). |
| 13:30 | Recorded the incident and later linked three systemic controls. | [JOV-7455](https://linear.app/jovie/issue/JOV-7455). |
| 16:18 | Enrollment/report-lifecycle repair landed through the native queue. | [Combined-head CI 37032224701](https://github.com/JovieInc/Jovie/actions/runs/37032224701), merge `a1b58fc1fe`. |
| 16:31 | Updated completion controller succeeded on main. | [Enrollment 37034520385](https://github.com/JovieInc/Jovie/actions/runs/37034520385), main `811c851cf2`. |

## Root cause

The enrollment roster multiplied label, commit and timeline resolvers across
100 PRs in one GraphQL query. Job 110790213239 reports `Resource limits for
this query exceeded`. Pagination alone did not bound query complexity.

Both existing completion controllers subscribed to CI, Fork PR Gate and PR
Size Guard, while the current source-proof producer is Source Validation.
Successful source proofs therefore did not reliably wake the consumers.

Coverage publication created a new immutable measured-source branch and PR
each run without retiring older generated drafts. In [#19945](https://github.com/JovieInc/Jovie/pull/19945),
`scripts/inbound-loop/inbound-loop.test.mjs` was absent from CI's explicit test
inventory. [Merge-group run 37009989332](https://github.com/JovieInc/Jovie/actions/runs/37009989332)
rejected the unwired file; Source Validation's control commands lacked that
inventory check.

Source admission checked production types but omitted `typecheck:scripts` and
the existing web-test baseline gate. Queue runs rejected #19883's partial
environment fixtures and #19865's script types after source-green admission.
In #19951, the first paginated changelog month moved forward to October;
`/changelog/26.8.1` lost its incoming server-rendered link and SEO certification
reported one new `geo:geo-orphan` regression.

## Contributing causes

Generated reports dominated the roster. Old workflow tests pinned a particular
GraphQL pagination implementation instead of the complete-inventory invariant.
Source-green and combined-head-green are different receipts; blanket retries
would erase the evidence needed to distinguish their failures.

## Failure classes and invariants violated

| Class | Invariant that should hold | Where else this class can occur |
| --- | --- | --- |
| non-convergent-control-loop | Each completion producer wakes its consumers; inventory reads remain bounded; replacement publication retires obsolete generated work. | Enrollment, draft promotion, generated evidence publication. |
| pre-merge-parity-gap | New script tests are wired to real gating entry points before native queue admission. | All scripts and hook test files, CI commands and reachable package scripts. |

## Why detection failed

The previous enrollment test asserted pagination syntax without exercising a
large roster. Publication tests checked successful replacement creation but not
the obsolete-draft lifecycle. The existing test-inventory invariant ran in the
structural lane but was missing from the source control commands.

## Instance fix

Closed 37 superseded report-only drafts while preserving branches and the
newest report. Requested native queue admission for #19224, #19876, #19900,
#19909, #19915, #19917 and #19944. Admission is not a merge receipt.
Repair #19945's source test wiring and rerun its exact-head proofs before
removing its queue-poison fence.

## Systemic controls

Use a fully paginated REST roster and one bounded current-PR GraphQL read per
candidate; enqueue with the live head lease, preserving explicit holds and
rejected-head fences. Subscribe the existing controllers to Source Validation;
keep ready-for-review owned by the existing auto-merge controller.

After successful replacement publication, retire only older unlabelled drafts
with exact generated ownership, one measured-source parent, an ancestor source,
and an entirely report-only paginated diff. Re-read immediately before closure;
preserve divergent sources and writer takeovers. Source control commands also
run the existing script inventory invariant.

Source admission runs production, script and web-test type checks, preserving
their existing baselines. An executable workflow regression injects failure
into each actual command and requires the source gate to reject it. The
changelog hub retains an accessible native disclosure linking every public
release independently of archive pagination; its regression uses the real
orphan auditor. Consolidated on the earlier #19962 repair, which restores links
through the existing archive navigation; closed redundant #19968 while
preserving its branch and validation receipts.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| [JOV-7460](https://linear.app/jovie/issue/JOV-7460) | Bounded enrollment and completion wakes | non-convergent-control-loop | Active on main; backlog convergence still monitored | Original workflow fails the new 113-PR regression; repaired workflow passes. |
| [JOV-7461](https://linear.app/jovie/issue/JOV-7461) | Superseded-report retirement | non-convergent-control-loop | Landed; next real retirement receipt pending | Real Git publication regression fails against the original publisher; repaired publisher and retirement helper pass at 100% lines, branches and functions. |
| [JOV-7462](https://linear.app/jovie/issue/JOV-7462) | Source script inventory | pre-merge-parity-gap | Implemented in #19945 source repair; validation pending | Existing inventory catches the original unwired inbound test; repaired inventory passes. |
| [JOV-7468](https://linear.app/jovie/issue/JOV-7468) | Source script and web-test type checks | pre-merge-parity-gap | Implemented in #19945 source repair; activation pending | Executable workflow regression fails against the original workflow and passes for all three injected typecheck failures. |
| [JOV-7469](https://linear.app/jovie/issue/JOV-7469) | Public release links | pre-merge-parity-gap | Canonical #19962 merged; redundant #19968 closed | #19962 has a real orphan-auditor red/green regression; redundant #19968 passed combined Build + Layout and exact-head coverage in run 37018692906 before closure. |

## Open questions and unverified claims

Hosted controller activation, the next automatic report retirement, and final
combined-head outcomes remain unverified until their actual run receipts exist.
Historical time-to-detect and the full duration of the enrollment stall are
unverified. GBrain is unavailable in this environment; the canonical repository
record is preserved and its mirror remains pending.

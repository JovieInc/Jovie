---
id: 2026-10-21-production-lineage-unknown-supersession
status: draft
severity: sev3
detected: 2026-10-20T23:52Z
repaired: unverified
failure_classes: [green-by-implication, pre-merge-parity-gap]
detectable_before_human: true
detection_gaps: [missing-invariant]
replay_corpus: [scripts/lib/__tests__/release-lineage-gate.test.mjs, scripts/lib/__tests__/production-release-supersession.test.mjs]
founder_rescues: 0
incident_issue: JOV-7674
actions: [JOV-7674]
gbrain: ops/postmortems/2026-10-21-production-lineage-unknown-supersession
---

# Unreadable production ancestry became a successful supersession

Author: Codex, JOV-7674. Review: Summer. Process: [README](README.md).

## Summary

The production controller classified an ancestor of main as diverged and
completed successfully without promoting it. Its lineage gate treated failed,
empty, and unexpected GitHub compare responses as proven divergence. Two later
authorization boundaries also swallowed failed gate processes inside shell
conditionals. This repair distinguishes unknown evidence from a proven rewrite
and propagates the failure through all three controller call sites.

## Impact

| Measure | Value |
| --- | --- |
| Detection | Continuity observation at 2026-10-20 23:52:36 UTC |
| Time to own | In Progress receipt at 23:58:00 UTC |
| Time to repair | Unverified; source repair and local regression evidence only |
| Blocked behavior | Production freshness: three unshipped commits aged 7802 seconds against the existing 7200-second limit |
| Endpoint availability | Jovie and Summer both returned HTTP 200; no endpoint outage observed |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| Earlier October 20 | Risk routing, screenshot accessible names, and non-shippable successor filtering were repaired. All remain present; none was reapplied. | PRs [#22234](https://github.com/JovieInc/Jovie/pull/22234), [#22295](https://github.com/JovieInc/Jovie/pull/22295), [#22303](https://github.com/JovieInc/Jovie/pull/22303) |
| 23:26:17 | Staging generation `436f88344bf61286eed671de061414befdca85d9` was deployed and eligible for production. | [Binding job](https://github.com/JovieInc/Jovie/actions/runs/39514987705/job/118944881871) |
| 23:26:21 | Concurrent main CI logged a 1538-second installation rate-limit hold. | [Main provenance job](https://github.com/JovieInc/Jovie/actions/runs/39514989596/job/118944889204) |
| 23:26:26 | The production lineage gate reported that `436f883` left main's lineage to `b329eef`; the controller succeeded with release and verification skipped. | [Coalescing job](https://github.com/JovieInc/Jovie/actions/runs/39514987705/job/118944964723) |
| 23:52:36 | Continuity reported live `fd94b7fe3cd168cf37d42d1867eb873374de8c93`, main `b329eefae0753b76cb251fa9d6ee97ff103ab301`, oldest unshipped commit at 21:42:34 UTC. | [Continuity run](https://github.com/JovieInc/Jovie/actions/runs/39517770662) |
| 23:58:18 | Independent unchanged observer reproduced production-stale, age 8144 seconds, both endpoints HTTP 200. | Session observation retained in the Linear handoff |
| During diagnosis | GitHub compare for exact `436f883...b329eef` returned ahead=1, behind=0, status=ahead. | Exact API readback retained in the Linear handoff |
| During repair | Five gate regressions and two executable workflow regressions failed on original source; both related suites passed after repair (116 tests). | Regression files in replay corpus |

## Root cause

`release-lineage-gate.sh` suppressed a failed compare with `|| true` and mapped
all statuses except `ahead` to divergence. Unknown evidence therefore authorized
a successful supersession. The exact logged ancestor pair remains on main's
lineage. Installation exhaustion is the likely transport trigger, supported by
the concurrent rate-limit hold; the gate discarded its original error, so the
exact HTTP status of that compare is unverified.

## Contributing causes

The before-authorization and final-authorization callers evaluated the gate
inside `[ "$(...)" != ... ]`. Even a nonzero child with `decision=error` became
a successful yield. The coalescing caller already assigned the result outside
the conditional, so it propagates the repaired gate's nonzero exit unchanged.
The existing predeploy recovery path requires a failed controller and proof
that production never started; a green skip cannot provide that failure signal.

## Failure classes and invariants violated

| Class | Required invariant | Surfaces covered |
| --- | --- | --- |
| green-by-implication | Failed reads cannot certify divergence or successful supersession. | Shared lineage gate and all three Production Controller callers |
| pre-merge-parity-gap | Execute failed external reads through the real shell conditions. | Gate process and both authorization boundaries |

## Why detection failed

The gate test explicitly expected an empty compare to yield. Existing successor
visibility tests correctly rejected unknown evidence but did not apply that
contract to the preceding ancestry read. No test executed a failing gate through
the two authorization conditionals. The continuity guard detected the actual
release lag; its threshold and paging behavior were correct.

## Instance fix and systemic controls

Only successful `ahead`, `behind`, and `diverged` responses classify different
commit identities. Every failed, empty, or unexpected response emits an unknown
lineage receipt and exits nonzero. Both authorization callers now assign the
command result before testing the decision, preserving shell failure propagation.
No release authority, timeout, retry budget, dependency, or freshness limit changes.

## Action items

| Issue | Control | State | Verification |
| --- | --- | --- | --- |
| [JOV-7674](https://linear.app/jovie/issue/JOV-7674) | Reject unknown ancestry and propagate failures through controller authorization. | Source repair; independent landing pending | Five original-defect-failing gate cases, two original-defect-failing workflow cases; 116 related tests pass locally. Hosted qualification and deployed outcome remain unverified. |

## Open questions and unverified claims

The exact failed compare response was discarded by the original gate. The active
main staging rollout is independent of this repair. A later healthy endpoint or
successful staging run does not prove that this change has merged or executed.
The Linear handoff records final source, CI, merge, deployment and runtime evidence
separately. No sustained future production-health claim is made.

**Ship now:** preserve unknown ancestry as a failed, actionable controller result.
**Re-evaluate when:** an exact controller containing this repair repeats the
failure. **Then:** inspect the emitted lookup exit and exact compare evidence
before altering transport or recovery budgets.

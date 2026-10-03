# Scoped throughput repair — corrected boundary packet

Status: native-schema proposal withdrawn; executable edits NOT approved or started.
Source owner: 01a0798e-05cf-7f11-b4fd-30fa582bb24f.
Runtime/review owner: 01a070af-20da-7c33-b1ec-0cf4d5ddd564.
Base: 5aa3f81dc1850fc4b5cc227f79739cd00cb9b701.
Branch: codex/scoped-throughput-repair-issue.
No Linear issue assigned — ad-hoc investigation, not production dispatch authority.

## Correction: native path already admits no-PR Todo

The missing proposed schema is NOT a failing reproduction and does not justify new code.

Live readback:
- Installed workflow /home/timwhite/.local/state/symphony-elixir/five-pr-trial-20260908/WORKFLOW.md, SHA256 4745fc26eb99f6a9f25d350cbbb358148ccdfec143c95c275aabd61b6222ce59.
- Native service ExecStart includes --closure-observe-only. Project/required-label trial scope is separate and must not be broadened by this source slice.
- Installed controller /home/timwhite/.local/bin/.symphony-codex-auth-fallback/releases/.install-kqdqi9h4/symphony-codex-exhausted.py, SHA256 d84be99e85f00400c61ddfcd1721649931c42505e63945253be5ae6c0a8d82c1.
- Its pickup_refuse_reason and pickup_check_command do not consume closureAdmission or workAdmission. A valid Todo/no-PR candidate can pass normal pickup; routing/provider/lease conditions remain independent.
- Workflow line64 says the wrapper holds new dispatch during unhealthy closure, but that is inaccurate for installed observe-only operation. It does not contain an explicit agent instruction to wait on newIssueLeaseAllowed. No actual native issue denied by that field has been identified.

Existing unmodified regression passed:
PYTHONDONTWRITEBYTECODE=1 python3 scripts/symphony/tests/existing-pr-repair.test.py RepairTests.test_pickup_pure_existing_new_and_competing_writer_boundaries -v
Result: 1 test passed; native pickup_check_command returns0 for Todo without an assignment.

## Real enforceable gap: fallback admission

Live gate observedAt 2026-09-09T18:44:56.606616Z has closure reason internally-repairable-prs-open, newIssueIntakeAllowed=false, newIssueLeaseAllowed=false; localAllowed=true but maxConcurrent=0/pushAllowed=false/evidenceAccepted=false. Capacity independently prevents dispatch, so this is NOT proof that removing intake alone restores useful work.

The shipped fallback boundaries have a real independent closure denial:
1. symphony-codex-exhausted.py _launch_fallback_workers checks closure before acquiring a new non-remount issue lease.
2. grok-ship-one rechecks closure + work admission before workspace/provider work.
3. WORKFLOW.jovie-ui-pilot.md instructs an ordinary new issue to obey those fields.
4. The global producer/contract legitimately preserve separate capacity and publication rules.

Two unchanged real subprocess/unit regressions passed:
- FallbackTests.test_closure_stop_line_blocks_new_fallback_before_workspace_or_provider
- FallbackTests.test_launch_mirrors_closure_stop_line_for_new_work_but_not_remount
Command: PYTHONDONTWRITEBYTECODE=1 python3 scripts/symphony/tests/symphony-codex-auth-fallback.test.py <the two selectors> -v.
Result: 2 tests passed in4.966s. Test output explicitly refuses fixture JOV-5003 with closure_stop_line and retains an existing PR remount. These are hermetic fixture IDs, not evidence of a live blocked infrastructure issue.

## Revised proposed before/after — review required

Before: an otherwise valid, explicitly authorized no-PR throughput-repair fallback issue is indistinguishable from ordinary intake; both consumers refuse it during closure drain even if capacity is accepted.
After: both existing fallback admission consumers may recognize ONE exact owner-issued scoped repair assignment while ordinary intake remains false. Invalid/missing scope and all ordinary issues retain current refusal. This is a fallback source scope change, NOT authorization to dispatch or to use a different provider.

Reuse existing private assignment, source-hash, exclusive claim, lease inode/FD9, tracker revision and tombstone checks. Separate issue case from existing-PR repair; preserve all exact PR/head validation. Maximum900seconds (15minutes), one attempt, exact issue/repo/revision/owner/base/prepared workspace and normalized path scope. No label/title exception. Fresh complete PR read plus trusted source-owner reconciliation of merged/unpublished solutions is required; unknown is refusal.

Keep security RED, verified model/provider capacity, repository WIP, push/CI/native queue/restart gates. Do not change global newIssueLeaseAllowed or treat runtimeFloor as capacity. Publication remains unavailable until independent exact-diff review unless an existing enforced path check is bound; path intent alone is not a filesystem sandbox.

An actual live candidate and its authorized route still need identification before claiming end-to-end recovery. If only native work is authorized, there is no demonstrated native admission implementation to make: limit this slice to accurate workflow text and close the unused-schema proposal.

## Files and verification if revised scope is accepted

Minimal producer/validator: existing_pr_repair.py, separate issue case only.
Actual consumers: symphony-codex-exhausted.py and grok-ship-one, plus their real shared-lease and workflow handoffs. Native guard changes only if a demonstrated shared-helper contract requires them; do not add an unused native admission kind.
Tests: extend existing fallback/repair/kernel-lease tests and existing CI selectors, retaining unmodified ordinary-denial tests. First add an assertion for the exact scoped fallback exception that fails at the existing closure check; then implement. Coverage must include both consumers, negative/replay/expired/stale-solution/capacity paths. Existing-PR suite stays green. Under1500 changed lines per PR.
Docs: correct workflow capacity-floor/push claim and distinguish observe-only native wrapper from enforced fallback intake.
No runtime, provider, tracker, service or publication actions by this task.

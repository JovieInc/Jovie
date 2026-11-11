# Cloud account occupancy (JOV-10357)

This continuation depends on the disabled safety draft #24823, frozen at
`94ed49f09ff96d9b690e90fb2acaa522c8e03066`. Its separate branch is
`jov-10357-cloud-account-occupancy`. PR creation remains pending legitimate
Codex WIP capacity. Neither branch authorizes activation, merge, or deployment.

The done-check for this source change is offline: after a submission timeout or
worker restart, another local or cloud run cannot take the reserved account slot;
a task ID cannot authorize publication; only bound worker completion releases
occupancy, once. Unknown outcomes retain custody and never permit fallback.

## Custody and existing owners

The existing Codex account flock serializes slot admission. Before releasing it,
reservation records are flushed to the existing cloud journal. An append-only
pointer on the same flock inode binds its journal and reservation. The pointer is
flushed first, so a failed or missing journal write holds the slot. Local leases
and free-slot reporting read that pointer even if the current journal environment
changes. A cloud reservation refuses journal drift across the configured slots.
No new controller, scheduler, account grant, or quota policy is introduced.

The journal preserves account identity binding, every limiting allowance window,
observation freshness, reservation/submission identities, execution context and
fence, accepted worker identity, and checkpoint provenance. It uses the existing
`execution_attempt` resume and mutation-boundary checks. Freshness and fencing
are rechecked after external compatibility readback and immediately before the
provider submission boundary. Expiration does not release remote occupancy.

Accepted worker readback must bind the task to the exact reservation, account,
environment, submission identity and fence. Completion additionally requires the
same accepted worker to be stopped. Completion never clears authentication,
burst-rate or quota cooldowns. Elapsed reset time never proves replenishment.
The existing provider-wide concurrency/daily/backoff limits remain binding.
`capacity_live` preserves all supported lease windows and projects the tightest
remaining allowance into the existing scalar view.

A successor requires a stopped predecessor, its saved checkpoint or pushed
artifact, a fenced old execution, and a new execution claim. A separate supported
successor-submission adapter receives that provenance. The new task must then
produce accepted ownership bound to the checkpoint digest. This is not transfer
of a running container. Local account rotation continues to use its existing
worktree behavior.

## Activation boundary

No production cloud compatibility, account-bound submission, worker-readback,
or checkpoint adapter is installed here. Their Python interfaces describe
required evidence, not an assertion that the pinned CLI exposes those fields.
The default public route/reconcile entrypoints hold without an adapter. CLI
status/diff/submit and candidate publication are private transport functions;
public publication additionally requires accepted account and execution custody.
Disabled defaults produce no provider calls or writes. Previously recorded
occupancy remains a read-only admission hold when dispatch is disabled.

The offline fixtures use real temporary journals, flock descriptors, execution
attempt records, Git repositories and quarantine operations. Provider evidence
and GitHub publication responses are injected. They do not prove provider API
compatibility or live execution. The exercised account-slot protocol assumes one
shared host state directory; it does not claim cross-host account capacity
coordination or replace the existing execution coordinator.

JOV-10357 retains the remaining integration work: supported per-account
cloud/CLI compatibility and readback, shared host-state deployment qualification,
draft-CI isolation review, and end-to-end runtime proof. Auto-dispatch stays OFF.

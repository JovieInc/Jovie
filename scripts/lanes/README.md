# Symphony: the shipping lanes

This directory is Symphony. One harness, one release, one policy, one test set, one HUD.
Devin, Codex, Claude Code and Hyperagent are the lanes that ship (Claude and Hyperagent since
JOV-7706); grok and kimi stay `enabled: false`. Symphony Elixir on Gem is retired (its units are stopped and masked by
`gem-retire-elixir.sh`); nothing else claims JOV work.

A lane is a provider command in `providers.json` plus a Linear label that expresses a routing
preference. Every JOV Todo issue is eligible (Tim 2026-10-11: no `agent-ready`, plan or
approval label is required): every lane reads one shared all-Todo snapshot per TTL (at most
`TODO_POOL_PAGES` x 100 issues; a larger pool fails closed) and the cost-aware router (below)
decides which lane takes each issue. `hold` is the one stop signal, and it expires: the
reconcile pass removes a `hold` with no issue activity for 72h (with a comment on how to
re-hold). `codex-blocked` only keeps the issue off the codex lane; `no-symphony` no longer
excludes (the claiming agent decides what the issue needs, closing an obsolete one with
`NOT-SHIPPABLE` included); a `reasoning-job` issue belongs to the reason lane only when it
carries Summer's job block; `type:epic` is a decomposition unit (see Epics). Auth, billing and
infra labels route only to the guarded Codex lane. Issue runs get a goal and a definition of done (the issue's own
acceptance section when it has one) instead of a pre-approved plan, may run gstack
`/autoplan` themselves for non-trivial work, and never wait for an approval label.

The harness, not the model, owns:

| Concern | Where |
|---|---|
| Claim (serialised, `flock`), one PR per issue across hosts (GitHub is the truth), priority aging after each 24h wait | `worker()`, `pick_issue()`, `in_flight_issues()` |
| Execution attempts: stable action phases fence boundary replay. The dual-format reader supports immutable candidate ownership and terminal recovery; its incompatible writer remains disabled pending verified reader/writer readiness. Enabled recovery publishes only the reserved winner and seals unknown boundaries without another attempt or grant | `execution_attempt.py` |
| One open PR per issue: branch or `linear-issue-id` marker; an unreadable PR list claims nothing | `in_flight_issues()` |
| No open-PR ceiling (Tim 2026-10-12): new-issue intake is bounded only by real limits in autoscale (compute, credits, quotas); `new_issue_budget()` reports counts, never refuses | `new_issue_budget()` |
| Workstreams: one classifier for intake and backlog (`ws:<key>` label override, else ordered rules); exact normalized-title duplicates admit only the oldest (`duplicate-candidate:<JOV>`); order = explicit Urgent → dispatch-next in the admitted pool → tier (aged or CI/Symphony-throughput) → aged priority → workstream rank → age | `workstreams.py`, `pool_rejections()`, `admission_order()` |
| File-overlap admission: declared paths, then the workstream map, are compared with the cached open-PR inventory and In Progress lane tasks; hot control-plane and duplicate migration-number collisions wait, shared/generated files sequence, other overlaps flag | `file_overlap.py`, `overlap_inventory()` |
| Hotspot admission (JOV-7708): an issue whose predicted touch set (named file paths, else its workstream area; Symphony-throughput = the lanes harness) hits a hotspot an open, non-parked PR holds waits as `hotspot-held:<path>#<pr>`. Hotspots = a static seed (lanes harness, `code-flags.ts`, command/product-truth registries, `node-environment-files.json`, `destructive-red-drift.baseline.json`) plus any file two open PRs touch; an unreadable file list admits ungated | `pool_rejections()`, `hotspot_holds()`, `open_hotspot_holds()` |
| Sweep (every 30 min per lane): retire only explicitly labeled duplicates after live head, hold and queue revalidation; preserve unlabelled stale drafts | `sweep_lane_prs()` |
| Generated-file conflicts: merge main, take its copy, run each file's canonical regenerator (`pnpm install --lockfile-only` for `pnpm-lock.yaml`, `pnpm ci:topology:write` for `.github/workflow-topology.gen.yml`), push; no model, no force-push | `resolve_generated_conflict()`, `remediation.GENERATED_RESOLVERS` |
| Slot locks that die with their holder | `Locked` |
| Worktree from `origin/main`: a pre-installed pool slot when one is ready (`worktreeSource: pool` on the receipt), else fresh; shared-store hardlink install; background refill; afterwards an idle, clean checkout with fresh origin publication proof is recycled into the pool (`verdict: recycled` in `worktree-removals.jsonl`) or removed. Busy, dirty, unpublished or unverified source is preserved with a cleanup receipt; its branch is deleted only after successful checkout retirement | `run_issue()`, `worktree_pool.take()`, `remove_worktree()`, `worktree_pool.recycle()` |
| GBrain context pack in the prompt, plus the repo contract | `context_pack()`, `render_prompt()` |
| Independent verification: diff rules, then the repo's own `pre-push-gate.sh affected`, then the funnel judge on the head's preview when a funnel surface changed (`scripts/funnel-judge/preview-gate.mjs`; no preview or exit 2 holds) | `gate_pr()` |
| Gate seats (`LANES_GATE_SLOTS`, default 2 per host) and streamed gate logs | `gate_slot()`, `sh(stream=True)` |
| Host-local exact-head gate reservation before adoption setup or original verification; claims are never proof | `reserve_gate()`, `claim_adoptable_pr()`, `gate_pr()` |
| Gate timeouts are transient: re-gated by adopt, held only after 3 on one head | `gate_timeouts()` |
| Landing: only a gate-passing PR is marked ready. Lanes never arm auto-merge or enqueue: Merge Queue Green Enroll is the sole queue writer and admits the ready head | `gate_pr()`, `requeue_verified()` |
| Receipts (`runs/ledger.jsonl`) bind Linear issue, provider/account class and lease, worktree/branch, PR/head or terminal failure; per-run log and prompt, Linear handoff comments | `run_issue()`, `codex_lane.record_lease()`, `worker()` |
| Retry to Todo with no backoff; 3 failures park the issue on this host until the next lanes release (no Backlog sink); a provider error returns the issue to Todo and cools the lane only on a measured limit (exit 75); not-shippable goes to Backlog once | `worker()`, `failure_rejection()`, `cool_down()` |
| Fix loop owns every open non-draft PR in the repo (red checks, conflicts, changes requested), reconciles live state before checkout/install/push, 2 attempts per head, then the escalation ladder | `fix_candidates()`, `reconcile_fix_target()`, `red_pr()`, `escalate_exhausted()`, `remediation.py` |
| Event queue: GitHub signals become `lane-fix-<kind>` labels; a worker takes a labeled PR first | `pr_events.py`, `lane-fix-relay.yml` |
| Cheapest lane first: attempt n belongs to the n-th enabled lane in `providers.json` order | `pr_events.may_take()` |
| Ready on green: a CLEAN lane draft gets `gh pr ready` plus its merge intent in one writer action | `pr_events.ready_green()` |
| Disabled-lane drafts: adopted for bounded repair; provider state, issue completion and exhausted attempts never authorize closing unlabelled work | `pr_events.retire_orphan()`, `return_to_pool()` |
| Held and failed records carry `reason` + `next_action`; the status feed publishes `held_by_reason` | `pr_events.held_reason()`, `doctor.status_feed()` |
| Garbage collection of crashed worktrees | `prune_worktrees()` |
| Worktree retirement (JOV-7704): the tick spawns one sweep per hour (10 min under 15% free, and even when disk admission fails) over lanes, Codex, Conductor, Claude-scratch and `jovie-wt-*` checkouts. A checkout retires when its PR closed (1h grace) or after 12h idle; preserved repairs expire on PR close or after 3 days. Live-process paths are never touched; dirty or unpushed work is pushed to `backup/<host>/<name>-<date>` first, else only build output is stripped. Primary clones, bare mirrors, `~/.cache` and the pnpm store are out of scope | `worktree_sweep.py`, `dispatch()` |
| Disk admission on the tick and before installs: critical (at or below 5%) or unknown free space blocks work. Only a worker holding a slot may sweep under 15%, under one host-wide cleanup lock; cleanup preserves the shared pnpm store, unrelated checkouts and cancelled repair source. The same sweep also removes transient `_work` output of runners with no `Runner.Worker` running, retires idle Symphony workspaces on a low filesystem (never through a mount; dirty or unpushed work is pushed to a backup branch first, else only build output goes) and lane logs idle 14 days | `disk_guard.py`, `dispatch()`, `worker()` |
| Adaptive slots (default on, every tick, measured limits only; kill switch `SYMPHONY_AUTOSCALE=0`) | `autoscale.decide()`, `dispatch()` |
| Drain-safe self-update from `origin/main` after the release's own tests pass | `update()` |
| Host upkeep on the same update event (no timers): fetch the bare object mirror the lanes clone borrows from (`objects/info/alternates`, under `<root>/locks/<name>-mirror.lock`) right before update's own fetch, and refresh the codex lanes' `autoreview`/`behavior-validator` skills from `~/agent-skills` only when its `main` moved. Both are bounded, non-fatal, and recorded in `update.json` | `update()` |
| Codex accounts: lease one per run; a burst 429 backs off 2 min and rotates, a spent plan (usage limit / quota) banks until its reset, and only a failed run's closing lines can bank an account | `codex_lane.py` |
| Provider throughput: matched-work offers, accepts, starts, productive/PR/first-pass rates, remediation, issue→PR→merge time, landed output, idle qualified capacity and failure reasons; landed attribution comes from receipts, never a branch prefix | `provider_throughput()`, `doctor.status_feed()`, `hud.py` |
| Company shipping attribution: complete half-open GitHub merge windows join exact repository/PR/head origin receipts; Symphony, external agents, founder sessions and automation remain separate from review/remediation/finalizing roles. Status publishes Jovie and LYB coverage, candidate inference, unknowns and missing-receipt links; an unreadable project is never zero | `shipping_attribution.py`, `merge_evidence.py`, `doctor.status_feed()` |
| Provider failover: a lane that exits non-zero mid-issue (every account spent, auth, crash, HTTP 404, unhealthy) hands the same worktree to the next available qualifying route from the issue risk/cost router, up to 2 handoffs. Sensitive and `codex-blocked` restrictions, the initially admitted capability floor and the chosen model apply to every handoff; quota, cooling, health and host slots remain authoritative. The receipt records `handoffs` (with `reason`) and `finishedBy`. Disabled entries and remote-only lanes (`repairs: false`, Hyperagent) are never chosen | `run_issue()`, `next_provider()`, `remediation.route_issue()`, `lane_availability()` |
| Repository bindings: the one service also routes LogYourBody (Linear `LYB` -> `JovieInc/LogYourBody`, `~/LogYourBody` on Gem, `LANES_REPO_LYB` overrides, `LANES_BINDING_LYB=0` disables). A worker spends its held seat on one LYB repair (red or behind lane PR, 2 tries per head, a per-PR lease so two seats never repair one PR) or one claim (any Todo issue without `hold` or a hard-excluded label; sensitive labels only on the Codex lane; no LYB-specific concurrency cap or open-PR ceiling, only the host's seats) before Jovie intake. Jovie-only holds never block LYB and a binding fault never blocks Jovie. The harness pushes, opens a ready PR (never draft: LYB's native merge queue skips drafts; a repair readies a draft lane PR) and moves the issue to In Review; LYB required checks and its native queue land it. LYB runs iOS only in merge groups, so one failed_checks ejection sends that head to repair with the failed merge-group run's log in the prompt, and a queued PR is never re-enqueued Refusal reasons land in `bindings.json`. LYB remediation events never run in the Jovie repo | `bindings.py`, `routing.json` `bindings`, `worker_with_slot()` |
| Cost-aware routing: one capability floor per issue (`routing.json`), then the cheapest available `(lane, model)` route that clears it by effective cost; every claim is logged with its rationale | `remediation.route_issue()`, `issue_router()`, `runs/routing.jsonl` |
| Guarded sensitive work: auth/billing/infra labels route only to Codex at `xhigh`; 500-line cap, canonical security/boundary gates, and independent `llm-review` run before enrollment | `pick_issue()`, `gate_pr()`, `sensitive_review()` |
| Stop revokes publication: a kill writes `runs/publication-revocations.jsonl` before the kill is acked, and every irreversible boundary (push, PR open, label, enqueue) revalidates it — revoked branches never ship (JOV-5060) | `run_agent(on_kill=)`, `revoke_publication()`, `require_publishable()` |

Execution receipts retain `jovie-execution-attempt/v1`. The default production and CLI
writer still emits legacy numeric status chains; self-update cannot activate the new
wire format. `IMMUTABLE_WRITER_ENABLED` is checked in as false, with no environment or
caller override. The upgraded reader also validates candidate-linked receipts, while
a disabled writer refuses to extend them. Enabling the writer requires a separately
reviewed source change after every participating reader and writer is drained, updated
and verified ready; JOV-8293 remains open for that activation and runtime outcome.
Enabled recovery reserves an existing `failed_unknown` disposition before projecting
an unknown boundary, so helper crashes and repeated retries remain held. Boundary IDs
bind existing dispatch, handoff, repair and adoption phases within the original fence;
duplicate or changed-cost reuse is held, and distinct intended phases charge normally.
Legacy common-source-SHA reservations have no owner proof and remain held for
authoritative reconciliation. Source merge is preparatory and does not repair or
certify the running coordinator.

PR repair selection captures one qualified bulk inventory outside the global claim lock,
using the existing per-key cache lock. Current local preservation and attempt state,
fresh selected-head/foreign-owner checks and atomic charging remain inside. Unknown or
expired initial repair evidence defers before new-issue fallback; remote-only lanes retain
their original path. New-issue and sweep reads, brief effects and selected-owner latency
remain separate lock/continuity work under JOV-8371; this source change does not attest an
installed release or measured live throughput recovery.

Event-driven: a worker that finishes re-execs the current release and pulls the next
issue. The minute timer only restarts idle lanes and applies updates; it never signals a
running worker. Production deploys are a separate track: only a red main stops shipping.

New-issue admission reports three separate counts: raw Todo candidates, candidates
passing the issue predicate, and new issues a lane may claim. There is no open-PR
ceiling (Tim 2026-10-12): the JOV-6833 `slots × 2` and JOV-7514 `slots × 4` caps
are gone, and the claim path makes no PR-count read. Maintenance claims still run first.
HUD labels this count as new issues; it is not total company demand or a claim of
available worker capacity. Slot occupancy, account leases and PR work remain
separate facts. Empty-demand alerts require known zero eligibility and no open
PR maintenance; unknown evidence and backpressure reset the empty timer.

The file-overlap guard never holds a PR (Tim 2026-10-12; hold contract #21275). It records
overlapping open PRs and new issues for the ledger, doctor and HUD, and the merge queue's own
conflict detection serializes PRs. A `hold` the retired enforce mode applied is released on
the next reconcile; `SYMPHONY_FILE_OVERLAP_GUARD=0` turns the recording off and `1`/`enforce`
read as flag. `doctor.json.fileOverlap` publishes active pairs, files and the flag counters.

Account attribution uses the existing status rows without changing account
admission. Lease occupancy and cooldown are independent; an account can be both
leased and in a recorded hold. The existing available flag means eligible under
cooldown policy, not a fresh positive quota reading. An empty unleased-available
list does not mean all quotas are exhausted. Usage-limit, auth, rate and unknown
holds remain distinct, and stale or incomplete rows report unknown.

Manual and independently orchestrated runs can append provenance without gaining
execution authority. After the PR's final head is known, run
`python3 scripts/lanes/shipping_attribution.py record-origin --ledger <state>/runs/ledger.jsonl
--repository <owner/repo> --pr <number> --head-sha <sha> --method <method>
--initiator <human-or-agent> [--provider <provider>] [--model <model>]
[--execution-host <host>] [--run-id <id>] [--linear-issue <KEY-N>] [--evidence-url <url>]`.
The append is fsynced into the canonical ledger. GitHub author, branch name and PR
body remain candidate context only; they never produce verified attribution.
Receipt values can appear in the company status feed: use stable non-secret labels,
never credentials, private paths or personal contact details.

### Non-Symphony publication origins (JOV-8318)

`record-origin` now reads the canonical GitHub repository, PR head and (while open)
live branch ref before appending. A stale head, duplicate or conflicting exact-head
origin fails without changing existing bytes. New heads require new receipts;
neither repair nor review/finalizer receipts rewrite origin history.

The Dependabot metadata-certified producer and atomic pin-sync writer emit after
their final heads are known. Sentry Autofix, Shipping SLO (snapshot and ratchet),
Screenshots (new and updated PR), Production Controller customer notes, Desktop
Release stamps, and both coverage/nightly report publishers use the same
`shipping_origin.py emit-automation` boundary after publication. Sentry records
the evidenced Claude provider, without inventing a model from its routing tier.

Hosted producers retain a data-only `shipping-origin-v1` Actions artifact for 30
days. The existing lanes dispatch tick reads artifacts from both reporting
repositories, checks the GitHub run's repository/workflow/event and trusted source
context, rechecks the live exact head, and fsyncs one `jovie-shipping-origin/v1`
receipt into `runs/ledger.jsonl`. Redelivery is acknowledged without appending.
Invalid data and conflicts appear in `tick.shippingOriginIngest.rejected`;
transport/pagination/deadline failures appear in `errors`, retry next tick and
mark attribution evidence incomplete in the company status feed. Merge counts
remain independent. The collector is bounded to 45 seconds and ten 100-artifact
pages per repository; it never extracts or executes archive content.

Founder-operated ChatGPT, Codex and Claude sessions, and independent Hyperagent,
Grokbot or other agents, use this publication handoff after the last push:

```bash
python3 scripts/shipping_origin.py submit \
  --repository JovieInc/Jovie --pr 123 --head-sha <exact-final-head> \
  --method founder-operated-codex --initiator tim --provider codex \
  --execution-host <non-secret-host-label> --run-id <session-id> \
  --linear-issue JOV-123
```

Choose `founder-operated-chatgpt`, `founder-operated-claude`,
`founder-operated-codex`, `founder-operated-unknown-provider`, `grokbot`,
`independent-agent`, or `independent-hyperagent` from actual commissioning
evidence. Add `--model` only when the run establishes it. Never infer it from
the author, branch or PR text. `--payload-file` accepts the same minimal fields
(`repository`, `pr`, `headSha`, `method`, `initiator`, optional `provider`, `model`,
`executionHost`, `runId`, `linearIssue`); unknown fields and duplicate JSON keys fail.
Both Jovie and LogYourBody are allowed. Founder/independent handoffs require a
Linear issue and Tim's authenticated GitHub dispatch; an independent agent hands
the payload to the existing authorized publisher when it lacks that identity.
This is an origin attestation, not an autonomous-work admission.

The main-only `shipping-origin.yml` workflow accepts that payload as environment
data, reads both repositories with an explicitly read-only App token, and retains
the artifact. It cannot push, review, execute PR code, start implementation or
merge. The App must already be installed on both repositories; missing read
access fails visibly. Host-local publishers may instead use `record-origin` with
the same selected method and metadata.

Ship now: exact-head instrumentation and the existing-tick transport. Re-evaluate
when a fresh deployed daily window contains integrated producer runs. Then attach
the producer run/artifact URLs, receipt IDs and fresh `shippingAttribution` status
report link to JOV-8318, checking increased verified coverage for each producer,
separate review/remediation/finalizer roles and unknown counts for unreadable or
uninstrumented projects. Draft publication and deterministic fixtures do not
establish deployed coverage. JOV-8318 retains this commissioning obligation until
the independent landing/deploy gate produces those runtime receipts.

Transport reference: [GitHub artifact API](https://docs.github.com/en/rest/actions/artifacts).

Gate reservations use kernel locks for the PR number and head SHA. An adopter carries
its reservation through checkout, install, checks and terminal receipt publication;
another contender skips that head without taking a heavy seat or charging an issue
retry. A small gate-command process inherits the reservation and seat, retaining them
across worker death even when command wrappers close inherited descriptors. It reuses
the existing provider process observer to drain observed descendants on completion or
timeout. If cleanup cannot be proven, it retains the locks and logs an operator boundary.
As with the existing observer, a child daemonizing before its first observation cannot
be recovered from process metadata. Lock files must not be unlinked as stale cleanup.

`verified.json` holds atomic terminal gate results under `PR:SHA` keys, bound to the
gate policy digest and sensitive-review mode. Legacy SHA strings were claim markers,
not certification, and are ignored. Failed setup and transient timeouts remain
retryable; legacy held records, active repairs and spent generations retain their
existing dispositions without being converted into certification. A changed or
unreadable remote/local head cannot publish proof. A reused terminal result is reported as
`gate-already-completed`, not another landing.

Every existing publisher (`gate_pr`, event `ready_green`, `requeue_verified` and
repair completion) now converges on `publish_verified`. A successful completed
proof is required before ready; `requeue.json` retries a failed ready. Publication
ends at ready: Merge Queue Green Enroll is the sole queue writer (2026-10-13), so
lanes never arm auto-merge or enqueue a Jovie PR. Repair completion records exact-head
intent and ended-owner provenance for the existing adopter; it does not enqueue
directly or replenish the repair budget. A final successful self-push can receive
its first gate after the owner ends, including the gap before its final ledger
append. Manual branches must already be in the adopter's repair inventory.

The publisher consumes the canonical source-admission policy from its immutable
release through the existing `gh` identity. Revision failure holds, incomplete
reads and queue ejection history remain authoritative. Before readiness, only a
strict draft-only policy refusal permits that transition; after readiness, full
admission is required. Ownership, revocation and exact-head proof are rechecked
after the policy reads. Failed publication retains its intent for governed retry.

Release identity includes the unchanged canonical policy dependency closure as
well as lane source and tests. `.tree` remains the Git tree for `scripts/lanes`;
`.bundle` identifies all packaged objects and `.release.json` records their
pinned source commit. A policy-only change activates a new tested bundle. An old
updater cannot package the new dependencies, so its self-test must refuse without
moving `current`. The first deployment requires a reviewed handoff that excludes
the old updater while the new source's existing update command runs, restores the
prior timer state and retains all running worker releases.

This reservation is host-local. It does not replace the cross-host claim policy or
JOV-5257 admission serialization. During a drain-safe release update, old workers
still run their old code; runtime singleflight is proven only after those workers
and their gate descendants have naturally drained. Never kill or reset their work
to make an activation claim.

## Workstreams and leverage-first admission (JOV-7514, JOV-7423, JOV-7330, JOV-5555)

Every issue belongs to exactly one workstream (`workstreams.py`). An explicit
`ws:<key>` Linear label wins; otherwise the first matching rule (labels, then title)
in classification order; otherwise `general`. Dispatch rank, compounding
infrastructure first:

`ci` → `symphony-throughput` → `release-deploy` → `reliability` → `security-auth` →
`ui-ia` → `native-apps` → `chat-agent` → `ovie-ops` → `profiles-marketing` →
`library-content` → `analytics-gtm` → `docs-changelog` → `lyb` → `memory-gbrain` →
`general` → `human-decision`.

`pick_issue()` and the doctor share `admission_order()`. Current explicit Linear
Urgent ranks before every lower-priority eligible unclaimed candidate, including
aged CI work and `dispatch-next` (Tim, 2026-10-16; JOV-8022/JOV-7073). Only integer
priority 1 is Urgent; missing and malformed priorities cannot acquire that status.
Priority edits take effect on the next claim scan after the canonical Linear mirror
receives them. Installed ingestion and actual claims require separate receipts.

Within each explicit urgency band, an operator-designated `dispatch-next` issue
carrying `agent-ready` is first. Otherwise tier 0 is aged priority 1 or compounding
CI/Symphony throughput; tier 1 is other work. Aged priority, workstream rank and age
break ties. Aging still prevents starvation among non-urgent work. Designation
cannot interrupt active work or bypass repair-first, budget, routing, design,
retry, duplicate, file-overlap or hotspot admission. Todo filtering consumes the
designation when work starts; labels on Backlog do not establish admission.

Duplicate identity is deliberately exact: titles equal after case, punctuation and
conventional `bug:`/`P1:` prefixes are stripped (bracketed tags such as `[web-053]`
are identity). Only the oldest member is admissible; the others are rejected as
`duplicate-candidate:<JOV>` in the worker and counted under `duplicate-candidate` in
the doctor census. Near-duplicates are grouped by workstream, never auto-merged.
Lane reads paginate the Todo pool (up to `LANE_ISSUE_PAGES` × 100).

## Event queue (JOV-6672)

Gem has no inbound webhook, so `.github/workflows/lane-fix-relay.yml` turns each GitHub signal
into a label on the exact PR: CI failure `lane-fix-red`, merge-queue removal `lane-fix-dequeued`,
a push to main that leaves the PR conflicting `lane-fix-conflict`, requested changes or a human
review comment `lane-fix-review`, green CI on a lane draft `lane-fix-green`.
The same relay deletes a stale `lane-fix-red` once that head is required-green
(CLEAN, HAS_HOOKS, or UNSTABLE), using the workflow token that applied the label.
Every worker pass
does one label search and takes a queued PR ahead of the rest of its work. Labels are consumed
on claim, or when the PR's own state no longer backs them. A PR whose attempts are spent keeps
its label, so the PR shows why it is waiting. The dispatch tick handles `green` (ready +
merge intent) and `orphan`. Run the workflow manually once to label the backlog that predates
the relay.

Gaps closed after the first week (no PR may sit unowned):

- A fix attempt that ends without moving the head no longer parks the PR. The same head goes
  to the next lane in cost order; only a running attempt (3h lease) holds it.
- `lane-fix-dequeued` is answered first without a model: the tick asks GitHub to merge main
  into the branch (`update-branch`, exact head, no force), which gives the queue a new head.
  Once per stuck episode; a second removal goes to a model with the merge group's failing log.
- Every 30 minutes the tick reconciles all open PRs in a few GraphQL pages (missed events
  only): DIRTY gets `conflict`, a red rollup gets `red`, a CLEAN lane draft gets `green`, a lane
  draft idle for 48h gets `stale` when it is still eligible. CLEAN/queued observations clear
  only synchronization bookkeeping, never consumed attempts or exhaustion labels. Terminal
  work, explicit holds and active repairs survive stale/supersession retirement and event
  ready/update-branch handlers. A genuine external head needing repair re-enters only after
  the existing fenced claim writes its linked receipt, retained across later attempts.
  An exhausted CLEAN external head without that receipt stays held; observing green is not
  a repair attempt or new authority.
- Age SLOs are per class (JOV-7079): queued/ready PRs live on the merge queue's clock, lane
  drafts on the 48h idle `stale` SLO, and non-lane agent drafts (`codex/…`, `tim/…`, `devin/…`,
  etc.) on a 3-day age SLO once stalled (idle 48h, conflicting, or red). Stalled agent
  drafts are reclaimed (Tim, 2026-10-10): the sweep labels them `lane-fix-stale` (plus
  `conflict`/`red` as applicable), workers finish them with the stale-draft prompt, the
  gate adopts them like lane drafts, and `ready_green` marks a CLEAN one ready with native
  merge intent. `hold:dependency` applies while a named dependency is open; a landed
  dependency releases the draft to the lanes. `hold` and human branches are never reclaimed,
  and nothing here grants authority to discard the branch.
  JOV-INV-011 requires an explicit `duplicate` label before automatic retirement; age and
  exhaustion never close a PR. Parked work is requeued instead (JOV-7708): an agent-owned PR
  carrying `lane-fix-exhausted` or `queue-poison` for more than 48h (measured from the label's
  latest `labeled` event) sends its issue to Todo + `agent-ready` with a rebuild-from-main note,
  unless the issue is done or another open PR carries it. The PR stays open and gets
  `lane-rebuild` (once), which stops it holding the issue in `in_flight_issues()`; label it
  `duplicate` once the rebuild lands. Holds, the merge queue and live repair claims skip it;
  `LANES_PARKED_REQUEUE=0` turns it off (`requeue_parked()`). Every
  close path re-reads the live source head, state, complete labels, fork and queue status;
  revoked authority, holds, head movement and unreadable evidence preserve the PR.
- Every open PR also gets one truthful disposition in `reconcile.json` (`dispositions`,
  oldest first: `advancing`, `queued`, `ready`, `hold:<reason>`, `hold:dependency`,
  `closing`, `repair`, `draft`, `orphaned`), and the doctor raises `aged-prs` for anything open past
  7 days that is still undecided — `hold:*` dispositions are already deliberate parks and
  stay named in `oldest_prs` — so the shipping cockpit always names the oldest open PRs
  and why they are still open.
- Invariant: every open non-draft PR is in the merge queue, carries a `lane-fix-*` label the
  lanes will still act on, or is held with a reason (a hold label, or `lane-fix-exhausted`
  after bug intake). Anything else is listed in `reconcile.json` and raised by the doctor as
  `orphan-prs`, which opens a Triage issue for Summer. Counts are published under `prs`.

Held reason codes (`held.json`): `secret-file`, `fix-exhausted`, `empty-diff`, `diff-too-large`,
`lockfile-without-manifest`, `missing-test`, `gate-check-failed`, `gate-timeout`, `unclassified`.
Green CI overrides only `gate-check-failed` and `gate-timeout`, which are verdicts from the local
gate. The other codes are diff policy or unknown, and the PR stays a draft.

## Epics (`type:epic`)

An epic is a unit of work, not an exclusion (`epics.py`). A lane that claims an epic with no
open child issues runs a planning pass in a detached origin/main checkout: the agent reads the
epic and the repo and ends with a `jovie.epic-plan/v1` JSON block; the harness (never the agent)
files up to 12 children in the epic's team (Todo, parent = the epic, a Goal and a Definition of
done each, no labels), skipping titles that already exist under the epic, verifies each
`issueCreate` readback, comments a summary and leaves the epic In Progress. An epic with open
children is not decomposed: the children carry the work. Remote lanes (hyperagent) never take
epics. The dispatch reconcile pass (`epics.reconcile`, every 15 minutes on
`LANES_RECONCILE_OWNER`, default `gem`) requests parent validation once every child is
terminal and at least one is Done. Child delivery never closes the parent: the canonical
validation lifecycle requires the parent's own current outcome receipt and verified
production build, plus any other required acceptance evidence. Reconcile moves a Todo epic
with open children to In Progress, and
expires stale `hold` labels (one filtered read per kind, no per-issue reads, at most 10 writes
per kind per pass).

## Reason lane (Summer's tier-3 decisions)

Ranking, prioritization and strategy decisions are not made on Summer's flash model. Summer
files a JOV issue labeled `reasoning-job` in Todo, carrying a `summer.reasoning-job/v1` JSON block
(question, decision type, context refs, deadline). Only issues with that block are reason-lane
jobs; a `reasoning-job` issue without one is ordinary work for the build lanes.
Each dispatch tick checks for queued jobs and starts one detached `reason_lane.py drain` per host
(flock `reason.lock`), so a job starts within a minute. Per job:

1. The lane gathers the context itself: `JOV-123` issues, `gbrain:<slug>` pages,
   `linear:open-p0-p1` (open JOV P0/P1 list); URLs are listed, not fetched. Models get no tools.
2. Proposer: `claude -p` on Opus 5.5 (subscription login; `~/.config/jovie-lanes/claude.env` may
   hold `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`), structured JSON, `--max-budget-usd`.
3. Adversarial reviewer, first healthy of: `grok` CLI on grok-4.7 (subscription), then the
   Hyperagent "Grok 4.7 Reviewer" agent (Hyperagent credits, through `~/.local/bin/hyperagent`).
   A 402/quota answer cools that reviewer for 6h.
4. `reconcile()`: high confidence only when a reviewer ran, kept the #1, shares two of the top
   three, did not reject, and the proposer is at or above 0.6. Anything else is low.
5. A comment with a `summer.reasoning-result/v1` block, the GBrain page
   `ops/summer/decisions/<date>-<jov-n>-<slug>`, then Done. That state change is the Linear
   webhook that wakes Summer. A failed job retries once, then goes to Canceled with a `failed` block.

`decisionType: research` (tier 4) runs the Hyperagent research backend instead and posts the memo.
Budgets and models live in `reason.json` (jobs/day, research/day, context cap, per-job spend cap).
Operator: `python3 reason_lane.py run JOV-123` runs one job now.

Recurring business questions run a bounded keyword-first, semantic-fallback GBrain lookup before
any reason/research budget is spent. The result is explicit: applicable precedents, `no sufficiently
applicable precedent`, or a visible retrieval failure that blocks the expensive route. The decision
receipt separates sourced precedent, internal evidence, inference, and new learning, and requires an
explicit answer to what is materially different about Jovie's case.

The same minute tick schedules `yc_corpus.py refresh` at most daily. Each run rotates through at most
40 public YC Library/blog/YouTube records, respects robots, writes metadata plus bounded excerpts into
the existing GBrain store, and content-hash skips unchanged source and derived-playbook pages. Refresh
health is recorded under `ycCorpus` in `tick.json`; it never silently converts an outage into a miss.
A release self-test (`LANES_SELFTEST`) never schedules the refresh, and its default fetch and `gbrain`
helpers refuse to run there; every self-test process carries a per-run `JOVIE_SELFTEST_RUN` marker and
`prove_staging` stops any still running when the tests end (`leftoverProcesses` in the diagnostic).

### Bounded lesson analysis (JOV-8420)

[`runLessonAnalysis`](../lib/lesson-analysis.mjs) consumes a sealed reasoning
WorkOrder after event-driven admission (JOV-8419). It reconstructs the ordered
attempt graph from sanitized, revision-bound development evidence and returns
evidence-linked findings plus `target`, `no-change`, or `held`. It grants no
implementation or promotion authority. JOV-8421 owns compilation.

The existing transport/certification owners supply `environment.routes`,
`routesVersion`, `certify(route)` and `dispatch(call)`. These are trusted owner
adapters, never callbacks or capability claims supplied by a model. `certify`
projects an authenticated current `jovie.certification/v1` receipt: exact route
ID and tuple digest, certified capabilities and risk ceiling, policy version,
evidence reference and expiry. Unavailable routes are omitted by that owner.
This boundary does not mint certificates or maintain another route registry.

The governor's `routeByExpectedCost` selects both actors. Broad, ambiguous,
control-plane, founder-invariant and repeated-escape lessons require certified
`reasoning` + `frontier` capability. The existing generator-family exclusion
policy selects an independent challenger; matching providers or exact models
are also excluded. Both resolutions retain the exact tuple, governor/routes
versions, certification receipt, and canonical WorkResult. The challenger sees
the evidence and proposal, and answers its digest. Its challenge is retained.

`dispatch` receives the sealed child WorkOrder, `toReasoningJob` intake, selected
route, sanitized packet, output JSON schema, AbortSignal and limits. The owner
must honor the exact route/schema/packet and enforce the spend, inference and
zero-tool caps before execution; the legacy ranking lane alone does not satisfy
this contract. It returns `{ result, output, resolvedTuple, usage }`, where
`result` is that exact order's WorkResult and `usage` reports inference calls,
tool calls, inference USD and tool USD. Two calls maximum, one per child order;
the parent deadline and a maximum 15-minute wall limit apply. There is no local
retry/failover. Aborted or unknown expense requires owner reconciliation before
any redispatch under the existing idempotency/lease policy.

Evidence must already be sanitized/authenticated by its source owner. Protected
cases never enter model inputs; unsafe, cross-binding, wrong-revision or
incomplete attempt evidence holds analysis. A causal claim needs an independent
verification link joining a failed attempt to a verified success. Agreement or
a successful retry alone supplies no causal proof. Missing routes, expiration,
timeouts, exhausted limits, unsupported claims or disagreement return `held`
with the original escalation owner/action. Implementation expense is excluded
from the measured analysis expense. Event wiring and live commissioning remain
with JOV-8419 and the JOV-2967 acceptance chain; these fixtures prove source
behavior only.

Ship now: expose this bounded owner boundary. Re-evaluate when admitted live
events supply route/certificate and expense receipts. Then verify those receipts
through the existing parent commissioning chain.

Run the deterministic suite and coverage with installed pinned tools:

```bash
node --import tsx --test --test-isolation=none --experimental-test-coverage --test-coverage-include=scripts/lib/lesson-analysis.mjs scripts/lib/__tests__/lesson-analysis.test.mjs
```

## Nothing fails silently

`doctor.py` runs at the end of every dispatch tick. It judges the tick receipt
(`tick.json`), the ledger, slot locks, Codex accounts, the Linear pool, GitHub quota,
disk and the HUD heartbeat, and writes `doctor.json` (the HUD's NEEDS ATTENTION row).
Each new alert key opens a Linear issue in Triage (label `symphony`, "Symphony doctor:
<key>") so Summer routes it; when the condition clears the issue is commented and moved
to Done; a key that fires again within six hours reopens the same issue. Keys:
`tick-error`, `provider-down:<lane>`, `provider-idle:<lane>`, `codex-all-banked`, `codex-broken`, `linear-down`,
`pool-empty`, `no-landing`, `gate-timeouts`, `failed-runs`, `disk-low`, `disk-critical`,
`github-quota`, `hud-stale`, `orphan-prs`, `aged-prs`, `spawn-exit`.
`provider-idle:<lane>` is urgent: after five continuous minutes with compatible work, a
healthy provider, configured slots, repeated dispatch attempts, and one or more vacant slots,
capacity is being lost. `spawn-exit` fires when workers spawn every tick but no run starts or ends
and no worktree exists; a worker that finishes its claim scan with nothing to do records a
clean exit in `worker-idle.json`, so the alert only means workers are dying before or during
the claim — a clean 'nothing claimable' exit is not a deadlock. `workers-without-completions`
requires both an hour without a terminal run receipt and a current slot lease older than an
hour; unknown legacy lease ages stay degraded, while newly acquired leases do not inherit an
old completion age. `admission-repair-needed`
requires five continuous minutes of known qualified demand blocked by an over-budget or
terminal PR inventory, so the normal transition into existing-PR recovery does not create
another issue. Every alert also produces a generation-deduped
`jovie.control-plane-liveness-condition/v1` receipt in `doctor.json` and the independent
status feed. The receipt carries its owner, affected resources, first observation, source
freshness, ten-minute escalation deadline, recovery result, next action, and terminal
health proof. A new generation wakes Summer once through Linear and reopens JOV-6004 when
that invariant had been closed; unknown Linear/pool state remains degraded evidence in the
status feed even when Linear cannot carry the escalation itself.

## Codex lane

`codex_lane.py run` picks the least-recently-used ChatGPT-authenticated profile under
`~/.codex-accounts/<name>/` (API-key and adapter profiles are ignored), leases it with a
flock, and runs `codex exec --dangerously-bypass-approvals-and-sandbox --ignore-user-config`
in the worktree. Usage-limit, rate-limit and auth messages in codex's output bank the
account until the reset it reports (default 5h). `codex_lane.py status` is the JSON the
HUD and doctor read; `health` exits non-zero when no account is available, which keeps
the lane from dispatching at all.

For an existing supported CLI subscription login, operators can opt in with
`CODEX_LANE_AUTH_MODE=current-login`. This uses the existing `CODEX_HOME` (default
`~/.codex`) and a single `current-login` flock. It asks `codex login status` for
ChatGPT auth without reading credential files or discovering other accounts.
`CODEX_LANE_CLI` may name an already installed executable when the host's PATH
entry is broken; it does not install a CLI. API credentials are removed from the
child environment, execution pins OpenAI plus `forced_login_method="chatgpt"`,
and the supported `--sandbox workspace-write`, `approval_policy="on-request"`,
and `approvals_reviewer="auto_review"` options retain the workspace sandbox and
automatic approval review. The installed CLI need not support the TUI's
`--approve-for-me` shortcut.
An auth or rate/usage limit banks this one login and returns exit 75 to the existing
handoff policy. This mode never rotates profiles, redeems reset credits, or probes
private quota services. Auth status establishes login, not available plan quota.

Enabling the mode and any nonzero `LANES_SLOTS_CODEX` value is a host configuration
change, separate from landing source. Record the activation and rollback plan
before changing the service. Routine repair or reactivation of the established
shipping service uses its standing authority; genuinely new access or spend still
requires its specific authority. Existing issue/PR ownership, file-overlap admission,
slot limits, PR backlog budgets, capability floors, and independent security,
review, queue and production gates still apply. Summer reasoning/notification
failures are ancillary to `dispatch()`; they do not authorize bypassing an intake
or release hold.

Auth, billing, payment, infrastructure, and Vercel labels are admitted only by this lane.
Those runs use maximum reasoning effort, carry the `sensitive-surface` PR label across
hosts, and stay draft until the normal Migration Guard/security/boundary checks plus a
separate max-effort Codex review pass. Secret/credential rotation and live billing pricing
remain excluded; a `codex-blocked` sensitive issue has no lane and waits for its label to change. Other providers retain their sensitive-label
exclusions.

## Routing (JOV-7706)

Each lane's `routes` in `providers.json` give a model, the capability it clears (`bounded` < `standard` < `frontier`), a cost class and a base cost: Devin SWE-2 free 0, Hyperagent GLM 5.3 subsidized 1, Sonnet 5.5 2, Opus 5.5 frontier 3, Codex xhigh frontier 3.5 (headroom for the Codex-only sensitive labels). No route calls a raw model API key. `routing.json` sets the floor: JOV-7343 protected surfaces and orchestration labels are frontier, frozen plans and docs are bounded (a frozen plan on a protected surface stays frontier), the rest is standard.

Effective cost = base x (1 + quota pressure): Claude runs in its 5h window, banked Codex accounts, Hyperagent runs per day. Banked, cooling, unhealthy, saturated, budget-blocked or slotless lanes are unavailable; the next cheapest qualifying route takes the work. Frontier work with no frontier route is held (`route-held:frontier`), never downgraded. `route:<lane>[:<alias>]` or the lane label pins a route that clears the floor. Each claim writes the decision to `runs/routing.jsonl`, the receipt (`route`) and the Linear claim comment; the doctor uses the same router for idle capacity. Claude and Hyperagent lanes:

`claude_lane.py run --model <id>` runs `claude -p` (`bypassPermissions`, JSON output, no session files, hooks on) on the host's claude.ai subscription or a `claude setup-token` in `~/.config/jovie-lanes/claude.env`. Anthropic API credentials are stripped and `health` refuses an API-key login. A usage limit banks the lane until its reset (default 5h); a burst limit backs off 5 minutes; a banked run exits 75 so the harness fails over. Repairs use Sonnet.

Hyperagent runs agent `cmtj3n2q901i407adklzzq01t` (GLM 5.3 Developer, `auto`; the agent id picks the model, Astra Planner is `confirm`). It is remote-only (`repairs: false`): it claims issues through `hyperagent_lane.py` and local lanes maintain its PRs. Each attempt joins a live `list_agents` identity read with the owner's attestation at `~/.config/jovie-lanes/hyperagent-attestation.json` (`agentId`, `model`, `repository`, `currentInstructions`, `allInCap`, `balanceUsd`, `maxCostUsd`, `attestedAt`, `expiresAt`, `attestedBy`), because the API exposes no balance or cap. Without it the lane is unhealthy. Only the owner can write the attestation — the API exposes no balance or cap for an agent to read back — so a host that lacks it must scope the lane off with `LANES_SLOTS_HYPERAGENT=0` (no probe, no `provider-down` alert) rather than page on a credential that does not exist.

## Install on a host

Gem (systemd user timer) or a Mac (launchd), with a dedicated clone:

```sh
git clone https://github.com/JovieInc/Jovie.git ~/devin-sweep/Jovie
LANES_REPO=~/devin-sweep/Jovie scripts/lanes/install.sh
```

Select the repository's pinned Node in the installing shell first. The installer
puts that Node directory first in the timer PATH on both Linux and macOS.
After changing the host's Node installation, rerun the installer so the timer
does not retain a removed runtime directory.

Per-host knobs: `LANES_SLOTS_<PROVIDER>`, `LANES_LINEAR_ENV`, `LANES_AGENT_TIMEOUT_S`,
`LANES_GATE_TIMEOUT_S`, `LANES_GATE_SLOTS`. A host-specific GitHub token in
`~/.config/jovie-lanes/github.env` (`GH_TOKEN=...`) gives that host its own API budget.
With the Jovie Bot key, every `gh` call (workers, doctor, reconcile, agents) passes the shim's
shared budget guard: below `JOVIE_GITHUB_FLOOR` (600) GraphQL points, read-only polling exits 75
until GitHub's reset while writes still go through; the budget is re-read at most once a minute.
State and receipts live under `~/.local/state/jovie-lanes`. Every gated run records
`gateWaitS` (seconds queued for a gate seat) on its receipt; the doctor aggregates
`gateWaitMedianS24h`/`gateWaitMaxS24h` into the status feed so a seat raise or a
second host is decided on measured queue time, not on timeouts alone.

### Factory stay-up watchdog (JOV-8125)

`install.sh` installs an independent one-minute `jovie-lanes-watchdog` timer (launchd on
macOS, systemd user units on Linux). It makes no healthy-path API calls. Local receipts detect
a missing/stale factory tick after 10 minutes (with a 22-minute grace for an active bounded
release self-test), a zero-worker state with known demand sustained for 5 minutes, the doctor's
bounded stuck-retry/provider-down conditions, and a complete
provider-capacity bank. Recoverable states restart/kickstart the existing `jovie-lanes` service;
the watchdog never starts a second controller directly. A recovery passes only after a newer
tick and doctor observation prove a healthy provider is admitting work and, when work is
waiting, a worker is running or completed after the recovery request.

Each incident gets at most three attempts, spaced by at least two minutes. The atomic latest
receipt is `factory-watchdog.json`; every incident, action, and verified after-state is also
fsynced to `runs/factory-watchdog.jsonl`. Exhaustion or a complete provider-capacity bank opens
one deduped Linear doctor issue; alert delivery retries at most every 15 minutes until
acknowledged. A later healthy observation closes that issue. Inspect the receipt before manual
action; restarting workers outside the installed service path would bypass its ownership lock.

The extra timer is necessary because the normal event-driven worker re-exec and five-minute
idle fallback cannot observe their own timer/process being dark. It performs only local file
reads while healthy, so it adds no recurring external API or provider cost.

**Ship now:** the gate timeout defaults to 3,600 seconds on macOS and remains 2,400 seconds
elsewhere; `LANES_GATE_TIMEOUT_S` still overrides either default. **Re-evaluate when:** the mac
records five gate timeouts in a 24-hour window after a full day on this release. **Then:** use the
recorded gate waits and receipts to decide whether to reduce `LANES_GATE_SLOTS` before extending
the timeout again.

`SYMPHONY_AUTOSCALE` applies by default on the minute `dispatch()` tick. There are no
cadence timers or streaks (Tim 2026-10-12). A saturated lane with pending work (routable Todo
issues from the local Linear mirror plus repair demand) grows toward running + pending, at most
doubling per host step. Lanes wait only `HOST_SETTLE_S` (120 s) between host steps, which is the
lag of the load and PSI samples themselves. A lane with no demand releases its unused seats at
once, down to `ceil(base/2)` and never below its running count, so it holds no host share.
Growth stops only on measured limits:
- host load, memory, PSI or disk
- provider credits: banks, leases and cooldowns
- the GitHub API budget
- failures on the installed release

Severe pressure halves a lane and soft pressure removes one seat per host step. Linear quota,
open-PR counts, 24-hour gate-wait medians, trailing alerts and productive-rate history do not
hold a lane. Merge throughput is diagnostic only. Ceilings are the host's CPU count and each
provider's credits: codex is capped at running plus unleased login runs.
`SYMPHONY_AUTOSCALE_HOST_MAX` and `SYMPHONY_AUTOSCALE_MAX_<PROVIDER>` still override them.
`observe` or `shadow` records the decision and leaves `Host.slots()` on the configured base.
The kill switch is `SYMPHONY_AUTOSCALE=0`. Missing, stale or corrupt input fails safe to base;
an unknown GitHub budget never exceeds base; a disabled lane stays at 0.

After the spawn loop, `capacity_limit.py` reports measured host pressure,
a typed Codex quota cooldown, or a measured GitHub growth guard. Configured
worker ceilings and login seats do not establish a provider hard limit; native
lease occupancy, authentication holds and burst-rate holds remain distinct local
evidence. Generic cooldown markers cannot prove exhausted credits. The doctor
describes quota attribution as existing cooldown policy, not a live quota probe.

A capacity record requires positive current eligible-pool or maintenance demand.
The local record preserves eligible demand separately from reported waiting,
configured seats separately from native leases, each source observation timestamp,
and unknown delivered/marginal throughput. CPU/memory observations come from the
autoscale sample, provider/quota observations retain their doctor/account source
time, and disk is identified as the current tick input. Three distinct fresh
source observations bind or clear a resource; cached polls, stale, future and
out-of-order samples do not advance hysteresis. Unknown demand cannot prove a clear.
Pressure jitter refreshes local evidence without another ping; release replay uses
the latest supported measurement and its original time.

`capacity-limit.json` (`symphony-lanes-capacity-limit/v1`) feeds the status feed's
`capacityLimit`. Changes use the existing strict `jovie.capacity-limit/v1` signed
wire contract (`limited` or `cleared`), with observation time in `needs` and episode
start in `since`. Signing and credential loading are unchanged. There is no
heartbeat. Supported undelivered records retry on the next tick with the same
delivery ID; an obsolete unsupported limit is suppressed. Failed delivery never
changes dispatch. Software and unknown-measurement holds set `bottleneckFound`
locally. Recommendations use existing authorised capacity first: a snapshot
cannot establish paid-capacity ROI or that shipping is causally capped. No allocator,
admission ceiling, account scope, service, or purchasing policy changes here.

## Worktree pool and shared caches (JOV-7705)

`worktree_pool.py` (CLI: `scripts/agent/worktree-new`) keeps `JOVIE_WORKTREE_POOL_SIZE`
(default 2) detached worktrees per repository, each installed and with a warm web
`tsbuildinfo`, under `$JOVIE_CACHE_ROOT/worktree-pool/<hash of git common dir>/`
(default `~/.cache/jovie`). Taking a slot is `git worktree move` + checkout of the new
branch + an incremental install. A fill is one detached process per pool (flock), runs
after every take, rebuilds slots older than 3 days, and never builds below
`JOVIE_WORKTREE_POOL_MIN_FREE_GB` (default 30). `disk_guard` drains idle slots once free
space is under that same floor, so a sweep and a refill never fight. Disk-cleanup agents
must leave `~/.cache/jovie` and the pnpm store (`pnpm store path`) alone; use
`scripts/agent/worktree-new --drain` to reclaim pool space. Tests and
`JOVIE_WORKTREE_POOL=0` never touch the pool.
Per-slot directory locks span claim/move and recycle/ready publication; stale fill
and disk drain skip owned slots. Abandoned claims remain in place for their owner
because marker age does not prove source publication or safe retirement.

Finished worktrees go back instead of being deleted (JOV-7723): `remove_worktree()` keeps
its idle, clean and published checks, then `worktree_pool.recycle()` detaches HEAD at
`origin/main`, runs `git clean -ffdx` except `node_modules` and `.cache`, and moves the
checkout into the pool while there is room and disk. Deleting one installed worktree
took 3 to 32 minutes under load; recycling takes seconds.

## Preserved repairs (JOV-7347)

Repair retries reuse a registered preserved checkout only after its ended run,
execution identity, current target head, ancestry and idle process state agree.
The existing coordinator still enforces the live lease and original retry budget;
changing check failures does not grant a fresh budget. A host-local PR lock spans
failure identities. Unverifiable or superseded work emits a recovery handoff.
Damaged markers matched to the requested target still require a handoff;
unidentified markers are logged for host reconciliation without blocking unrelated
targets. Completed recovery clears its marker and checkout only when the source
is clean, matches the verified remote head, and has no live working directory.
Unpublished edits, unreadable evidence, and failed cleanup retain protection.
Preserved issue implementations require execution reconciliation and remain on
Backlog with their source and accountable issue reference intact.

The runner tracks observed descendants by PID and start time across detached
sessions, cleans them up on completion/cancellation, and never kills by pathname.
A child that fully daemonizes before its first snapshot cannot be attributed this
way; preserved-work admission therefore also checks live working directories.
Cleanup retains protected, dirty or unreadable source. Installed-runtime evidence
is required before calling this commissioned.

## Cross-session continuity

Before each issue dispatch, Symphony recalls up to four same-repository run
receipts from the last 256 KiB of `runs/ledger.jsonl`: the current issue first,
then recent runs in its classified workstream (excluding `general`). New run
receipts retain that workstream. One Linear read supplies the five newest issue
comments, including cross-host handoffs. The combined context is capped at 6,500
characters; individual excerpts are clipped and older comments are explicitly
marked omitted. Missing or unreadable history is marked unavailable, never
proof that no fix was attempted. Auth/quota failures remain fail-soft.

The issue prompt tells the agent to inspect prior findings and Git history before
diagnosis, compare a recorded fix with current source and the exact running
version, and investigate recurrence or reversion before repeating a mutation.
Previously supplied inputs stay in authorized records/configuration. At the
session boundary, agents persist a `Jovie session handoff` on the existing Linear
issue with findings, ruled-out causes, attempted changes and SHA/PR, checks and
failures, separate source/CI/merge/deploy/runtime status, and the next step.
Secrets and private contact details do not belong in handoffs. Durable knowledge
still goes to GBrain; these are existing operational records, not a second brain.

Ship now: bounded evidence retrieval in the current Symphony issue path.
Re-evaluate when: duplicate diagnosis persists despite available handoffs, or
retrieval overhead becomes material. Then: use the broader memory projection
tracked by JOV-7966, retaining Linear/GBrain/source ownership. Local fixture tests
prove prompt delivery and failure isolation; they do not certify live agent
judgment, deployment, or recurrence.

## Context receipts

The existing spawn preflight checks `context-manifest.json` before issue,
handoff, repair, and sensitive-review agent execution. Regenerate the checked-in
contract with `python3 scripts/lanes/lane_runner.py context-manifest --write`;
omit `--write` to check it without credentials or network calls.

Each local prompt has a `.context.json` sidecar binding its exact UTF-8 bytes,
provider, contract, and source inputs by SHA-256. Missing GBrain context is
explicitly marked unavailable. The contract hash uses canonical JSON; repository
formatting changes do not count as drift. New contract drift, input mismatch and
sidecar-write failures emit `jovie-lane-context-qualification/v1` findings without
stopping the agent. Existing prompt-write, spend, security and authorization
failures remain blocking. Failed sidecars have no asserted path or digest in the
run receipt; findings also go to stderr for review-only calls.
H-EX-02 remains partial until the ship cohort and staged promotion required by
`canon/ENGINEERING.md` are verified; no promotion threshold is implied.
Repository documents remain on-demand references; the receipt does not claim they were injected or read. Private issue
and retrieved text remain in the existing local prompt, not the checked-in
contract or hash-only sidecar.

## Remediation (JOV-7540)

Stuck PRs, red main, scheduled CI (Golden Path Nightly; Production Synthetic Monitoring
and Production Continuity Guard are telemetry observers and cannot `workflow_run` into
the relay), deploy
failures and Sentry `repository_dispatch` `sentry-issue` payloads become one
`jovie.remediation-event/v1`. `classify_blocker` / `classify_event` name exactly one class:
`ready`, `needs-rebase` (`lockfile-only`, `generated-only` or `semantic`), `flaky-infra`, `fixable-by-model`,
`needs-human-decision`, `obsolete`, plus `main-red` when main itself is the failure.

The ladder (`plan_ladder`) runs deterministic rungs first — one `update-branch` per episode,
the existing generated-file resolver, one `gh run rerun --failed` per head. Those spend no model
attempt. The next model rung is the lowest enabled healthy `tier` strictly above every lane
that already attempted the head (`select_escalation_lane`). Host-local lanes participate by
tier. When nothing is stronger, one top-rung retry runs on the strongest enabled healthy lane.
Caps, overridable by env: 2 model escalations per head (`LANES_ESCALATION_PER_HEAD`), 4 per PR
(`LANES_ESCALATION_PER_PR`), 30 minutes between model escalations (`LANES_ESCALATION_COOLDOWN_S`).
Spent caps are `ladder-exhausted`. Re-entry is a new external head, a cleared dependency, or
main turning green; attempt history is kept on the `jovie-reentry/v1` receipt.

Flags: `LANES_ESCALATION` default on; `LANES_ESCALATION_NOTIFY_TIM` default off (Linear
`needs-human` label plus one comment); `LANES_ESCALATION_LIFT_HUMAN_HOLDS` default off.
Needs-human, obsolete and ladder-exhausted share one PR comment marked
`<!-- symphony-surface pr=N head=SHA -->`. Hold nags are at most one per PR per head per 24h.
Escalating, ladder-exhausted and surfaced PRs count toward the terminal cap (`slots × 4`)
via `lane-fix-escalating` / `lane-fix-exhausted`.

Non-PR intake from the relay is still a GitHub issue labeled `symphony-remediation` with a
fingerprint marker (no new Actions secret). After a 30-minute claim window the tick converts
it to one Linear issue labeled `remediation`, `agent-ready` and `ws:ci` /
`ws:release-deploy` / `ws:reliability`. `ws:ci` is the first workstream rank, so those
issues drain first.

### Label contract (`remediation:<fingerprint>`)

Any detector — CI, Sentry, a synthetic monitor, a cron — files or reopens **one Linear
issue** on team **JOV** or **LYB** and adds a label whose name is `remediation:<fingerprint>`.
That label is the event. No new controller, workflow, or service is required, and nobody
has to file the event by hand beyond creating or reopening that issue.

Examples: `remediation:asc-agreements`, `remediation:billing-health-public`,
`remediation:stripe-reconcile`, `remediation:e2e-login-timeout`,
`remediation:synthetic-monitoring`, `remediation:golden-path-nightly`,
`remediation:flaky-test-filing`, `remediation:codeowners-drift`.

The bare label `remediation` (no colon) is the relay intake label, not an event.

### Dedupe is the label, and closed issues are history

Events dedupe by the `remediation:<fingerprint>` label across JOV and LYB.
Titles are not a match key. A title such as `vercel-deploy-failed:jovie-docs`
(JOV-7544) does not join an event unless that issue carries the same label.
A second **open** issue with the same label is a comment, not a second claim.
A **closed** or **Done** issue that carries the label is history: it increments
`recurrence` and its recorded attempts stay on `attemptCount`. It is not an
active duplicate, and the router does not reopen it to absorb a newer open
issue. The open issue is the active event. This history rule follows
`LANES_ESCALATION`. When the flag is off, a recurrence reopens the canonical
issue instead.

### Doctor alert labels

While `LANES_ESCALATION` is on, `scripts/lanes/doctor.py` Tracker applies
`remediation:<alert-key-slug>` next to `symphony` when it opens, reopens, or
closes the issue for that alert key. The slug matches
`^[a-z0-9]+(-[a-z0-9]+)*$`: colons and other separators collapse to single
hyphens (`provider-idle:codex` → `remediation:provider-idle-codex`). The label
is created on the JOV team when it is missing, color `#E5484D`.

### Stuck PRs stay on the sweep

Remediation-sweep also files ordinary labeled issues (`remediation:pr-<n>-hold`,
`remediation:pr-<n>-conflict`) that the router consumes as normal events. The in-process
stuck-PR ladder runs by default (Tim 2026-10-12: every exhausted head needs an automatic exit)
while `LANES_ESCALATION` is on; `LANES_ESCALATION_STUCK_PRS=0` turns it off. Terminal heads
(exhausted, escalated, `queue-poison`) also get a no-model main sync each time main moves, with
no clock, on every local worker pass rather than only an idle one. The sync lifts
`queue-poison` and `lane-fix-exhausted`: the new head is ordinary re-entry, and a green
observation of the same exhausted head does not clear it. Poison removal is the boundary
the poison count restarts from. A bot hold whose head moved past it is lifted at once
(`LANES_STALE_HOLD_UNHOLD=0` keeps alert-only). An oversize diff goes to a repair lane that
splits it into a stack instead of bug intake.

On the next dispatch tick the router:

1. Reads events with **one** label-filtered Linear query (`labels.name startsWith "remediation:"`,
   teams JOV and LYB, first 100, no per-issue follow-up read). The read goes through the
   cached claim scan (`shared`, key `remediation-events`) so workers do not repeat it.
2. Dedupes by the `remediation:<fingerprint>` label across JOV and LYB, never by
   title. One open event per fingerprint. A second open issue is a comment, not a
   second claim. A closed or Done issue with the label counts as history
   (`recurrence`, `attemptCount`), not as an active duplicate.
3. Classifies the event as `fixable-by-agent` or `human-only`. Human-only means Tim has
   to act: spend, billing actions, env/DNS/secrets, store submissions (including
   `asc-agreements`), outside humans, manual deploys.
4. Dispatches fixable events up the existing lane ladder: the first model is a stronger
   enabled lane than the weakest, then failover across lanes and accounts, then one
   top-rung retry. The assigned lane claims the issue on its existing worker pass.
5. For human-only or ladder-exhausted events, records the state always. The `needs-human`
   label and one comment with the exact ask are posted only when
   `LANES_ESCALATION_NOTIFY_TIM` is on (default off).

`remediation:musicfetch-*` is not a renewal. It routes to the in-house resolver cutover
(**JOV-7323**). The dossier tells the lane not to renew, purchase, extend, or restore
MusicFetch.

`doctor.json` always carries `escalation` (`by_class`, `escalating`, `ladder_exhausted`,
`surfaced`, `attempts24h`, `landed_after_escalation24h`) and `remediation` (`by_source`,
`by_class`, `routed_by_lane`, `failovers24h`, `escalations24h`, `ladder_exhausted`,
`surfaced`, plus the event counters). The same event counters are top-level:
`eventsOpen`, `eventsClaimed`, `eventsHuman`, `eventsExhausted`, and `byFingerprint`
(state, issue, class, lane, and the exact ask). A non-empty `surfaced` list raises
alert `escalation-needs-human`.

## Tests

```sh
python3 -m unittest scripts/tests/test_lane_runner.py scripts/tests/test_codex_lane.py \
  scripts/tests/test_hud.py scripts/tests/test_doctor.py scripts/tests/test_pr_events.py \
  scripts/tests/test_reason_lane.py scripts/tests/test_disk_guard.py scripts/tests/test_worktree_sweep.py \
  scripts/tests/test_remediation.py
```

The same files run inside `update()` before a release is installed anywhere.

### Production continuity clock (JOV-6909)

Gem's existing minute tick checks the fixed `production-continuity.yml` workflow
at most once every five minutes. When its latest invocation is overdue and no
active run is observed, it requests that existing workflow on `main`. A separate
in-progress lookup catches runs outside the recent 30-run window; the workflow's
existing concurrency group serializes a race with GitHub's native schedule.
Only the hosted workflow performs probes, check-ins, alerts and recovery ingress.
A `dispatch-requested` receipt is not a successful probe or restored service.

The adapter runs even when disk admission prevents worker launches. Mac hosts
return `not-owner`. A host-local file lock prevents overlapping ticks, atomic
state records the budget before network calls, and an uncertain POST backs off
15 minutes. Unreadable state and API errors never reset that budget or invent a
successful observation. Inspect `continuity-clock.json` and `tick.json` in the
existing lane state directory; the Sentry deadman remains authoritative when
there are no accepted observations. There are no new credentials or timers.

Adopt-first decision: **compose** the existing Gem/systemd clock, GitHub Actions
workflow and Sentry monitor. Native schedule alone repeatedly omitted hours of
invocations while delivered probes succeeded (run 36829224204; Sentry issue
7750181397). GitHub documents that scheduled runs can be delayed or dropped:
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
That is a possible mechanism, not a proved cause for this incident. Webhooks,
inline work and lazy evaluation cannot themselves observe absence of invocation.
A new scheduler adds an owner and credential boundary without filling a gap that
Gem's existing tick cannot cover. All components remain in the current operating
and credential boundary; no new dependency or license is introduced. Removal is
one adapter call after an alternative clock proves the same external liveness.

Budget: at most 288 recent-run reads plus 288 active-run reads and 288 dispatches
per day under continuous native-schedule absence (at most 25,920 API calls per
30 days). Healthy native cadence normally skips the second read and POST. Each
child has a 10-second timeout; an overdue attempt is bounded to 30 seconds of
network subprocess time. Hosted run costs retain the existing five-minute probe
cadence; a schedule race may enqueue one additional serialized invocation.

Ship now: bounded missing-invocation recovery through the existing clock.
Re-evaluate when observed dispatches and real workflow/check-in receipts prove
recurrence, or native scheduling reliably supplies the cadence again. Then:
remove unnecessary recovery calls while retaining the independent deadman.
JOV-6909 remains commissioning until recurrence is observed after deployment.

## Design gate (JOV-7541)

UI and landing work does not enter a build lane until a design brief has
finished the founder's IA-first pipeline (steps 1–9 of
`docs/design/design-brief-template.md`). Step 2 may cite only certified
capability ids from `scripts/lanes/certified-capabilities.gen.json`, a
checked-in projection of `apps/web/data/product-truth/registry.ts`:
publication `public`, `marketing.proofAuthorized` true, maturity not
`proposed`, access not `unavailable`.

`design_gate.py` is pure stdlib, with no I/O at import.

**What is gated.** Only visible-UI work. An issue is gated when it has
`ws:ui-ia`, `ws:profiles-marketing` or `ws:design-gate`, when its description
names a `GATED_PATH_PREFIXES` path, or when its title targets a homepage,
landing or marketing page. A homepage mentioned only in passing in the
description does not gate. Neither does a plumbing title: a redirect, alias,
orphan, route handler, endpoint, webhook, cron, migration or backend.

**Which template.** Marketing and landing issues use
`docs/design/design-brief-template.md`. App-surface issues use
`docs/design/app-ui-brief-template.md`. Its steps 5–7 are screens and states
(JOV-7713 class 6), canonical primitives, and viewports. Primitives are
checked against `app-ui-primitives.gen.json`, a projection of
`DESIGN_SYSTEM_COMPONENT_IDS` and `AppScreenComponentId` that a test keeps
in sync with those registries.

**No issue waits for a brief (Tim 2026-10-11).** `worker()` calls
`design_gate.pick_build_issue(...)` with the existing `pick_issue`; ordinary
order and eligibility choose the issue. A gated issue whose brief is missing or
incomplete (inline or linked) is claimed as `brief-auto`: the gate labels it,
clears any legacy `needs-design-brief` label, comments once, and appends one
founder `jovie.work-order/v1` block for the taste call, which Summer's founder
path (JOV-7739) posts to Ovie after the fact. The claiming build run writes the
brief itself from the template and canon (`DESIGN_LOOP_CONTRACT`), puts it in
the PR body, and builds in the same run. There is no separate brief run, no
`held-at` marker and no frontier retry.

`doctor.py` adds `designGate` to the admission census, deduped: `gated`,
`admitted`, `autoAdmitted` and `missingSteps` (steps the claiming runs will
write). Nothing is rejected for a brief and there is no `design-brief-stale`
alert.

Design loop (JOV-7759): a gated issue's build prompt carries
`DESIGN_LOOP_CONTRACT`. The lane plans from the brief, builds, and iterates
privately until `pnpm design:conformance:gate`, `pnpm invariants:check` and the
copy gate are green; `scripts/funnel-judge` also runs on funnel surfaces. The
conformance gate includes `scripts/design-frontend-skill-check.mjs`, the
deterministic subset of the frontend-skill contract, applied to added UI lines
only. `scripts/automation-verify.sh affected` runs it as well, so the lane's
own gate fails before CI does.

CI (`.github/workflows/design-gate.yml`) warns when a PR touches the same
paths with no completed brief; it enforces only when `DESIGN_GATE_ENFORCE`
is truthy, and unreadable briefs stay warnings even then.

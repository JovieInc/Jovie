# Symphony: the shipping lanes

This directory is Symphony. One harness, one release, one policy, one test set, one HUD.
Devin and Codex are the lanes that ship; Claude and Hyperagent stay `enabled: false` until
Tim turns them on. Symphony Elixir on Gem is retired (its units are stopped and masked by
`gem-retire-elixir.sh`); nothing else claims JOV work.

A lane is a Linear label plus a provider command in `providers.json`. Every enabled lane
drains the shared `agent-ready` pool as well as its own label. Issues carrying
`no-symphony`, billing, auth, infra or epic labels are never taken.

The harness, not the model, owns:

| Concern | Where |
|---|---|
| Claim (serialised, `flock`), one PR per issue across hosts (GitHub is the truth), priority aging after each 24h wait | `worker()`, `pick_issue()`, `in_flight_issues()` |
| One open PR per issue: branch or `linear-issue-id` marker; an unreadable PR list claims nothing | `in_flight_issues()` |
| Open-PR budget: a lane holding `slots × 2` open advanceable non-green PRs only fixes/adopts until it drains; held/`lane-fix-exhausted` PRs are bounded separately at `slots × 4` (`terminal-pr-backlog`) so parked work cannot pin a lane idle | `new_issue_budget()`, `pr_is_terminal()` |
| Workstreams: one classifier for intake and backlog (`ws:<key>` label override, else ordered rules); exact normalized-title duplicates admit only the oldest (`duplicate-candidate:<JOV>`); order = tier (urgent or CI/Symphony-throughput) → aged priority → workstream rank → age | `workstreams.py`, `pool_rejections()`, `admission_order()` |
| File-overlap admission: declared paths, then the workstream map, are compared with the cached open-PR inventory and In Progress lane tasks; hot control-plane and duplicate migration-number collisions wait, shared/generated files sequence, other overlaps flag | `file_overlap.py`, `overlap_inventory()` |
| Hotspot admission (JOV-7708): an issue whose predicted touch set (named file paths, else its workstream area; Symphony-throughput = the lanes harness) hits a hotspot an open, non-parked PR holds waits as `hotspot-held:<path>#<pr>`. Hotspots = a static seed (lanes harness, `code-flags.ts`, command/product-truth registries, `node-environment-files.json`, `destructive-red-drift.baseline.json`) plus any file two open PRs touch; an unreadable file list admits ungated | `pool_rejections()`, `hotspot_holds()`, `open_hotspot_holds()` |
| Sweep (every 30 min per lane): retire only explicitly labeled duplicates after live head, hold and queue revalidation; preserve unlabelled stale drafts | `sweep_lane_prs()` |
| Lockfile-only conflicts: merge main, take its `pnpm-lock.yaml`, `pnpm install --lockfile-only`, push; no model, no force-push | `resolve_lockfile_conflict()` |
| Slot locks that die with their holder | `Locked` |
| Worktree from `origin/main`: a pre-installed pool slot when one is ready (`worktreeSource: pool` on the receipt), else fresh; shared-store hardlink install; background refill; removal after | `run_issue()`, `worktree_pool.take()` |
| GBrain context pack in the prompt, plus the repo contract | `context_pack()`, `render_prompt()` |
| Independent verification: diff rules, then the repo's own `pre-push-gate.sh affected`, then the funnel judge on the head's preview when a funnel surface changed (`scripts/funnel-judge/preview-gate.mjs`; no preview or exit 2 holds) | `gate_pr()` |
| Gate seats (`LANES_GATE_SLOTS`, default 2 per host) and streamed gate logs | `gate_slot()`, `sh(stream=True)` |
| Host-local exact-head gate reservation before adoption setup or original verification; claims are never proof | `reserve_gate()`, `claim_adoptable_pr()`, `gate_pr()` |
| Gate timeouts are transient: re-gated by adopt, held only after 3 on one head | `gate_timeouts()` |
| Landing: only a gate-passing PR is marked ready and auto-merged; CI and the queue decide | `gate_pr()`, `requeue_verified()` |
| Receipts (`runs/ledger.jsonl`) bind Linear issue, provider/account class and lease, worktree/branch, PR/head or terminal failure; per-run log and prompt, Linear handoff comments | `run_issue()`, `codex_lane.record_lease()`, `worker()` |
| Retry to Todo, Triage after 3 failures; not-shippable goes to Triage once | `worker()` |
| Fix loop owns every open non-draft PR in the repo (red checks, conflicts, changes requested), reconciles live state before checkout/install/push, 2 attempts per head, then the escalation ladder | `fix_candidates()`, `reconcile_fix_target()`, `red_pr()`, `escalate_exhausted()`, `remediation.py` |
| Event queue: GitHub signals become `lane-fix-<kind>` labels; a worker takes a labeled PR first | `pr_events.py`, `lane-fix-relay.yml` |
| Cheapest lane first: attempt n belongs to the n-th enabled lane in `providers.json` order | `pr_events.may_take()` |
| Ready on green: a CLEAN lane draft gets `gh pr ready` plus its merge intent in one writer action | `pr_events.ready_green()` |
| Disabled-lane drafts: adopted for bounded repair; provider state, issue completion and exhausted attempts never authorize closing unlabelled work | `pr_events.retire_orphan()`, `return_to_pool()` |
| Held and failed records carry `reason` + `next_action`; the status feed publishes `held_by_reason` | `pr_events.held_reason()`, `doctor.status_feed()` |
| Garbage collection of crashed worktrees | `prune_worktrees()` |
| Worktree retirement (JOV-7704): the tick spawns one sweep per hour (10 min under 15% free, and even when disk admission fails) over lanes, Codex, Conductor, Claude-scratch and `jovie-wt-*` checkouts. A checkout retires when its PR closed (1h grace) or after 12h idle; preserved repairs expire on PR close or after 3 days. Live-process paths are never touched; dirty or unpushed work is pushed to `backup/<host>/<name>-<date>` first, else only build output is stripped. Primary clones, bare mirrors, `~/.cache` and the pnpm store are out of scope | `worktree_sweep.py`, `dispatch()` |
| Disk admission on the tick and before installs: critical (at or below 5%) or unknown free space blocks work. Only a worker holding a slot may sweep under 15%, under one host-wide cleanup lock; cleanup preserves the shared pnpm store, unrelated checkouts and cancelled repair source | `disk_guard.py`, `dispatch()`, `worker()` |
| Drain-safe self-update from `origin/main` after the release's own tests pass | `update()` |
| Codex accounts: lease one per run; a burst 429 backs off 2 min and rotates, a spent plan (usage limit / quota) banks until its reset, and only a failed run's closing lines can bank an account | `codex_lane.py` |
| Provider throughput: matched-work offers, accepts, starts, productive/PR/first-pass rates, remediation, issue→PR→merge time, landed output, idle qualified capacity and failure reasons; landed attribution comes from receipts, never a branch prefix | `provider_throughput()`, `doctor.status_feed()`, `hud.py` |
| Provider failover: a lane that exits non-zero mid-issue (every account spent, auth, crash, HTTP 404, unhealthy) hands the same worktree to the next enabled, healthy, uncooled lane in `providers.json` tier order, up to 2 handoffs; the receipt records `handoffs` (with `reason`) and `finishedBy`. Disabled entries, including Hyperagent, are never chosen | `run_issue()`, `next_provider()`, `remediation.route_lane()` |
| Guarded sensitive work: auth/billing/infra labels route only to Codex at `xhigh`; 500-line cap, canonical security/boundary gates, and independent `llm-review` run before enrollment | `pick_issue()`, `gate_pr()`, `sensitive_review()` |
| Stop revokes publication: a kill writes `runs/publication-revocations.jsonl` before the kill is acked, and every irreversible boundary (push, PR open, label, enqueue) revalidates it — revoked branches never ship (JOV-5060) | `run_agent(on_kill=)`, `revoke_publication()`, `require_publishable()` |

Event-driven: a worker that finishes re-execs the current release and pulls the next
issue. The minute timer only restarts idle lanes and applies updates; it never signals a
running worker. Production deploys are a separate track: only a red main stops shipping.

New-issue admission reports three separate counts: raw Todo candidates, candidates
passing the issue predicate, and new issues after the owning lane's PR budget.
Worker and doctor share the same budget decision: each dated lane branch counts
once while non-green, with a cap of effective slots × 2. Manual branches and
disabled-lane orphan maintenance do not inflate that lane's budget. A failed,
malformed or truncation-ambiguous inventory stays unknown and cannot admit new
issues. Maintenance claims still run first and do not depend on that budget read.
HUD labels this count as new issues; it is not total company demand or a claim of
available worker capacity. Slot occupancy, account leases and PR work remain
separate facts. Empty-demand alerts require known zero eligibility and no open
PR maintenance; unknown evidence and backpressure reset the empty timer.

The file-overlap guard is on by default. `SYMPHONY_FILE_OVERLAP_GUARD=flag` keeps
classification, ledger, doctor, and HUD visibility without holds; `=0` disables it
and releases automation-owned holds. Existing non-draft PR overlaps are ordered by
an explicit stack/dependency first, then foundational/shared work, smaller diffs,
creation time, and PR number. The later PR receives `hold`; after the earlier PR
lands, Symphony removes only the hold it applied and queues `lane-fix-dequeued` for
the existing rebase lane. A stacked child is retargeted to `main`, never merged into
its parent branch. Generated workflow topology and migration journals are regenerated
after rebasing rather than hand-merged. `doctor.json.fileOverlap` publishes active
pairs, files, actions, and the prevention/flag/rebase counters.

Account attribution uses the existing status rows without changing account
admission. Lease occupancy and cooldown are independent; an account can be both
leased and in a recorded hold. The existing available flag means eligible under
cooldown policy, not a fresh positive quota reading. An empty unleased-available
list does not mean all quotas are exhausted. Usage-limit, auth, rate and unknown
holds remain distinct, and stale or incomplete rows report unknown.

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
unreadable remote/local head cannot publish proof; enqueue requests bind the expected
head with `--match-head-commit`. A reused terminal result is reported as
`gate-already-completed`, not another landing.

Every existing publisher (`gate_pr`, event `ready_green`, `requeue_verified` and
repair completion) now converges on `publish_verified`. A successful completed
proof is required before ready or enqueue. Repair completion records exact-head
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

`pick_issue()` orders candidates by `admission_order()`: tier 0 is urgent work
(effective P1, including work aged to P1) or a compounding workstream (CI, Symphony
throughput); then aged priority; then workstream rank; then age. Urgent-first and
anti-starvation aging are preserved; a non-urgent CI or throughput fix runs ahead of
non-urgent product work. The Linear backlog carries the same `ws:*` labels so new
intake and existing work follow one rule.

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
review comment `lane-fix-review`, green CI on a lane draft `lane-fix-green`. Every worker pass
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
  etc.) on a 7-day age SLO once stalled (idle 48h, conflicting, or red). Stalled agent
  drafts receive `repair`, or `hold:dependency` while a named dependency is open.
  A landed dependency releases repair; it never grants authority to discard the branch.
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

## Reason lane (Summer's tier-3 decisions)

Ranking, prioritization and strategy decisions are not made on Summer's flash model. Summer
files a JOV issue labeled `reasoning-job` in Todo, carrying a `summer.reasoning-job/v1` JSON block
(question, decision type, context refs, deadline). The label is excluded from the shipping lanes.
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
healthy provider, configured slots, repeated dispatch attempts, and zero workers, capacity
is being lost. `spawn-exit` fires when workers spawn every tick but no run starts or ends
and no worktree exists; a worker that finishes its claim scan with nothing to do records a
clean exit in `worker-idle.json`, so the alert only means workers are dying before or during
the claim — a clean 'nothing claimable' exit is not a deadlock. Every alert also produces a generation-deduped
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

Auth, billing, payment, infrastructure, and Vercel labels are admitted only by this lane.
Those runs use maximum reasoning effort, carry the `sensitive-surface` PR label across
hosts, and stay draft until the normal Migration Guard/security/boundary checks plus a
separate max-effort Codex review pass. `no-symphony`, secret/credential rotation, and
live billing pricing remain excluded. Other providers retain their sensitive-label
exclusions.

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
State and receipts live under `~/.local/state/jovie-lanes`. Every gated run records
`gateWaitS` (seconds queued for a gate seat) on its receipt; the doctor aggregates
`gateWaitMedianS24h`/`gateWaitMaxS24h` into the status feed so a seat raise or a
second host is decided on measured queue time, not on timeouts alone.

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
`ready`, `needs-rebase` (`lockfile-only` or `semantic`), `flaky-infra`, `fixable-by-model`,
`needs-human-decision`, `obsolete`, plus `main-red` when main itself is the failure.

The ladder (`plan_ladder`) runs deterministic rungs first — one `update-branch` per episode,
the existing lockfile resolver, one `gh run rerun --failed` per head. Those spend no model
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

### Precedence over `no-symphony`

An issue that carries any `remediation:*` label is never skipped because it also
carries `no-symphony`. JOV-7540 and JOV-7551 carry `no-symphony`. The bare
`remediation` label does not override that exclusion. `type:epic`,
`codex-blocked`, and `reasoning-job` still exclude the issue. The exception
follows `LANES_ESCALATION` (default on). When that flag is off, `no-symphony`
excludes the issue again.

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

Stuck-PR detection lives in remediation-sweep. It files ordinary labeled
issues: `remediation:pr-<n>-hold` and `remediation:pr-<n>-conflict` for a PR
whose `lane-fix-exhausted` label has aged out. The router consumes those as
normal remediation events. It does not run its own stuck-PR escalation unless
`LANES_ESCALATION_STUCK_PRS=1` (and `LANES_ESCALATION` is on). That flag
defaults off.

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

**What happens to a held issue (JOV-7717: a brief must never block forever).**
`worker()` calls `design_gate.pick_build_issue(...)` with the existing
`pick_issue`. That call does five things:

1. **First claim.** A held issue goes ahead of build work: among issues whose
   brief run is due, `pick_issue` order and eligibility choose one. The gate
   adds `needs-design-brief` and a `held-at` marker once.
2. **Brief run.** `run_brief` runs the same provider with a brief-only prompt.
   The prompt says to write `.design-brief.md` and not to invent artifacts.
   The runner appends the result inline under
   `<!-- design-gate:brief-lane -->`, even if the run produced nothing, and
   opens no PR. The issue returns to Todo.
3. **Frontier retry.** If steps are still missing, the next claim runs one
   retry on the `codex` lane (if healthy, otherwise the same lane). It fills
   the steps from canon (DESIGN.md and the registries) and replaces the draft
   under `<!-- design-gate:brief-retry -->`.
4. **Auto-admission.** After the retry, or 24h after `held-at`, an incomplete
   brief is admitted as `brief-auto`. The gate labels it, comments a warning,
   and appends one founder `jovie.work-order/v1` block for the taste call.
   Summer's founder path (JOV-7739) posts that block to Ovie with no model
   turn.
5. **Linked briefs.** A linked `Design brief:` doc is never overwritten. It
   gets no brief run and follows the 24h rule.

`doctor.py` adds `designGate` to the admission census, deduped:

- `gated`, `admitted`, `autoAdmitted`, `needsBrief` and `missingSteps`;
- `ageHistogram`: time since `held-at` for issues still held or labeled;
- `stale`: issues held past 25h. Any entry raises the `design-brief-stale`
  alert.

Incomplete briefs also increment `rejectedByProvider["needs-design-brief"]`.

CI (`.github/workflows/design-gate.yml`) warns when a PR touches the same
paths with no completed brief; it enforces only when `DESIGN_GATE_ENFORCE`
is truthy, and unreadable briefs stay warnings even then.

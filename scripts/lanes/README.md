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
| Open-PR budget: a lane holding `slots × 2` open non-green PRs only fixes/adopts until it drains | `over_budget()` |
| Sweep (every 30 min per lane): close duplicate PRs as superseded, close drafts with no green run and no push for 24 h, issue back to Todo | `sweep_lane_prs()` |
| Lockfile-only conflicts: merge main, take its `pnpm-lock.yaml`, `pnpm install --lockfile-only`, push; no model, no force-push | `resolve_lockfile_conflict()` |
| Slot locks that die with their holder | `Locked` |
| Fresh worktree from `origin/main`, shared-store hardlink install, removal after | `run_issue()` |
| GBrain context pack in the prompt, plus the repo contract | `context_pack()`, `render_prompt()` |
| Independent verification: diff rules, then the repo's own `pre-push-gate.sh affected` | `gate_pr()` |
| Gate seats (`LANES_GATE_SLOTS`, default 2 per host) and streamed gate logs | `gate_slot()`, `sh(stream=True)` |
| Gate timeouts are transient: re-gated by adopt, held only after 3 on one head | `gate_timeouts()` |
| Landing: only a gate-passing PR is marked ready and auto-merged; CI and the queue decide | `gate_pr()`, `requeue_verified()` |
| Receipts (`runs/ledger.jsonl`) bind Linear issue, provider/account class and lease, worktree/branch, PR/head or terminal failure; per-run log and prompt, Linear handoff comments | `run_issue()`, `codex_lane.record_lease()`, `worker()` |
| Retry to Todo, Triage after 3 failures; not-shippable goes to Triage once | `worker()` |
| Fix loop owns every open non-draft PR in the repo (red checks, conflicts, changes requested), reconciles live state before checkout/install/push, 2 attempts per head, then one Triage issue | `fix_candidates()`, `reconcile_fix_target()`, `red_pr()`, `escalate_exhausted()` |
| Event queue: GitHub signals become `lane-fix-<kind>` labels; a worker takes a labeled PR first | `pr_events.py`, `lane-fix-relay.yml` |
| Cheapest lane first: attempt n belongs to the n-th enabled lane in `providers.json` order | `pr_events.may_take()` |
| Ready on green: a CLEAN lane draft gets `gh pr ready` plus its merge intent in one writer action | `pr_events.ready_green()` |
| Disabled-lane drafts: closed when superseded or done, else adopted; closed and the issue returned to Todo once their fix attempts run out | `pr_events.retire_orphan()`, `return_to_pool()` |
| Held and failed records carry `reason` + `next_action`; the status feed publishes `held_by_reason` | `pr_events.held_reason()`, `doctor.status_feed()` |
| Garbage collection of crashed worktrees | `prune_worktrees()` |
| Disk admission on the tick and before installs: critical (at or below 5%) or unknown free space blocks work. Only a worker holding a slot may sweep under 15%, under one host-wide cleanup lock; cleanup preserves the shared pnpm store, unrelated checkouts and cancelled repair source | `disk_guard.py`, `dispatch()`, `worker()` |
| Drain-safe self-update from `origin/main` after the release's own tests pass | `update()` |
| Codex accounts: lease one per run; a burst 429 backs off 2 min and rotates, a spent plan (usage limit / quota) banks until its reset, and only a failed run's closing lines can bank an account | `codex_lane.py` |
| Provider throughput: matched-work offers, accepts, starts, productive/PR/first-pass rates, remediation, issue→PR→merge time, landed output, idle qualified capacity and failure reasons; landed attribution comes from receipts, never a branch prefix | `provider_throughput()`, `doctor.status_feed()`, `hud.py` |
| Provider failover: a lane that exits non-zero mid-issue (every account spent, auth, crash) hands the same worktree to the next enabled, healthy, uncooled lane, up to 2 handoffs; the receipt records `handoffs` and `finishedBy` | `run_issue()`, `next_provider()` |
| Guarded sensitive work: auth/billing/infra labels route only to Codex at `xhigh`; 500-line cap, canonical security/boundary gates, and independent `llm-review` run before enrollment | `pick_issue()`, `gate_pr()`, `sensitive_review()` |

Event-driven: a worker that finishes re-execs the current release and pulls the next
issue. The minute timer only restarts idle lanes and applies updates; it never signals a
running worker. Production deploys are a separate track: only a red main stops shipping.

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
  draft idle for 48h gets `stale` (or is closed when superseded or out of attempts, its issue
  back to Todo), and a PR that went CLEAN or entered the queue starts a fresh episode.
- Age SLOs are per class (JOV-7079): queued/ready PRs live on the merge queue's clock, lane
  drafts on the 48h idle `stale` SLO, and non-lane agent drafts (`codex/…`, `tim/…`, `devin/…`,
  etc.) on a 7-day age SLO once stalled (idle 48h, conflicting, or red). An aged-out agent
  draft is closed as abandoned — unless its body names a still-open dependency
  ("blocked by #n", "pull/n"), in which case it holds as `hold:dependency` and is revalidated
  every sweep: the note is never authoritative once the dependency lands or closes. A human's
  branch is never touched.
- Every open PR also gets one truthful disposition in `reconcile.json` (`dispositions`,
  oldest first: `advancing`, `queued`, `ready`, `hold:<reason>`, `hold:dependency`,
  `closing`, `draft`, `orphaned`), and the doctor raises `aged-prs` for anything open past
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

Per-host knobs: `LANES_SLOTS_<PROVIDER>`, `LANES_LINEAR_ENV`, `LANES_AGENT_TIMEOUT_S`,
`LANES_GATE_TIMEOUT_S`, `LANES_GATE_SLOTS`. A host-specific GitHub token in
`~/.config/jovie-lanes/github.env` (`GH_TOKEN=...`) gives that host its own API budget.
State and receipts live under `~/.local/state/jovie-lanes`. Every gated run records
`gateWaitS` (seconds queued for a gate seat) on its receipt; the doctor aggregates
`gateWaitMedianS24h`/`gateWaitMaxS24h` into the status feed so a seat raise or a
second host is decided on measured queue time, not on timeouts alone.

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

## Tests

```sh
python3 -m unittest scripts/tests/test_lane_runner.py scripts/tests/test_codex_lane.py \
  scripts/tests/test_hud.py scripts/tests/test_doctor.py scripts/tests/test_pr_events.py \
  scripts/tests/test_reason_lane.py scripts/tests/test_disk_guard.py
```

The same files run inside `update()` before a release is installed anywhere.

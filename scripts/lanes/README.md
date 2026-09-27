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
| Slot locks that die with their holder | `Locked` |
| Fresh worktree from `origin/main`, `pnpm install --prefer-offline`, removal after | `run_issue()` |
| GBrain context pack in the prompt, plus the repo contract | `context_pack()`, `render_prompt()` |
| Independent verification: diff rules, then the repo's own `pre-push-gate.sh affected` | `gate_pr()` |
| Gate seats (`LANES_GATE_SLOTS`, default 2 per host) and streamed gate logs | `gate_slot()`, `sh(stream=True)` |
| Gate timeouts are transient: re-gated by adopt, held only after 3 on one head | `gate_timeouts()` |
| Landing: only a gate-passing PR is marked ready and auto-merged; CI and the queue decide | `gate_pr()`, `requeue_verified()` |
| Receipts (`runs/ledger.jsonl`), per-run log and prompt, Linear handoff comments | `run_issue()`, `worker()` |
| Retry to Todo, Triage after 3 failures; not-shippable goes to Triage once | `worker()` |
| Fix loop owns every open non-draft PR in the repo (red checks, conflicts, changes requested), 2 attempts per head, then one Triage issue | `fix_candidates()`, `red_pr()`, `escalate_exhausted()` |
| Event queue: GitHub signals become `lane-fix-<kind>` labels; a worker takes a labeled PR first | `pr_events.py`, `lane-fix-relay.yml` |
| Cheapest lane first: attempt n belongs to the n-th enabled lane in `providers.json` order | `pr_events.may_take()` |
| Ready on green: a CLEAN lane draft gets `gh pr ready` plus its merge intent in one writer action | `pr_events.ready_green()` |
| Disabled-lane drafts: closed when superseded or done, else adopted; closed and the issue returned to Todo once their fix attempts run out | `pr_events.retire_orphan()`, `return_to_pool()` |
| Held and failed records carry `reason` + `next_action`; the status feed publishes `held_by_reason` | `pr_events.held_reason()`, `doctor.status_feed()` |
| Garbage collection of crashed worktrees | `prune_worktrees()` |
| Drain-safe self-update from `origin/main` after the release's own tests pass | `update()` |
| Codex accounts: lease one per run, bank exhausted ones until their reset | `codex_lane.py` |

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

Held reason codes (`held.json`): `secret-file`, `fix-exhausted`, `empty-diff`, `diff-too-large`,
`lockfile-without-manifest`, `missing-test`, `gate-check-failed`, `gate-timeout`, `unclassified`.
Green CI overrides only `gate-check-failed` and `gate-timeout`, which are verdicts from the local
gate. The other codes are diff policy or unknown, and the PR stays a draft.

## Nothing fails silently

`doctor.py` runs at the end of every dispatch tick. It judges the tick receipt
(`tick.json`), the ledger, slot locks, Codex accounts, the Linear pool, GitHub quota,
disk and the HUD heartbeat, and writes `doctor.json` (the HUD's NEEDS ATTENTION row).
Each new alert key opens a Linear issue in Triage (label `symphony`, "Symphony doctor:
<key>") so Summer routes it; when the condition clears the issue is commented and moved
to Done; a key that fires again within six hours reopens the same issue. Keys:
`tick-error`, `provider-down:<lane>`, `codex-all-banked`, `codex-broken`, `linear-down`,
`pool-empty`, `no-landing`, `gate-timeouts`, `failed-runs`, `disk-low`, `github-quota`,
`hud-stale`.

## Codex lane

`codex_lane.py run` picks the least-recently-used ChatGPT-authenticated profile under
`~/.codex-accounts/<name>/` (API-key and adapter profiles are ignored), leases it with a
flock, and runs `codex exec --dangerously-bypass-approvals-and-sandbox --ignore-user-config`
in the worktree. Usage-limit, rate-limit and auth messages in codex's output bank the
account until the reset it reports (default 5h). `codex_lane.py status` is the JSON the
HUD and doctor read; `health` exits non-zero when no account is available, which keeps
the lane from dispatching at all.

## Install on a host

Gem (systemd user timer) or a Mac (launchd), with a dedicated clone:

```sh
git clone https://github.com/JovieInc/Jovie.git ~/devin-sweep/Jovie
LANES_REPO=~/devin-sweep/Jovie scripts/lanes/install.sh
```

Per-host knobs: `LANES_SLOTS_<PROVIDER>`, `LANES_LINEAR_ENV`, `LANES_AGENT_TIMEOUT_S`,
`LANES_GATE_TIMEOUT_S`, `LANES_GATE_SLOTS`. A host-specific GitHub token in
`~/.config/jovie-lanes/github.env` (`GH_TOKEN=...`) gives that host its own API budget.
State and receipts live under `~/.local/state/jovie-lanes`.

## Tests

```sh
python3 -m unittest scripts/tests/test_lane_runner.py scripts/tests/test_codex_lane.py \
  scripts/tests/test_hud.py scripts/tests/test_doctor.py scripts/tests/test_pr_events.py
```

The same files run inside `update()` before a release is installed anywhere.

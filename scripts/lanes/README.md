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
| Claim (serialised, `flock`), one PR per issue across hosts (GitHub is the truth) | `worker()`, `pick_issue()`, `in_flight_issues()` |
| Slot locks that die with their holder | `Locked` |
| Fresh worktree from `origin/main`, `pnpm install --prefer-offline`, removal after | `run_issue()` |
| GBrain context pack in the prompt, plus the repo contract | `context_pack()`, `render_prompt()` |
| Independent verification: diff rules, then the repo's own `pre-push-gate.sh affected` | `gate_pr()` |
| Gate seats (`LANES_GATE_SLOTS`, default 2 per host) and streamed gate logs | `gate_slot()`, `sh(stream=True)` |
| Gate timeouts are transient: re-gated by adopt, held only after 3 on one head | `gate_timeouts()` |
| Landing: only a gate-passing PR is marked ready and auto-merged; CI and the queue decide | `gate_pr()`, `requeue_verified()` |
| Receipts (`runs/ledger.jsonl`), per-run log and prompt, Linear handoff comments | `run_issue()`, `worker()` |
| Retry to Todo, Triage after 3 failures; not-shippable goes to Triage once | `worker()` |
| Garbage collection of crashed worktrees | `prune_worktrees()` |
| Drain-safe self-update from `origin/main` after the release's own tests pass | `update()` |
| Codex accounts: lease one per run, bank exhausted ones until their reset | `codex_lane.py` |

Event-driven: a worker that finishes re-execs the current release and pulls the next
issue. The minute timer only restarts idle lanes and applies updates; it never signals a
running worker. Production deploys are a separate track: only a red main stops shipping.

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
python3 -m unittest scripts/tests/test_lane_runner.py scripts/tests/test_codex_lane.py
```

The same files run inside `update()` before a release is installed anywhere.

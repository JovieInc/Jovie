# Shipping lanes

Provider-agnostic implementers for JOV issues. A lane is a Linear label (`devin`,
`claude`, `hyperagent`) plus a provider command in `providers.json`. Symphony keeps
`agent-ready`; lanes never take it or Symphony's excluded labels.

The harness, not the model, owns:

| Concern | Where |
|---|---|
| Claim (serialised, `flock`) and slot locks that die with their holder | `worker()` |
| Fresh worktree from `origin/main`, `pnpm install --prefer-offline`, removal after | `run_issue()` |
| GBrain context pack in the prompt, plus the repo contract | `context_pack()`, `render_prompt()` |
| Independent verification: diff rules, biome and `vitest related` on changed files | `verify_and_land()` |
| Landing: only a gate-passing PR is marked ready and auto-merged; CI and the merge queue decide | `verify_and_land()` |
| Receipts (`runs/ledger.jsonl`), per-run log and prompt, Linear handoff comments | `run_issue()`, `worker()` |
| Retry to Todo, Triage after 3 failures | `worker()` |
| Garbage collection of crashed worktrees | `prune_worktrees()` |
| Drain-safe self-update from `origin/main` after the release's own tests pass | `update()` |

Event-driven: a worker that finishes re-execs the current release and pulls the
next issue. The minute timer only restarts idle lanes and applies updates; it never
signals a running worker.

Install on a host (Gem or a Mac) with a dedicated clone:

```sh
git clone https://github.com/JovieInc/Jovie.git ~/devin-sweep/Jovie
LANES_REPO=~/devin-sweep/Jovie scripts/lanes/install.sh
```

Per-host knobs: `LANES_SLOTS_<PROVIDER>`, `LANES_LINEAR_ENV`, `LANES_AGENT_TIMEOUT_S`.
State and receipts live under `~/.local/state/jovie-lanes`.

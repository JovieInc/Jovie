# Agent preflight receipt (`scripts/agent/preflight.sh`)

JOV-4183 — deterministic bootstrap for `/autoplan` (and other agent jobs).

## Why

Autopilot bootstrap used to burn tokens across many LLM tool round-trips
(worktree check, gstack version, GBrain ownership, goal state). One script
emits one JSON receipt; the skill makes **one** Bash call and branches on
`verdict`.

## Gate order (cheapest first)

1. **worktree** — dirty/not-a-repo hard-blocks before tooling
2. **ownership** — gbrain coordination probe (optional hard-block via env)
3. **gstack** — version/policy **read only** (never auto-upgrade here)
4. **goal** — active goal marker if present

A blocked ownership/worktree run never pays the gstack upgrade tax.

## Ownership lookup order (JOV-4185)

The ownership gate is deterministic and hard-budgeted — a semantic query can
never hang the run (the previously observed failure mode was a 90s hybrid
query hang):

1. **ledger** — `gbrain get agent-job-ledger` (canonical ownership surface,
   one deterministic read, 3s cap)
2. **keyword** — `gbrain search "<terms>" --limit 5` (keyword index, 5s cap)
3. **semantic** — `gbrain query "<terms>"` ONLY when keyword came back empty,
   capped to whatever remains of the budget

The whole gate runs under a **10s hard ceiling** (default; p95 target < 5s).
Each step is killed at its cap and falls through automatically. The winning
source (`ledger` / `keyword` / `semantic`) is recorded in
`receipt.ownership.source`; a budget-exhausted lookup records
`gbrain-timeout`. Unreachable/empty GBrain keeps the existing policy:
soft by default, hard block with `AGENT_PREFLIGHT_REQUIRE_GBRAIN=1`.

## gstack: pinned version, out-of-band upgrades (JOV-4184)

Runs consume the **pinned** installed gstack version — the receipt records it
for auditability, and the preflight **never** invokes `gstack-update-check`
in-run (it fetches the network and performs one-time migrations).
`receipt.gstack.latest` is a read-only parse of the cached
`~/.gstack/last-update-check` state file. `receipt.gstack.policy` defaults to
`pinned` when no explicit config override exists. Upgrades run out-of-band in
the nightly Hermes cron (`scripts/hermes/jobs/gstack-nightly-upgrade.ts`,
backup/restore + ops alert on failure).

## Implementation

| File | Role |
|------|------|
| `preflight-lib.mjs` | Pure evaluation + receipt builder (unit-tested) |
| `preflight.mjs` | CLI: collect git/gbrain/gstack facts → lib → JSON |
| `preflight.sh` | Thin `bash` wrapper for skill invocations |
| `preflight.test.mjs` | `node:test` unit + CLI contract tests |

## Invocation

```bash
bash scripts/agent/preflight.sh
bash scripts/agent/preflight.sh --task "ship JOV-4183"
node scripts/agent/preflight.mjs --task "ship JOV-4183"
node --test scripts/agent/preflight.test.mjs
```

Exit `0` = `verdict: go`. Exit `1` = `verdict: blocked`. Exit `2` = script error.

## Receipt schema (`agent-preflight/v1`)

```json
{
  "schema": "agent-preflight/v1",
  "ownership": {
    "owner": "string|null",
    "scope": "string|null",
    "source": "ledger|keyword|semantic|gbrain|gbrain-timeout|gbrain-empty|gbrain-missing|none",
    "reachable": true,
    "ms": 12
  },
  "worktree": {
    "clean": true,
    "detached": false,
    "branch": "tim/jov-4183-…",
    "root": "/path/to/repo",
    "dirty_paths": 0,
    "ms": 3
  },
  "gstack": {
    "installed": true,
    "version": "…",
    "latest": null,
    "policy": "unknown",
    "path": "…/gstack/bin",
    "ms": 40
  },
  "goal": {
    "active": false,
    "id": null,
    "path": null,
    "ms": 1
  },
  "verdict": "go",
  "blockers": [],
  "ms_total": 60
}
```

`blockers` items: `{ "code": string, "message": string }`.

## Skill contract

1. Run `bash scripts/agent/preflight.sh` (optionally `--task "…"`).
2. Parse the single JSON line/object from stdout.
3. If `verdict == "blocked"`, stop and report `blockers` (do not continue autoplan).
4. If the script is **missing**, fall back to the legacy multi-step preamble in the
   gstack autoplan skill (worktree / update-check / etc.).

## Env knobs

| Env | Effect |
|-----|--------|
| `AGENT_PREFLIGHT_REQUIRE_GBRAIN=1` | Empty/missing gbrain → hard block |
| `AGENT_PREFLIGHT_REQUIRE_GSTACK=1` | Missing gstack bin → hard block |
| `AGENT_PREFLIGHT_TASK` | Same as `--task` |
| `AGENT_PREFLIGHT_OWNERSHIP_BUDGET_MS` | Ownership hard ceiling (default 10000) |
| `AGENT_PREFLIGHT_LEDGER_PAGE` | Ledger page slug (default `agent-job-ledger`) |
| `GSTACK_STATE_DIR` | Override `~/.gstack` for the cached update-check read |

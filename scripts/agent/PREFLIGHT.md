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
3. **gstack** — pinned version/policy **read only** (never checks or upgrades here)
4. **goal** — active goal marker if present

A job always consumes the recorded gstack version. The Hermes nightly refresh
is the only path that checks for or installs a newer version.

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
    "source": "gbrain|gbrain-empty|gbrain-missing|none",
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
    "policy": "pinned",
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

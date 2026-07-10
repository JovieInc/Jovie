---
name: autoplan
description: |
  Auto-review pipeline with deterministic preflight receipt (JOV-4183).
  Runs scripts/agent/preflight.sh once, then the full gstack autoplan reviews.
  Use when asked to "auto review", "autoplan", "run all reviews".
---

# /autoplan — Jovie wrapper (preflight + gstack)

## 0. Deterministic preflight (MANDATORY — 1 tool call)

Before any multi-step preamble, upgrade check, or review phase, run:

```bash
bash scripts/agent/preflight.sh --task "${AUTOPLAN_TASK:-autoplan}"
```

Parse the single JSON receipt from stdout. Schema: `agent-preflight/v1` —
documented in `scripts/agent/PREFLIGHT.md`.

### Branching

| `verdict` | Action |
|-----------|--------|
| `"go"` | Continue to step 1 with receipt context (branch, gstack version, ownership). Do **not** re-run worktree cleanliness, gstack version, or ownership lookups as separate LLM tool round-trips. |
| `"blocked"` | Stop. Print each `blockers[].code` + `message`. Do not upgrade gstack, do not start CEO/design/eng reviews. |

### Fallback (script missing)

If `scripts/agent/preflight.sh` is not present (exit 127 / file missing), fall back
to the legacy multi-step preamble in the upstream skill:

```text
.agents/skills/gstack/autoplan/SKILL.md
```

(or `~/.claude/skills/gstack/autoplan/SKILL.md` if the repo copy is unavailable).

### Gate order (already encoded in the script)

1. worktree go/no-go  
2. ownership (gbrain)  
3. gstack version/policy **read only** (never auto-upgrade on blocked runs)  
4. goal state  

## 1. Full autoplan reviews

Read and follow `.agents/skills/gstack/autoplan/SKILL.md` (or the home gstack
install) for CEO → Design → Eng sequential execution, the 6 decision principles,
taste gate, and restore artifacts.

Skip any preamble steps already covered by the receipt:

- Worktree cleanliness / branch name → `receipt.worktree`
- gstack update-check / version → `receipt.gstack` (still allow intentional
  upgrade later only if `verdict == "go"` and the user/policy requires it)
- GBrain ownership / org-chart probe → `receipt.ownership`
- Active goal → `receipt.goal`

## 2. Telemetry (optional)

After the run, you may log that preflight was used:

```bash
# receipt.ms_total is the bootstrap cost in milliseconds
echo "preflight_ms=$(echo "$RECEIPT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ms_total",0))')"
```

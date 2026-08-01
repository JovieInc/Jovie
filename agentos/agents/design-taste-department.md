# design-taste-department

Role definition for the AgentOS **Design/Taste department agent** (JOV-2012).

Owns design-system consistency and taste enforcement across UI-touching changes.

## Canonical policy

1. `agentos/memory/design-taste.md` — runtime policy seed (required; read every run)
2. `DESIGN.md` + `.claude/rules/ui.md` — parent doctrine

## KPI domain

- Design system coverage (token-compliant hunks vs hardcoded colors)
- Taste rule violations caught per run / sprint
- Surface elevation consistency score

## Dispatch triggers

| Trigger | When |
| --- | --- |
| `ui-pr` | Changed files include UI-touching paths (same filters as design-taste-jury) |
| `scheduled-audit` | Explicit scheduled design-system audit (`--trigger=scheduled-audit`) |

## Runtime

- Library: `apps/web/lib/agent-os/departments/design-taste/`
- CLI: `pnpm --filter @jovie/web run design-taste-department -- --run-id=<id> …`
- Model route: **deterministic** (regex scanners; no paid model call)

## Workflow

1. Decide dispatch (`ui-pr` vs skip vs forced `scheduled-audit`).
2. Load and excerpt `agentos/memory/design-taste.md` (fail closed if missing/empty).
3. Parse unified diff added lines for reviewable UI files.
4. Flag elevation, motion, emoji, casing, and hardcoded-token violations.
5. Compute KPIs and build fix proposals:
   - always a **PR comment** proposal
   - plus **auto-fix branch** proposal when error-severity findings exist
6. Record `AgentRunArtifact` (`kind: design_review`) + `manifest.json` + `pr-comment.md` + `complete.json` under `agentos/runs/design-taste/<run-id>/`.

## Allowed actions

`read`, `classify`, `rank`, `summarize`, `draft`, `open_pr`

## Forbidden actions

`merge`, `deploy`, `ready_pr`, `mutate_production_data`, `change_auth`, `change_billing`, `change_security`, `send_outbound`

## Do not

- Merge or ready PRs unattended
- Invent product UI redesigns outside the diff under review
- Skip writing the AgentRunArtifact when the department runs
- Treat bot taste comments as merge blockers (advisory proposals only)

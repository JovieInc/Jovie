# gstack (Workflow Toolkit) + Skill Routing

This repo includes [gstack](https://github.com/garrytan/gstack) as a git submodule at `.claude/skills/gstack/`. It provides specialized workflow skills available to all AI agents.

**Conflict rule:** gstack commands are canonical. If a gstack skill conflicts with any other command or workflow, the gstack version takes precedence.

**Web browsing:** Always use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

## Available Skills

| Skill | Invocation | Purpose |
|-------|------------|---------|
| Ship | `/ship` | Automated release: merge main, run tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR |
| Review | `/review` | Pre-landing PR review for SQL safety, trust boundary violations, side effects |
| Plan (CEO) | `/plan-ceo-review` | Founder mode: rethink problems from first principles, find the 10-star product |
| Plan (Eng) | `/plan-eng-review` | Eng manager mode: lock in execution plans with architecture and edge cases |
| Browse | `/browse` | Fast headless browser (~100ms/cmd) for QA testing and site verification |
| QA | `/qa` | Systematic QA with diff-aware, full, quick, and regression modes |
| Retro | `/retro` | Weekly retrospective analyzing commit history and code quality metrics |
| Browser Cookies | `/setup-browser-cookies` | Import authenticated sessions for testing |
| Document Release | `/document-release` | Document a release |
| Perf Loop | `/perf-loop` | Autonomous performance optimization loop (fire and forget) |
| Upgrade | `/gstack-upgrade` | Upgrade gstack to latest version |

## Setup

gstack requires **Bun v1.0+**. The session-start hook installs Bun and runs setup automatically. For manual setup:

```bash
cd .claude/skills/gstack && ./setup
```

## Updating gstack

```bash
cd .claude/skills/gstack && git pull origin main && ./setup
```

Or use `/gstack-upgrade` from within Claude Code.

## Skill Routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill tool as your FIRST action. Do NOT answer directly, do NOT use other tools first. The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:

- Product ideas, "is this worth building", brainstorming → invoke `office-hours`
- Bugs, errors, "why is this broken", 500 errors → invoke `investigate`
- Ship, deploy, push, create PR → invoke `ship`
- QA, test the site, find bugs → invoke `qa`
- Code review, check my diff → invoke `review`
- Update docs after shipping → invoke `document-release`
- Weekly retro → invoke `retro`
- Design system, brand → invoke `design-consultation`
- Visual audit, design polish → invoke `design-review`
- Architecture review → invoke `plan-eng-review`

## Skill File Hygiene

gstack skill files are part of the agent control plane. Keep them fast, stable, and maintainable:

- Edit `.agents/skills/gstack/**/SKILL.md.tmpl` or generator code first. Regenerate generated `SKILL.md` files; do not hand-edit generated outputs.
- Keep leaf skills task-local: trigger conditions, required inputs, workflow, verification, output contract, and escalation only.
- Put shared routing, safety, telemetry, and generic voice rules in the root gstack template, hooks, settings, or `.claude/rules/*`.
- Put repeatable commands in scripts. Long copied shell/prose blocks increase latency and drift.
- Keep stable shared text before variable request details so provider prompt caching can work.
- Run `bun run skill:size-check` after skill-template changes. It is a ratchet, not the final target; new work should reduce skill size when practical.

## Performance Optimization Loop

`/perf-loop` runs an autonomous optimization loop that measures, experiments, and keeps only improvements. It must follow `.claude/skills/jovie-performance-hardening/SKILL.md`: baseline first, one hypothesis family per iteration, re-measure with the same method, and keep only validated wins. State is persisted to `.context/perf/` for resume capability. The skill uses `perf:loop` (performance-optimizer.ts) as its measurement primitive.

Chief/default/CFO/Founder OS/Code Orchestrator profiles must not implement performance changes directly. They create a HUD/delegation manifest and dispatch a coder/performance agent with `JOVIE_AGENT_PROFILE=coder`.

Runtime: ~30–50 minutes for a full run (4–10 iterations with builds).

## Parallel Multi-Chunk Swarms

The `/swarm` skill handles **Linear-driven** parallel agent dispatch. For ad-hoc multi-chunk work (design-system migrations, large mechanical refactors) that does not require Linear issues, use the ruflo-coordinated pattern documented in [`.claude/rules/swarm.md`](.claude/rules/swarm.md) instead.

## QA & Browse Authentication

When running `/qa` or `/browse` against local Jovie, agents **MUST** use the built-in dev auth bootstrap. See `.claude/rules/auth.md` → "QA & Browse Authentication" for the canonical local flow, persona rules, and "do not" list.

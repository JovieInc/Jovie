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

## Performance Optimization Loop

`/perf-loop` runs an autonomous optimization loop that measures, experiments, and keeps only improvements. State is persisted to `.context/perf/` for resume capability. The skill uses `perf:loop` (performance-optimizer.ts) as its measurement primitive and commits each accepted improvement atomically.

Runtime: ~30–50 minutes for a full run (4–10 iterations with builds).

## QA & Browse Authentication

When running `/qa` or `/browse` against local Jovie, agents **MUST** use the built-in dev auth bootstrap. See `.claude/rules/auth.md` → "QA & Browse Authentication" for the canonical local flow, persona rules, and "do not" list.

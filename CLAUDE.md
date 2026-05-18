# Jovie — Agent Operating Manual

Controller file for AI agents working in this repo. `AGENTS.md` is a symlink to this file. Read the scoped rule for the topic you're touching before you edit.

## Operating Principles

- Make the smallest correct change.
- Inspect existing patterns before creating new ones.
- Prefer server-side code, typed contracts, and existing package boundaries.
- Don't invent commands, env vars, routes, tables, services, or design tokens.
- Don't hide failing checks. Report exact failures and the likely cause.
- Ask before destructive operations: data deletion, irreversible migrations, credential changes, dependency replacement, auth/payment changes, or production-impacting scripts.

The four canon principles (Ship Fast, Run Experiments, Document Everything, MRR Is King) are in [`docs/company/operating-principles.md`](docs/company/operating-principles.md). They supersede [`docs/company/core-values.md`](docs/company/core-values.md) when in conflict.

## Agent Role Boundary

Orchestrated sessions must set `JOVIE_AGENT_PROFILE` before editing:

- `default` / Chief of Staff: prioritize, dispatch, verify, update HUD/Linear. Do not code.
- `cfo-milan-v2`: cost, runway, usage, spend routing. Do not code.
- `founder-os`: GTM, fundraising, applications, company facts. Do not code.
- `code-orchestrator`: plan, decompose, review, and create manifests. Do not implement.
- `coder`: implement assigned HUD/delegation manifests only.
- `no_agent`: deterministic scripts, HUD refresh, cron checks, usage ledger, GBrain sync.

If a non-coding profile discovers work that needs product/CI changes, create or update a HUD/delegation manifest with KPI, owner, profile, runtime, cost route, GBrain queries, gstack skills, expected output, and verification. Then dispatch a `coder` profile. Do not check out teammate branches, edit code, commit, push, merge, deploy, or repair CI directly from Chief/default/code-orchestrator sessions.

## Instruction Architecture

- `AGENTS.md` is the canonical cross-agent contract and is intentionally a symlink to this file. Do not replace it with a standalone file.
- Keep host-specific wrappers thin. `CODEX.md`, Claude settings, Copilot/Gemini-style wrappers, and future agent entrypoints should point back to this contract and scoped rules instead of copying policy.
- Put stable, shared instructions in this file or `.claude/rules/*`; put task-specific workflow in skills; put deterministic enforcement in hooks/settings/scripts when available.
- Generated skill outputs are derived artifacts. Edit gstack `.tmpl` source files and generator code, then regenerate; do not hand-edit generated `SKILL.md` files except to unblock a generator repair.
- Keep skill files progressively disclosed: short trigger/inputs/workflow/output in the leaf skill, detailed reference material in linked files, repeatable logic in scripts.
- Prefer stable static prefixes and variable task context later in prompts. This improves prompt-cache reuse and reduces repeated token burn.
- Use separate agent sessions or subagents for large side investigations, broad review, or research-heavy work when the host supports delegation and the task would otherwise lose context.

## Tool Versions (Verify Before Any Command)

```bash
node --version   # MUST be 22.x (22.13+)
pnpm --version   # MUST be 9.15.4
```

If wrong: `nvm use 22 && corepack prepare pnpm@9.15.4 --activate`. Always run from the repo root. Never `cd` into packages. Use `pnpm` (not npm/yarn) and `pnpm turbo` (not `npx turbo`).

Secret-bound commands MUST be prefixed with Doppler — prefer the wrapped scripts (`pnpm run dev:web:fast`, `pnpm run test:web`, etc.). Run `./scripts/setup.sh` on every fresh worktree. Full setup: [`.claude/rules/environment.md`](.claude/rules/environment.md).

## Hard Invariants (Enforced by Hooks)

These rules will block your changes if violated.

- **Migration files are immutable** → [`.claude/rules/db.md`](.claude/rules/db.md)
- **Single DB driver: `import { db } from '@/lib/db'`** → [`.claude/rules/db.md`](.claude/rules/db.md)
- **One Clerk instance per env, `/__clerk` proxy via `fetch()`** → [`.claude/rules/auth.md`](.claude/rules/auth.md)
- **No direct `middleware.ts` creation** → [`.claude/rules/security.md`](.claude/rules/security.md)
- **No `biome-ignore` comments** → [`.claude/rules/security.md`](.claude/rules/security.md)
- **No emoji in UI — use icons** → [`.claude/rules/ui.md`](.claude/rules/ui.md)
- **No native browser dialogs (`alert`/`confirm`/`prompt`)** → [`.claude/rules/ui.md`](.claude/rules/ui.md)
- **No decorative hover motion (translate/scale/lift)** → [`.claude/rules/ui.md`](.claude/rules/ui.md)
- **Subtraction principle: remove before adding** → [`.claude/rules/ui.md`](.claude/rules/ui.md)
- **Marketing/blog/legal pages must be fully static** → [`.claude/rules/ui.md`](.claude/rules/ui.md)
- **Global UI singletons render once (root layout only)** → [`.claude/rules/ui.md`](.claude/rules/ui.md)
- **CSP domains stay in sync with provider registry** → [`.claude/rules/security.md`](.claude/rules/security.md)
- **Public/webhook coordination must be durable (no in-memory state)** → [`.claude/rules/security.md`](.claude/rules/security.md)
- **Server-side external HTTP must be bounded (timeout + retry wrapper)** → [`.claude/rules/security.md`](.claude/rules/security.md)
- **Persistence-critical helpers must fail closed (throw on failure)** → [`.claude/rules/security.md`](.claude/rules/security.md)
- **Outbound email personalization must fail safe (generic fallback)** → [`.claude/rules/security.md`](.claude/rules/security.md)
- **Entitlements: single source of truth (`getCurrentUserEntitlements()`)** → [`.claude/rules/security.md`](.claude/rules/security.md)
- **Performance must not replace route UIs (same design, faster)** → [`.claude/rules/ui.md`](.claude/rules/ui.md)
- **Founder/featured-creator identity must be canonical (Tim White Spotify ID `4u`)** → [`.claude/rules/ui.md`](.claude/rules/ui.md)
- **Bot review comments (CodeRabbit, Greptile) block merge** → [`.claude/rules/release.md`](.claude/rules/release.md)
- **Conventional commits required** → [`.claude/rules/release.md`](.claude/rules/release.md)
- **Plan before executing complex tasks (3+ steps, schema changes, refactors)** → [`.claude/rules/code-style.md`](.claude/rules/code-style.md)
- **Verify before marking done (typecheck + relevant tests)** → [`.claude/rules/testing.md`](.claude/rules/testing.md)

## Repo Workflow

1. Read the relevant files before editing.
2. State the plan for multi-file or risky changes (use plan mode for 3+ steps, schema, or refactors).
3. Mark the Linear issue `In Progress` BEFORE editing files (see [`.claude/rules/linear.md`](.claude/rules/linear.md)). `Done` is automated on merge; `In Review` is automated for orchestrator-dispatched PRs but must be set manually for ad-hoc PRs.
4. Edit only files needed for the task.
5. Open a draft PR on the first push so CI runs early.
6. Run the narrowest verification (typecheck, lint, focused tests) before claiming done.
7. Summarize changed files, checks run, and remaining risks in the PR description.

## Linear (Gating, Ownership)

- Skip any issue labeled `human-review-required` or whose description contains "This issue requires human review".
- Mark issues `In Progress` before editing. `Done` is automated on merge. `In Review` is automated for orchestrator-dispatched PRs; set it manually only for ad-hoc PRs.
- File a Linear issue for any actionable follow-up, including optional/candidate work. Final answers, PR bodies, plans, and reviews must not mention "did not do X", "consider later", "deferred", "future work", or "follow-up PR" unless they include the created Linear issue ID. Do not rely on `// TODO`, `TODOS.md`, PR bullets, or chat memory.

Full contract: [`.claude/rules/linear.md`](.claude/rules/linear.md).

## Files To Treat Carefully

- `proxy.ts` middleware and route guards
- `drizzle/migrations/` (immutable on base branch)
- `apps/web/app/api/stripe/`, `/api/billing/` (money)
- `app/(onboarding)`, profile claim flow (trust)
- `apps/web/lib/entitlements/` (entitlement registry + server resolver)
- `apps/web/constants/platforms/cdn-domains.ts` (CSP source of truth)
- Design tokens (`tailwind.config.ts`, `DESIGN.md`) and `packages/ui/atoms/`
- Generated files, schema files, analytics/event schemas
- Marketing pages (must remain fully static)

## Verification (Before Claiming Done)

Run the narrowest relevant checks:

- Typecheck for TypeScript/API changes: `pnpm --filter @jovie/web run typecheck -- --pretty false`
- Lint/format for edited packages: `pnpm biome check --write apps/web`
- Unit/integration tests for changed logic: `pnpm --filter web exec vitest run <file>`
- Build for routing/config/cross-package changes

If checks are unavailable or fail for unrelated reasons, say so clearly. Paste passing output as evidence in the PR description.

The `post-task-validate.sh` hook runs at task completion and blocks if typecheck, Biome lint, server boundaries, or affected tests fail.

## Scoped Rules

Read the file for the topic you're touching. More-local instructions override this file for their scope.

| File | Topic |
|---|---|
| [`.claude/rules/environment.md`](.claude/rules/environment.md) | Local + cloud setup, Doppler, DB isolation, Turbo, worktrees, troubleshooting |
| [`.claude/rules/auth.md`](.claude/rules/auth.md) | Clerk proxy architecture, E2E auth bypass, browse auth |
| [`.claude/rules/db.md`](.claude/rules/db.md) | Single driver, immutable migrations, transaction policy |
| [`.claude/rules/ui.md`](.claude/rules/ui.md) | Design system, component hierarchy, surfaces, taste rules, marketing |
| [`.claude/rules/security.md`](.claude/rules/security.md) | CSP, webhooks, secrets, email, fail-closed persistence, entitlements |
| [`.claude/rules/release.md`](.claude/rules/release.md) | PR discipline, ship, deploy, branch strategy, bot reviews |
| [`.claude/rules/testing.md`](.claude/rules/testing.md) | E2E patterns, test perf, coverage, verify-before-done |
| [`.claude/rules/infra.md`](.claude/rules/infra.md) | Cron, API budgets, forbidden infra, cost disclosure, API runtime |
| [`.claude/rules/code-style.md`](.claude/rules/code-style.md) | TypeScript, React, server/client boundaries, canonical imports, ESLint, hooks |
| [`.claude/rules/linear.md`](.claude/rules/linear.md) | Issue gating, ownership contract |
| [`.claude/rules/gstack.md`](.claude/rules/gstack.md) | Vendored toolkit, skill routing |
| [`.claude/rules/swarm.md`](.claude/rules/swarm.md) | Ruflo-coordinated parallel swarms (pre-created worktrees, claims, ship recipe) |
| [`.claude/rules/hermes-air.md`](.claude/rules/hermes-air.md) | Always-on Hermes node (MacBook Air): voice/Telegram intake, ops crons, Linear-as-bus contract |

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill tool as your FIRST action. Full routing table (which skill handles which intent) lives in [`.claude/rules/gstack.md`](.claude/rules/gstack.md).

Skill hygiene rules:
- Do not duplicate the gstack routing table inside leaf skills.
- Do not add broad policy, telemetry, voice, or release rules to a leaf skill unless that rule is unique to the skill.
- If a skill workflow requires repeated shell logic, add or reuse a script instead of embedding long command prose in every skill.
- When changing skill templates or generators, run the focused gstack checks from `.agents/skills/gstack/CLAUDE.md`.

## gstack

Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy,
/canary, /benchmark, /browse, /open-gstack-browser, /qa, /qa-only, /design-review,
/setup-browser-cookies, /setup-deploy, /setup-gbrain, /sync-gbrain, /retro, /investigate, /document-release,
/codex, /cso, /autoplan, /perf-loop, /pair-agent, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn.

## Coding Tasks

When spawning Claude Code sessions for coding work, tell the session to use gstack skills.

Examples:
- Security audit: "Load gstack. Run /cso"
- Code review: "Load gstack. Run /review"
- QA test a URL: "Load gstack. Run /qa https://..."
- Build a feature end-to-end: "Load gstack. Run /autoplan, implement the plan, then run /ship"
- Plan before building: "Load gstack. Run /office-hours then /autoplan. Save the plan, don't implement."

## Quick Pointers

- `AGENTS.md` is a symlink to this file — do not replace it with a standalone file.
- `DESIGN.md` is the visual source of truth (read before any UI decision).
- `CODEX.md` is the Codex bootstrap wrapper.
- `apps/web/tests/TESTING.md` is the deep test reference.
- `LESSONS.md` collects post-mortems from human corrections.
- `docs/` holds reference indexes (schema map, API map, cron registry, etc.).
- `docs/company/operating-principles.md` is the four-principle canon (Ship Fast, Experiments, Document, MRR Is King).
- `docs/company/PRICING-PHILOSOPHY.md` is the canon for how pricing decisions are made; `docs/company/PRICING-STRATEGY.md` is the current snapshot; `docs/company/pricing-trends-summary.md` is the Stripe data behind the philosophy.

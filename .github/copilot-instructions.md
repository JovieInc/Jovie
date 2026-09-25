# Jovie — Copilot Instructions (thin wrapper)

**Canonical agent instructions live in [`AGENTS.md`](../AGENTS.md) (→ `CLAUDE.md`).**
If anything here conflicts with `AGENTS.md`, `AGENTS.md` wins. This file was
previously a 505-line snapshot dated 2025-01-12 that taught a retired
`develop → preview → production` branch model and told agents to ignore failing
checks — it has been reduced to this wrapper on purpose. Do not grow it back;
policy belongs in `AGENTS.md`, `/canon`, and `.claude/rules/*`.

## Non-negotiables

- **Branch model:** small PRs from feature branches → `main`, landing through
  the native GitHub merge queue. There is NO `develop`/`preview`/`production`
  branch flow. See `docs/PR_FLOW.md` and `.github/MERGE_QUEUE.md`.
- **Report exact check failures — never document-and-continue past a red
  check.** A failing typecheck/lint/test must be fixed or surfaced, not noted.
- **Toolchain:** Node version and pnpm version pins in `.nvmrc` and
  `package.json` are authoritative. `pnpm` + `pnpm turbo` only.
- **Stack:** Next.js (App Router), Neon PostgreSQL + Drizzle ORM (migrated off
  Supabase), Better Auth (Clerk is retired). See `.claude/rules/db.md` and
  `.claude/rules/auth.md`.
- **Design:** `DESIGN.md` + `.claude/rules/ui.md`.

## Where to look

| Topic | Doc |
|---|---|
| How to think / decision hierarchy | `canon/README.md` |
| How to execute (router) | `AGENTS.md` |
| Shipping / CI tiers | `docs/PR_FLOW.md` |
| Merge queue semantics | `.github/MERGE_QUEUE.md` |
| Required status checks | `.github/BRANCH_PROTECTION.md` |
| Testing | `.claude/rules/testing.md`, `docs/TESTING_STRATEGY.md` |
| Environment setup | `.claude/rules/environment.md` |

## Labels and Assignment

- **Canonical intake**: Linear only. Never create, select, or infer backlog work from GitHub Issues.
- **PR labels** (`mvp`, `area:*`, agent labels) are PR metadata, not backlog authority.
- **Assignment and priority**: Use the Linear owner, priority, and complexity contract. GitHub remains scoped to the resulting PR, Actions, and merge-queue evidence.

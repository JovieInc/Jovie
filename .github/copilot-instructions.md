# Jovie — Copilot Instructions (thin wrapper)

**Canonical agent instructions live in [`AGENTS.md`](../AGENTS.md) (→ `CLAUDE.md`).**
If anything here conflicts with `AGENTS.md`, `AGENTS.md` wins. This file was
previously a 505-line snapshot dated 2025-01-12 that taught a retired branch
model and told agents to ignore failing checks — it has been reduced to this
wrapper on purpose. Do not grow it back; policy belongs in `AGENTS.md`,
`/canon`, and `.claude/rules/*`.

## Non-negotiables

- **Branch model:** small PRs from feature branches → `main`, landing through
  the native GitHub merge queue. There is NO `develop`/`preview`/`production`
  branch flow. See `docs/PR_FLOW.md` and `.github/MERGE_QUEUE.md`.
- **Required status checks:** PR Ready, Migration Guard, Fork PR Gate,
  PR Size Guard (`.github/BRANCH_PROTECTION.md`). Build is advisory.
- **Report exact check failures — never document-and-continue past a red
  check.** A failing typecheck/lint/test must be fixed or surfaced, not noted.
- **Toolchain:** Node 22.23.1+ and pnpm 9.15.4 from the repo root
  (`corepack prepare pnpm@9.15.4 --activate`). `pnpm` + `pnpm turbo` only.
- **Stack:** Next.js 15, Neon PostgreSQL + Drizzle ORM (migrated off
  Supabase), Clerk auth. See `.claude/rules/db.md` and `.claude/rules/auth.md`.
- **Design:** `DESIGN.md` (Noir Ion) + `.claude/rules/ui.md`.

## Where to look

| Topic | Doc |
|---|---|
| How to think / decision hierarchy | `canon/README.md` |
| How to execute (router) | `AGENTS.md` |
| Shipping / CI tiers | `docs/PR_FLOW.md` |
| Merge queue semantics | `.github/MERGE_QUEUE.md` |
| Testing | `.claude/rules/testing.md`, `apps/web/tests/TESTING.md` |
| Environment setup | `.claude/rules/environment.md` |

# AGENTS.md

This file exists for tooling that expects `AGENTS.md` in the repo root.
The canonical AI agent rules live in `agents.md` (lowercase). Read that file
first and treat this one as a quick index.

## Quick start (must-do)

- Verify toolchain versions before running commands:
  - `node --version` => v24.x
  - `pnpm --version` => 9.15.4
- Run commands from the repo root with `pnpm` (not npm/yarn).

## Fast local checks (required before reporting done)

- `pnpm typecheck`
- `pnpm lint`

## CI/CD references

- `.github/CI_CD_FLOW.md` - end-to-end pipeline overview
- `.github/workflows/ci.yml` - CI job definitions
- `docs/TESTING_STRATEGY.md` - fast checks + full CI expectations

## Guardrails (high-signal)

- **Migrations are immutable:** never edit files in `drizzle/migrations/`.
- **No new middleware.ts** without explicit review.
- **No biome-ignore** comments; fix the root issue.
- **Conventional commits** required (see `agents.md` for examples).


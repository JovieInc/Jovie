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

## Pre-PR Checklist (required before opening any PR)

1. **Run `/verify`** - Self-verification: typecheck, lint, tests, security checks
2. **Run `/simplify`** - Simplify recently modified code for clarity
3. **Enable automerge** with squash:
   ```bash
   gh pr merge --auto --squash
   ```

## CI/CD references

- `.github/CI_CD_FLOW.md` - end-to-end pipeline overview
- `.github/workflows/ci.yml` - CI job definitions
- `docs/TESTING_STRATEGY.md` - fast checks + full CI expectations

## Guardrails (high-signal)

- **Migrations are immutable:** never edit files in `drizzle/migrations/`.
- **No new middleware.ts** without explicit review.
- **No biome-ignore comments; fix the root issue.** Documented exceptions are
  allowed only for: tests, a11y overrides, sanitized HTML injection, security
  exemptions, and test utilities. When an exception is used, the comment must
  include the standardized justification template so maintainers can review and
  audit existing usages: `biome-ignore: <reason>; owner: <team>; ticket: <link>`.
  Examples:
  - `// biome-ignore lint/a11y/noAutofocus: required in test; owner: web; ticket: https://example.com/ABC-123`
  - `/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML via DOMPurify; owner: platform; ticket: https://example.com/SEC-456 */`
- **Conventional commits** required (see `agents.md` for examples).
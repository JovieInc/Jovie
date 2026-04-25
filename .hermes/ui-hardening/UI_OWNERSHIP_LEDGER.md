# UI Hardening Ownership Ledger

Each writer agent must claim its file/component scope here BEFORE editing. Two writers may not own the same files at the same time.

## Reserved scopes (Wave 1 outbound)

| Scope reservation | Sub-agent | Branch prefix |
|-------------------|-----------|---------------|
| One admin table component (TBD by agent) + its skeleton/loading file | Agent 3 | `itstimwhite/ui-hardening/admin-table-stability-*` |
| One pill-heavy row/card surface OR one shared pill primitive (TBD by agent) | Agent 5 | `itstimwhite/ui-hardening/pill-stacking-*` |
| One table with score/status/icon-only column (TBD by agent) | Agent 6 | `itstimwhite/ui-hardening/right-aligned-status-*` |
| Chat route + chat layout shell + composer component | Agent 8 | `itstimwhite/ui-hardening/chat-composer-stable-*` |

## Hard collision boundaries (do NOT touch in Wave 1)

After 2026-04-23 worktree GC, the surviving in-flight token-sweep PRs are the 7 with open PRs (font-510, font-560, font-590, font-weight-tail-sweep, text-11px, text-13px, text-14px-retry). These still own:

- `apps/web/styles/design-system.css`
- `apps/web/styles/linear-tokens.css`
- `apps/web/styles/theme.css`
- `apps/web/tailwind.config.js`
- Class-sweep edits across shared components for the listed text-size and font-weight classes

If a writer's chosen surface requires touching a token file, **stop and report** rather than racing the token-sweep PRs.

## Cross-cutting "do not modify" zones

- Auth code (`apps/web/middleware.ts`, Clerk proxy paths)
- Billing/Stripe integration
- Migrations (`apps/web/lib/db/migrations`)
- Test runner config
- CI workflows (`.github/workflows`)
- DESIGN.md (only orchestrator updates with explicit user approval)

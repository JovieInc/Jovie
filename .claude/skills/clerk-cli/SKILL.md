---
name: clerk-cli
description: |
  Clerk CLI and config automation for Jovie auth debugging. Use when inspecting
  or updating Clerk users, sessions, instance config, redirect URLs, OAuth/native
  app settings, or diagnosing iOS/auth redirect failures. Invoke for any Clerk-side
  auth configuration work.
version: 2026-06-08
scope: JovieInc/Jovie
---

# clerk-cli

Agent workflow for Clerk user management, instance inspection, and auth configuration changes.

## Before any write operation

1. Confirm the target environment (`dev`, `staging`, `prod`).
2. Run `clerk whoami` (or the wrapper below) and verify the active Clerk app/instance.
3. Prefer `dev` (`sk_test_`) for automation; never bulk-experiment on production.

## Jovie instance map

| Wrapper `--instance` | Doppler config | Clerk app | Clerk instance |
|---|---|---|---|
| `dev` | `jovie-web/dev` | Jovie | `dev` |
| `staging` | `jovie-web/stg` | Jovie Preview | `prod` |
| `prod` | `jovie-web/prd` | Jovie | `prod` |

Detached worktrees are not `clerk link`ed — always use `scripts/clerk-config.ts` with explicit `--instance` so the correct app ID is passed.

## Preferred automation wrapper

Use `scripts/clerk-config.ts` for config inspection and safe mutations. It adds Doppler env injection, instance targeting, dry-run defaults, prod guards, and audit logging.

```bash
# Confirm context
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/clerk-config.ts whoami --instance dev

# Pull current config + auth-key preview
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/clerk-config.ts pull --instance dev --output /tmp/clerk-dev.json

# Diagnose missing redirect/native scheme (iOS auth failures)
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/clerk-config.ts check-redirects --pattern "myapp://|jov.ie"

# Preview a config patch (always dry-run first)
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/clerk-config.ts patch --dry-run --json '{"auth":{"redirect_urls":["..."]}}'
```

Subcommands: `whoami`, `pull`, `schema`, `patch`, `check-redirects`, `--self-test`.

## Direct Clerk CLI (users/sessions)

When the wrapper is not needed (user lookup, session revoke):

```bash
clerk auth login          # one-time browser OAuth
clerk whoami              # confirm active session
clerk users list --query email@example
clerk users get <user_id>
clerk users delete <user_id>   # irreversible — confirm first
clerk api /sessions
clerk api /sessions/<id> -X DELETE
```

For E2E test-user cleanup, prefer the repo script (metadata + email pattern aware):

```bash
doppler run --project jovie-web --config dev -- \
  pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force
```

## Common auth-fix flows

### iOS / native redirect missing

1. `check-redirects --pattern "custom-scheme://"` on the target instance.
2. `pull` or `schema` to see the current redirect/native app shape.
3. `patch --dry-run` with the corrected redirect list.
4. Re-run `check-redirects` against a pulled file (`--file`) to verify offline.
5. Apply with `--yes` on `dev` only; staging/prod require `--allow-prod` and human review.

### OAuth provider / allowed origins

1. `pull --instance <env>` and inspect `extractAuthRelevantConfigKeys` output (printed on pull).
2. `schema --instance <env>` for valid patch keys.
3. `patch --dry-run` before any apply.

### User-specific auth debug

1. `clerk users list --query <email>` to find the user ID.
2. `clerk users get <id>` for metadata and identities.
3. Use `cleanup-e2e-users.ts` for `+clerk_test` / `role: e2e` users — not arbitrary deletes.

## Safety rules (non-negotiable)

- Always `whoami` before writes.
- Mutations default to `--dry-run`; real apply needs `--yes` (dev) or `--yes --allow-prod` (staging/prod).
- `sk_live_` keys refused unless `--allow-prod`.
- `clerk users delete` is irreversible.
- Do not use production for bulk or experimental operations.
- All wrapper operations log `[clerk-config-audit ...]` lines to stderr.

## References

- Full manual: `docs/CLERK_CLI.md`
- Auth architecture + proxy rules: `.claude/rules/auth.md`
- Wrapper source + exported helpers: `scripts/clerk-config.ts`
- Unit tests: `apps/web/tests/unit/scripts/clerk-config-script.test.ts`
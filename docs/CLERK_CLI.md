# Clerk CLI — Agent Reference

The `clerk` CLI is the operator tool for managing Clerk instances, users, and sessions from the terminal. Agents use it for user management, instance inspection, and auth debugging. For full reference use the `/clerk-cli` skill.

## Installation

```bash
npm install -g clerk
clerk --version  # verify
```

## Authentication

```bash
clerk auth login   # opens browser OAuth flow (under auth subcommand) — log in with the Jovie account
clerk whoami  # confirm active session before running write operations
```

## Jovie Account Structure

Jovie has **two Clerk applications** on the account:

| Clerk Application | Environment | Host | Key Prefix |
|---|---|---|---|
| Main application (Account A) | dev | localhost / preview worktrees | `pk_test_...` |
| Main application (Account A) | production | jov.ie | `pk_live_...` |
| Staging application (Account B) | staging | staging.jov.ie | `pk_live_...` (staging project) |

When the CLI prompts you to select an application:
- Choose the **main application** for dev or production operations
- Choose the **staging application** for staging.jov.ie operations

The key pairs for each environment live in Doppler:
- Dev: `jovie-web/dev` → `pk_test_...` + dev secret key
- Staging: `CLERK_PUBLISHABLE_KEY_STAGING` + `CLERK_SECRET_KEY_STAGING`
- Production: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`

## Common Operations

### Check active context

```bash
clerk whoami
```

### User management

```bash
clerk users list                         # list all users
clerk users list --query email@example   # search by email
clerk users get <user_id>                # inspect a specific user
clerk users delete <user_id>             # delete user — IRREVERSIBLE, confirm first
```

### Session management

```bash
clerk api /sessions                     # list active sessions via Backend API
clerk api /sessions/<session_id> -X DELETE  # revoke a session (or use --yes)
```

### Instance info

```bash
clerk apps list                        # list Clerk applications (the "instances" concept in UI)
```

## Safety Rules for Agents

- **Always run `clerk whoami` before any write operation** — confirm you are targeting the intended instance
- `clerk users delete` is irreversible — always confirm with the user before running
- Do not target the production instance for any bulk or experimental operations
- Staging and production use `pk_live_...` keys; dev uses `pk_test_...` — check the key prefix to verify which instance is active

## E2E Test User Cleanup (Preferred Path)

For cleaning up test users created during E2E runs, prefer the repo's cleanup script over direct CLI — it targets the `role: 'e2e'` metadata and `+clerk_test` email pattern, not arbitrary user IDs:

```bash
doppler run --project jovie-web --config dev -- \
  pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force
```

Only use `clerk users delete` directly when you need to remove a specific user that the cleanup script cannot target.

## Related

- Full auth architecture: `.claude/rules/auth.md`
- E2E testing patterns: `docs/testing-clerk.md`
- Clerk SDK integration: `apps/web/lib/auth/`

## Automated Config Access (gh-9805)

For agent/automation use (iOS auth redirects, OAuth provider settings, allowed origins, native apps, webhooks, JWT templates, etc.), use the dedicated wrapper:

```bash
# Always via Doppler for the correct Clerk instance keys + env
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/clerk-config.ts pull --instance dev --output /tmp/clerk-dev.json

# Quick auth-relevant inspection (redirects, oauth, native, etc.)
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/clerk-config.ts check-redirects --pattern "jov.ie|myapp://|universal"

# Safe preview of a change (dry-run is default/enforced for mutations)
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/clerk-config.ts patch --dry-run --json '{"auth":{"redirect_urls":["..."]}}'

# Full schema for known keys
doppler run --project jovie-web --config dev -- \
  pnpm tsx scripts/clerk-config.ts schema --instance dev
```

**Safety (baked in, explicit):**
- `clerk whoami` + instance verification always first (audit logged to stderr).
- Mutations require `--dry-run` (or explicit `--yes --allow-prod` for prod).
- Production refused by default (sk_live_ guard).
- Reuses exact patterns from `cleanup-e2e-users.ts` / `sync-dev-clerk-ids.ts` (Doppler, sk_test_ preference, batch/confirm style).
- Also works with `clerk api --dry-run --platform` and the bundled `clerk skill` (MCP/agent integration point).

**Common iOS / redirect auth fix flow (per gh-9805 + gh-9806 context):**
1. `pull` or `check-redirects --pattern "custom-scheme://"` to diagnose missing native redirect.
2. Edit the JSON (or construct patch).
3. `patch --dry-run` (review output).
4. Re-run with `--yes` only after human or codex review for prod.

See `scripts/clerk-config.ts --help` (or --self-test) and the script source for the full Jovie Doppler mapping + pure helper exports (`extractAuthRelevantConfigKeys`, `hasMatchingRedirect` — unit-testable).

All operations are auditable via the `[clerk-config-audit ...]` lines. This delivers the self-serve path for auth config without manual Clerk dashboard access.

**gstack principles applied (gh-9805):** completeness (inspect + safe mutate), boil lakes (HOT ZONE: this + CLI only), pragmatic (immediate iOS pain), DRY (existing scripts), explicit (guards + docs), bias to action (ship small, iterate).

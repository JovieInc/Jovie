# JOV-2940: Production Neon DB Credential Exposure — Remediation

**Status:** Repo scrub in progress (HEAD + prevention). Credential rotation and history purge require human action.

**Issue:** [JOV-2940](https://linear.app/jovie/issue/JOV-2940) / [GitHub #10411](https://github.com/JovieInc/Jovie/issues/10411)

## What was exposed

| Location | Secret type | Since |
|----------|-------------|-------|
| `.claude/settings.local.json.backup` | Neon `neondb_owner` Postgres URLs (production migration commands) | ≥ 2026-01-14 |
| `docs/testing-clerk.md` | Clerk test-instance secret key + E2E user password | Unknown |

Public repo history retains these until a coordinated history rewrite completes.

## Completed in this PR (agent scope)

- [x] Remove `.claude/settings.local.json` and `.claude/settings.local.json.backup` from `HEAD`
- [x] Add `.claude/settings.local.json*` to `.gitignore`
- [x] Replace real Clerk/E2E credentials in `docs/testing-clerk.md` with placeholders
- [x] Tighten `.gitleaks.toml` (remove broad `docs/` + `*.md` allowlists; add Neon + Clerk rules)
- [x] Add `scripts/security/verify-gitleaks-coverage.sh` fixture check for CI

## Human-only actions (Tim / infra)

### 1. Rotate compromised credentials (URGENT)

1. **Neon `neondb_owner` passwords** on both exposed endpoints (`ep-noisy-wave-*`, `ep-autumn-flower-*`) via [Neon console](https://console.neon.tech) → Roles.
2. Update **Doppler** (`jovie-web` prod/preview) and **Vercel** env vars with new `DATABASE_URL` values.
3. **Clerk test-instance** `CLERK_SECRET_KEY` — rotate in Clerk Dashboard → API Keys.
4. **E2E test user password** — reset in Clerk Dashboard if the committed password was ever used in prod-like envs.

### 2. Audit Neon access logs

Review Neon project logs for unauthorized connections since **2026-01-14**.

### 3. Purge git history (required for public repo)

Removing files from `HEAD` is insufficient — history remains readable. After credential rotation:

```bash
# From a clean clone; coordinate with team — force-push rewrites all SHAs
./scripts/security/purge-settings-local-history.sh
```

See script header for prerequisites (`git-filter-repo`, backup remote, freeze merges).

### 4. Verify rotation

```bash
# Old URLs must fail auth (replace with rotated endpoint if testing)
psql "$OLD_DATABASE_URL" -c 'SELECT 1'   # expect: authentication failure
```

## Prevention

- Never commit `.claude/settings.local.json*` — use `settings.swarm.example.json` as the tracked template.
- Load real Clerk/E2E values from Doppler or local `.env.development.local` only.
- Gitleaks CI now scans docs and `.claude/` paths; fixture verification runs in `security.yml`.

## Acceptance criteria mapping

| Criterion | Owner | Status |
|-----------|-------|--------|
| New credentials live in Doppler/Vercel | Human | Pending |
| Old credentials return auth failure | Human | Pending |
| Files gone from HEAD | Agent PR | Done |
| Files purged from history | Human + script | Pending |
| Gitleaks catches leak-shaped fixture | Agent PR | Done |
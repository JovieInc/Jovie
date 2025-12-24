# Doppler Secrets Management Setup

This project uses [Doppler](https://www.doppler.com/) for centralized secrets management across development, staging, and production environments.

## Table of Contents
- [Why Doppler?](#why-doppler)
- [Project Structure](#project-structure)
- [Local Development Setup](#local-development-setup)
- [CI/CD Integration](#cicd-integration)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

## Why Doppler?

**Benefits:**
- ✅ Centralized secret management (no more `.env` files in Git)
- ✅ Automatic sync to Vercel, GitHub Actions, and other platforms
- ✅ Audit logging for all secret changes
- ✅ Role-based access control (RBAC)
- ✅ Secret versioning and rollback
- ✅ Development/staging/production environment separation

## Project Structure

**Doppler Project:** `jovie-web`

**Environments/Configs:**
- `dev` - Local development (default)
- `dev_personal` - Personal development overrides
- `stg` - Staging/preview environment
- `prd` - Production environment

## Local Development Setup

### 1. Install Doppler CLI

**macOS (Homebrew):**
```bash
brew install dopplerhq/cli/doppler
```

**Other platforms:**
```bash
curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sh
```

### 2. Authenticate

```bash
doppler login
```

This opens your browser to authenticate with your Doppler account.

### 3. Configure the Project

From the repo root:

```bash
# Set up project and config (one-time)
doppler setup --project jovie-web --config dev

# Verify setup
doppler configure get
```

### 4. Run Commands with Doppler

**Development server:**
```bash
doppler run -- pnpm dev
```

**Type checking:**
```bash
doppler run -- pnpm typecheck
```

**Tests:**
```bash
doppler run -- pnpm test
```

**Any command:**
```bash
doppler run -- <your-command>
```

### 5. Update package.json Scripts (Optional)

You can update `package.json` to use Doppler by default:

```json
{
  "scripts": {
    "dev": "doppler run -- turbo dev",
    "build": "doppler run -- turbo build",
    "test": "doppler run -- turbo test"
  }
}
```

## CI/CD Integration

### GitHub Actions

The CI workflow uses Doppler service tokens to inject secrets at runtime.

**Required GitHub Secrets:**
- `DOPPLER_TOKEN_DEV` - Service token for `dev` config (PR builds)
- `DOPPLER_TOKEN_STG` - Service token for `stg` config (preview deploys)
- `DOPPLER_TOKEN_PRD` - Service token for `prd` config (production deploys)

**How to generate service tokens:**

```bash
# For development/PR builds
doppler configs tokens create github-actions-dev --project jovie-web --config dev

# For staging
doppler configs tokens create github-actions-stg --project jovie-web --config stg

# For production
doppler configs tokens create github-actions-prd --project jovie-web --config prd
```

Add these tokens to GitHub:
```bash
gh secret set DOPPLER_TOKEN_DEV
gh secret set DOPPLER_TOKEN_STG
gh secret set DOPPLER_TOKEN_PRD
```

### Vercel Integration

Doppler syncs secrets to Vercel automatically via the Vercel integration.

**Setup:**
1. Go to <https://dashboard.doppler.com/workplace/[your-workplace]/projects/jovie-web/integrations>
2. Click "Add Integration" → "Vercel"
3. Authorize Doppler to access your Vercel account
4. Map Doppler configs to Vercel environments:
   - `dev` → Vercel Development
   - `stg` → Vercel Preview
   - `prd` → Vercel Production

**Verification:**
```bash
# Check Vercel env vars
vercel env ls
```

All secrets from Doppler should appear with source `doppler`.

## Environment Variables

### Current Variables in Doppler

To see all secrets for your current config:
```bash
doppler secrets
```

To download as `.env` format (for reference):
```bash
doppler secrets download --no-file --format env
```

### Adding New Secrets

**Via CLI:**
```bash
doppler secrets set SECRET_NAME=value --project jovie-web --config dev
```

**Via Dashboard:**
1. Go to <https://dashboard.doppler.com>
2. Select `jovie-web` project
3. Select environment (`dev`, `stg`, or `prd`)
4. Click "Add Secret"

**Best Practices:**
- Add secrets to `dev` first, then copy to `stg` and `prd`
- Use descriptive names (e.g., `STRIPE_SECRET_KEY` not `STRIPE_KEY`)
- Document required secrets in `.env.example`
- Never commit actual secret values to Git

### Migrating from .env Files

If you have existing `.env` files, you can import them:

```bash
# Import .env.local to dev config
doppler secrets upload .env.local --project jovie-web --config dev

# Import .env.production to prd config
doppler secrets upload .env.production --project jovie-web --config prd
```

**⚠️ Important:** After migration, delete local `.env.*` files (except `.env.example`).

## Troubleshooting

### "You must provide a token" Error

```bash
# Re-authenticate
doppler login

# Or verify your auth status
doppler configure get
```

### Secrets Not Updating in CI

1. Check that GitHub Secrets contain valid Doppler tokens:
   ```bash
   gh secret list
   ```

2. Verify token permissions in Doppler dashboard

3. Regenerate service token if needed:
   ```bash
   doppler configs tokens create github-actions-dev --project jovie-web --config dev
   ```

### Wrong Secrets Being Used Locally

```bash
# Check current configuration
doppler configure get

# Reset to dev
doppler setup --project jovie-web --config dev

# Or use explicit config flag
doppler run --config dev -- pnpm dev
```

### Vercel Sync Not Working

1. Check integration status: <https://dashboard.doppler.com/workplace/[your-workplace]/projects/jovie-web/integrations>
2. Verify environment mapping is correct
3. Trigger a manual sync from the Vercel integration page
4. Check Vercel dashboard to confirm secrets are present

## Additional Resources

- [Doppler Documentation](https://docs.doppler.com/)
- [Doppler CLI Reference](https://docs.doppler.com/docs/cli)
- [Doppler GitHub Actions](https://docs.doppler.com/docs/github-actions)
- [Doppler Vercel Integration](https://docs.doppler.com/docs/vercel)

## Support

If you encounter issues:
1. Check this documentation
2. Ask in #engineering Slack channel
3. Contact Doppler support: <https://doppler.com/support>

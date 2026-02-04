# Codex Setup Guide for Jovie

## Quick Start (Worktree Setup)

Run the setup script on every new worktree:

```bash
./scripts/codex-setup.sh
```

Or with a Doppler service token:

```bash
DOPPLER_TOKEN=dp.st.xxx ./scripts/codex-setup.sh
```

## Critical Requirements

| Tool | Required Version | Why |
|------|------------------|-----|
| **Node.js** | **24.x** | Runtime, build system, CI pipeline |
| **pnpm** | **9.15.4** (exact) | Package manager, workspaces |
| **Doppler** | Latest | Secrets management |

## Manual Setup (if script fails)

### 1. Node.js 24

```bash
# Via nvm (recommended)
nvm install 24
nvm use 24

# Or via fnm
fnm install 24
fnm use 24

# Verify
node --version  # Must be v24.x
```

### 2. pnpm 9.15.4

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate

# Verify
pnpm --version  # Must be 9.15.4
```

### 3. Doppler CLI

```bash
# macOS
brew install dopplerhq/cli/doppler

# Ubuntu/Debian
curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
  'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | \
  sudo gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | \
  sudo tee /etc/apt/sources.list.d/doppler-cli.list
sudo apt-get update && sudo apt-get install -y doppler

# Configure (interactive)
doppler login
doppler setup --project jovie --config dev

# Or with service token (non-interactive)
export DOPPLER_TOKEN=dp.st.xxx
doppler setup --project jovie --config dev --no-interactive
```

### 4. Install Dependencies

```bash
pnpm install
```

## Common Commands

```bash
# Development
pnpm --filter web dev          # Start web dev server (uses Doppler)

# Building
pnpm turbo build               # Build all packages
pnpm --filter web build        # Build web only

# Testing
pnpm turbo test                # Run all tests
pnpm --filter web test         # Run web tests only

# Linting & Type Checking
pnpm turbo typecheck           # Type check all
pnpm turbo lint                # Lint all

# Database
pnpm --filter web drizzle:generate   # Generate migrations
pnpm --filter web drizzle:migrate    # Apply migrations
pnpm --filter web drizzle:studio     # Open Drizzle Studio
```

## Important Rules

1. **Always run commands from repo root** - Never `cd` into packages
2. **Use pnpm, not npm/yarn** - `pnpm install`, not `npm install`
3. **Use filter for package-specific commands** - `pnpm --filter web dev`
4. **Never edit migration files** - Create new migrations instead
5. **No biome-ignore comments** - Fix the underlying issue

## Environment Variables

Secrets are managed via Doppler. The dev server automatically injects them:

```bash
pnpm --filter web dev  # Runs: doppler run -- next dev
```

For scripts that need secrets directly:

```bash
doppler run -- your-command
```

## Troubleshooting

### Wrong Node version
```bash
nvm use 24
# or
fnm use 24
```

### Wrong pnpm version
```bash
corepack prepare pnpm@9.15.4 --activate
```

### Doppler not configured
```bash
doppler login
doppler setup --project jovie --config dev
```

### Dependencies out of sync
```bash
pnpm install
```

### Turbo cache issues
```bash
rm -rf .turbo
pnpm turbo build
```

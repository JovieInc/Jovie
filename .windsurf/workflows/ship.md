---
description: Ship safely with Drizzle + CI invariants
---

# Ship Workflow (Local)

This workflow is the **local mirror of CI DB invariants** plus a safe PR push flow.

It assumes:
- Your personal dev database is configured in `.env.local` as `DATABASE_URL`.
- Drizzle schema source of truth is `lib/db/schema.ts`.
- Migrations live in `drizzle/migrations/` and must be registered in `drizzle/migrations/meta/_journal.json`.

## Steps

### One-command (recommended)
```bash
pnpm ship:pr
```

Optional flags:
- `--type feat|fix|chore`
- `--slug <kebab-slug>`
- `--goal "<1-2 sentences>"`
- `--kpi "<n/a>"`
- `--rollback "Revert PR."`
- `--dry-run` (prints commands, does not execute)

### 0. Ensure you're on a feature branch from `main`
Branch naming:
- `feat/<kebab-slug>`
- `fix/<kebab-slug>`
- `chore/<kebab-slug>`

```bash
git fetch origin
git checkout main
git pull --ff-only

# Create your branch (example)
git checkout -b fix/<kebab-slug>
```

### 1. Validate migration history (CI invariants)
```bash
pnpm run migration:guard
pnpm run migration:validate
```

### 2. Apply migrations to your personal dev DB
```bash
pnpm run drizzle:migrate
```

### 3. Validate schema drift (optional but recommended if DB-related changes)
```bash
pnpm run drizzle:check
```

### 4. Run code health checks
```bash
pnpm run typecheck
pnpm run lint
pnpm run test
```

### 4.1 One-command equivalent
```bash
pnpm ship
```

### 5. Commit and push
```bash
git status

# Commit (example)
git add -A
git commit -m "fix: <slug>"

git push -u origin HEAD
```

### 6. Open a PR to `main`
PR title format:
- `[feat]: <slug>`
- `[fix]: <slug>`
- `[chore]: <slug>`

PR body must include:
- Goal (1–2 sentences)
- KPI (if applicable)
- Rollback plan

```bash
gh pr create --base main --head HEAD --title "[fix]: <slug>" --body "## Goal\n\n<1-2 sentences>\n\n## KPI (if applicable)\n\n<n/a>\n\n## Rollback plan\n\nRevert PR."
```

### 7. Verify CI
```bash
gh pr checks --watch
```

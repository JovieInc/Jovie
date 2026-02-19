# Claude Code Configuration

All files in this directory are checked into the repo and shared across the team.

## Structure

```
.claude/
  settings.json          # Shared hooks, permissions, guardrails (tracked)
  settings.local.json    # Personal overrides (gitignored)
  config.yaml            # CI agent configuration
  commands/              # Slash commands (available as /command-name)
  hooks/                 # Shell hooks that run on agent events
  skills/                # Reusable skill definitions
  ideation/              # Stored ideation analysis results
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/ship` | Run full pre-merge validation (migrations, typecheck, lint, tests) |
| `/verify` | Self-verification checklist (13 checks including boundaries, CodeRabbit) |
| `/simplify` | Refactor recently modified code for clarity |
| `/pr` | Auto commit, push, and create PR |
| `/orchestrate` | Review and process all open PRs |
| `/check-migrations` | Check pending migration status |
| `/generate-migration` | Generate a new Drizzle migration |
| `/migrate-main` | Run migrations on main/staging |
| `/migrate-production` | Run migrations on production (requires confirmation) |
| `/neon-backup` | Create a manual Neon database backup |
| `/clean` | Run E2E smoke tests, fix console errors, open PR |
| `/perf-check` | React/Next.js performance audit |
| `/a11y-audit` | Accessibility and UX compliance audit |
| `/sonar-fix` | Fix SonarCloud findings |
| `/ideate` | Run ideation analysis for improvements |
| `/ideate-ui` | UI/UX improvement ideas |
| `/ideate-code` | Code improvement ideas |
| `/ideate-quality` | Code quality improvement ideas |
| `/ideate-perf` | Performance optimization ideas |
| `/audit-db-connections` | Audit non-standard DB connection patterns |
| `/audit-routes` | Audit hardcoded route paths |
| `/sync-permissions` | Sync permission settings |
| `/turbo-docs` | Search Turborepo documentation from the terminal |
| `/session-start-hook` | Configure session start behavior |

## Hooks

Hooks run automatically on agent events. Configured in `settings.json`.

### SessionStart
| Hook | Timeout | Purpose |
|------|---------|---------|
| `session-start.sh` | 120s | Initialize session (env checks, status) |

### PreToolUse
| Matcher | Hook | Timeout | Purpose |
|---------|------|---------|---------|
| `Bash` | `bash-safety-check.sh` | 5s | Block dangerous shell commands |
| `Edit\|Write` | `file-protection-check.sh` | 5s | Protect critical files from edits |

### PostToolUse
| Matcher | Hook | Timeout | Purpose |
|---------|------|---------|---------|
| `Edit\|Write` | `lint-check.sh` | 30s | Run ESLint on modified files |
| `Edit\|Write` | `typecheck.sh` | 120s | TypeScript type check |
| `Edit\|Write` | `console-check.sh` | 5s | Flag console.* usage |
| `Edit\|Write` | `ts-strict-check.sh` | 5s | Enforce strict TypeScript patterns |
| `Edit\|Write` | `file-size-check.sh` | 5s | Enforce file size limits |
| `Edit\|Write` | `db-patterns-check.sh` | 5s | Validate DB usage patterns |

### Stop
| Hook | Timeout | Purpose |
|------|---------|---------|
| `post-task-validate.sh` | 300s | End-of-task validation gate |

The Stop hook runs when Claude finishes a task. It:
1. Skips if no code changes (research/chat tasks pass through)
2. Runs automated checks: TypeScript, Biome lint, server/client boundaries, affected tests
3. On first stop: blocks to request `/simplify` and `/coderabbit:review`
4. On second stop: re-validates and allows completion if clean

## Skills

| Skill | Description |
|-------|-------------|
| `coderabbit-review` | Run CodeRabbit AI code review on changes |
| `consolidate-ui` | Consolidate UI component patterns |
| `turborepo` | Turborepo monorepo expert (builds, caching, worktrees, OOM) |

## Adding New Commands

1. Create a markdown file in `.claude/commands/your-command.md`
2. Add YAML frontmatter with `description` and `tags`
3. Add `Skill(your-command)` to `settings.json` permissions if needed
4. The command is immediately available as `/your-command`

## Adding New Hooks

1. Create a shell script in `.claude/hooks/your-hook.sh`
2. Make it executable: `chmod +x .claude/hooks/your-hook.sh`
3. Register it in `settings.json` under the appropriate event
4. Hook receives context on stdin as JSON, exits 0 (pass) or non-zero (block)

## Local Overrides

Use `settings.local.json` for personal settings (gitignored). It merges with `settings.json`.

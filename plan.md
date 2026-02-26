# Agent Skills Migration Plan

## Research Findings

### Platform Support Summary

| Platform | Supports agentskills.io | Skills Directory | Status |
|----------|------------------------|------------------|--------|
| **Claude Code** | Yes (created the standard) | `.claude/skills/` | Native support |
| **Windsurf Cascade** | Yes (since Jan 2026) | `.windsurf/skills/` | Full support |
| **OpenAI Codex** | Yes (adopted weeks after launch) | Reads SKILL.md format | Full support |
| **CodeRabbit** | Yes (coderabbitai/skills repo) | `.coderabbit/skills/` | Full support |
| **Also supported** | Cursor, Gemini CLI, GitHub Copilot, OpenCode, Mistral Vibe, Manus | Varies | 30+ tools total |

### Current State of Jovie Skills

| Location | Count | Format | Purpose |
|----------|-------|--------|---------|
| `.claude/skills/` | 5 files | Flat .md with `description` frontmatter | Auto-invoked context skills |
| `.claude/commands/` | 28 files | Flat .md (some with frontmatter) | User-invocable slash commands |
| `.windsurf/workflows/` | 6 files | Flat .md with `description` frontmatter | Windsurf workflows |
| `.cursor/rules/` | 3 files | .mdc format | Cursor-specific rules |
| `.coderabbit.yaml` | 1 file | YAML config | CodeRabbit config |

### Overlapping Content (duplicated today)

| Skill | `.claude/commands/` | `.windsurf/workflows/` | Content Drift? |
|-------|--------------------|-----------------------|----------------|
| ship | Yes | Yes (different — Windsurf has Drizzle+CI flow) | Yes |
| clean | Yes | Yes (similar but not identical) | Minor |
| simplify | Yes | Yes (nearly identical) | Minimal |
| verify | Yes | Yes (Claude version is more comprehensive) | Yes |
| sonar-fix | Yes | Yes (nearly identical) | Minimal |
| release | No | Yes | N/A |

---

## Migration Plan

### Approach: Canonical `.agent/skills/` with Symlinks

Create `.agent/skills/` as the single source of truth, then symlink from each tool's directory.

### Phase 1: Create `.agent/skills/` directory with universal skills

Convert these 13 skills/commands to agentskills.io format (directory + SKILL.md):

```
.agent/skills/
├── ship/
│   └── SKILL.md
├── verify/
│   └── SKILL.md
├── simplify/
│   └── SKILL.md
├── clean/
│   └── SKILL.md
├── sonar-fix/
│   └── SKILL.md
├── perf-check/
│   └── SKILL.md
├── a11y-audit/
│   └── SKILL.md
├── coderabbit-review/
│   └── SKILL.md
├── turborepo/
│   └── SKILL.md
├── consolidate-ui/
│   └── SKILL.md
├── entitlements/
│   └── SKILL.md
├── release/
│   └── SKILL.md
└── pr/
    └── SKILL.md
```

Each SKILL.md uses the agentskills.io frontmatter format:
```yaml
---
name: skill-name
description: What this skill does and when to use it.
metadata:
  author: JovieInc
  version: "1.0"
compatibility: Universal — works with Claude Code, Windsurf, Codex, CodeRabbit
---
```

The body content will be the **merged best-of-both** from Claude commands and Windsurf workflows (picking the more comprehensive version, resolving drift).

### Phase 2: Symlink from tool-specific directories

```bash
# Claude Code
rm -rf .claude/skills
ln -s ../../.agent/skills .claude/skills

# Windsurf (replace workflows with skills symlink)
mkdir -p .windsurf
ln -s ../.agent/skills .windsurf/skills

# Keep .windsurf/workflows/ for Windsurf-only workflows (release.md) until migrated
```

### Phase 3: Keep tool-specific content where it belongs

**Stay in `.claude/commands/`** (15 commands — Claude-specific or infrastructure):
- `autopilot.md` — Claude Agent Teams orchestrator
- `orchestrate.md` — PR processing with agent assignment
- `swarm.md` — Parallel agent dispatch (uses Claude Task tool)
- `session-start-hook.md` — Claude Code SessionStart hook
- `check-migrations.md` — DB migration status check
- `generate-migration.md` — Drizzle migration generation
- `migrate-main.md` — Main/staging DB migration
- `migrate-production.md` — Production DB migration
- `neon-backup.md` — Neon database backup
- `sync-permissions.md` — Permissions sync
- `audit-db-connections.md` — DB connection audit
- `audit-routes.md` — Route audit
- `turbo-docs.md` — Turbo docs search
- `ideate.md` + `ideate-*.md` (5 files) — Ideation suite (Claude workflow)

**Stay in `.cursor/rules/`** (Cursor-specific format):
- `clerk.mdc`, `general.mdc`, `icons.mdc`

**Stay in `.coderabbit.yaml`** (CodeRabbit-specific config)

### Phase 4: Remove `.claude/skills/parallel-agents.md`

This skill is Claude-specific (references Task tool, bypassPermissions mode). Keep the equivalent content in `.claude/commands/swarm.md` which already covers this use case.

### Phase 5: Update `.windsurf/workflows/`

Remove Windsurf workflow files that are now covered by `.agent/skills/`:
- `clean.md` → covered by `.agent/skills/clean/SKILL.md`
- `simplify.md` → covered by `.agent/skills/simplify/SKILL.md`
- `verify.md` → covered by `.agent/skills/verify/SKILL.md`
- `sonar.md` → covered by `.agent/skills/sonar-fix/SKILL.md`
- `ship.md` → covered by `.agent/skills/ship/SKILL.md`

Keep `release.md` in `.windsurf/workflows/` until it's been migrated to universal.

---

## Content Merging Strategy (for drift resolution)

For skills that exist in both Claude and Windsurf with different content:

| Skill | Resolution |
|-------|-----------|
| **ship** | Merge: Claude's simple 3-step check + Windsurf's Drizzle/CI invariants into unified skill |
| **verify** | Use Claude version (12 checks) as base — it's a superset of Windsurf's 7 checks |
| **clean** | Merge: Claude has specific test file paths + Windsurf has broader constraints |
| **simplify** | Nearly identical — use Claude version (has Jovie-specific patterns section) |
| **sonar-fix** | Nearly identical — use either (both are comprehensive) |

---

## Final Directory Structure

```
Jovie/
├── .agent/
│   └── skills/           # Canonical source of truth (13 universal skills)
│       ├── ship/SKILL.md
│       ├── verify/SKILL.md
│       ├── simplify/SKILL.md
│       ├── clean/SKILL.md
│       ├── sonar-fix/SKILL.md
│       ├── perf-check/SKILL.md
│       ├── a11y-audit/SKILL.md
│       ├── coderabbit-review/SKILL.md
│       ├── turborepo/SKILL.md
│       ├── consolidate-ui/SKILL.md
│       ├── entitlements/SKILL.md
│       ├── release/SKILL.md
│       └── pr/SKILL.md
├── .claude/
│   ├── skills -> ../.agent/skills  # Symlink
│   └── commands/         # 15 Claude-specific commands (unchanged)
├── .windsurf/
│   ├── skills -> ../.agent/skills  # Symlink
│   └── workflows/
│       └── release.md    # Windsurf-only (kept until migrated)
├── .cursor/
│   └── rules/            # Cursor-specific (unchanged)
└── .coderabbit.yaml      # CodeRabbit-specific (unchanged)
```

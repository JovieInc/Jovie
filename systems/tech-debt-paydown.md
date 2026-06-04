---
type: concept
title: Tech Debt Paydown
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-03T07:46:35.982Z'
source_kind: 'mcp:put_page'
---

# Tech Debt Paydown System

## Philosophy

Technical debt is like a high-interest loan: it's almost always better to pay it down continuously in small increments than to let it compound and tackle it in painful bursts.

## Components

### 1. TECH_DEBT_REGISTRY.md (Jovie Repo)
Living document tracking all debt items. Located at `TECH_DEBT_REGISTRY.md` in repo root.
- Schema: id, file, line, category, interest (1-5), status, auto_fixable, fix_strategy, discovered, last_seen
- Interest 1 = cosmetic, 5 = critical (security/crashes)
- Status flow: discovered → open → in-progress → fixed

### 2. tech-debt-scanner.py
Scans codebase for TODO/FIXME/HACK/XXX/DEBT markers + runs ruff check.
Outputs JSON registry + updates TECH_DEBT_REGISTRY.md.
Deduplicates on file+line+category+description.

### 3. tech-debt-paydown.py
Reads scan results, sorts by interest × recency.
- Auto-fixes ruff-fixable items (dead code, unused imports, formatting)
- Creates PR for auto-fixable batch
- Groups remaining items into "debt sprints" (5-8 items)
- Flags high-interest items (4-5) needing human attention

### 4. Skills Eval Framework
- `skills-eval-harness.py`: Tests structure, completeness, quality of each skill
- `skills-eval-runner.py`: Runs harness on all 66 skills, tracks history
- 3 scenarios per skill: structure, completeness, quality
- Consecutive failures (2+) flagged for auto-patch

### 5. Cron Jobs
| Job | Frequency | Purpose |
|-----|-----------|---------|
| tech-debt-scan | Every 6h | Scan + update registry |
| tech-debt-paydown | 6AM + 6PM daily | Auto-fix + PR + sprint grouping |
| skills-eval-weekly | Sunday 4AM | Evaluate all skills |

## Automation Rules
- Snoozed > 30 days → interest +1 (debt compounds)
- Snoozed > 90 days → auto-escalate to open
- Red-teaming skills excluded from evals
- Max 15 auto-fixes per paydown run (small increments)

## Related
- `/sonar-fix` concept: auto-fix sonar/code-quality issues (built into ruff scanner)
- JovieInc/Jovie = canonical repo
- Skills at ~/.hermes/skills/ (66 across 19 categories)

## Created
2026-06-03 by Summer for Tim White

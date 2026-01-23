---
description: Discover code-revealed improvement opportunities
tags: [ideation, code, patterns, features]
---

# /ideate code - Code Improvements Ideation

Discover improvement opportunities by analyzing existing patterns, architecture, and infrastructure. Find features that naturally emerge from understanding what patterns exist and how they can be extended.

**Key Principle**: Find opportunities the CODE reveals. These are features and improvements that emerge from understanding existing patterns - not strategic product planning.

## Arguments

- `[path]` - Target directory (default: `apps/web`)

## Phase 1: Query Linear Context

```
mcp__claude_ai_Linear__list_issues:
- team: "Jovie"
- label: "enhancement" OR "feature"
- limit: 50
```

Store existing enhancement IDs to avoid duplicates.

## Phase 2: Discover Existing Patterns

### 2.1 Find Replicable Patterns

```bash
# Find API routes that could have siblings
ls -la apps/web/app/api/

# Find components that follow patterns
ls -la apps/web/components/dashboard/
ls -la apps/web/components/organisms/

# Find hooks that could be extended
grep -r "export function use" --include="*.ts" apps/web/lib/hooks/ | head -20

# Find utilities that could have more methods
ls -la apps/web/lib/
grep -r "export function" --include="*.ts" apps/web/lib/utils/ | head -20
```

### 2.2 Analyze CRUD Operations

```bash
# Find existing CRUD patterns
grep -r "create\|update\|delete" --include="*.ts" apps/web/app/api/ | head -30

# Find database operations
grep -r "db\." --include="*.ts" apps/web/ | head -30

# Find server actions
grep -r "use server" --include="*.ts" apps/web/ | head -20
```

### 2.3 Find Configuration Patterns

```bash
# Find hardcoded values that could be configurable
grep -rE "const [A-Z_]+ = [0-9]+" --include="*.ts" apps/web/ | head -20

# Find feature flags
grep -r "feature\|flag\|toggle" --include="*.ts" apps/web/ | head -15
```

## Phase 3: Identify Opportunity Categories

### A. Pattern Extensions (trivial - medium)
- Existing CRUD for one entity → CRUD for similar entity
- Existing filter for one field → Filters for more fields
- Existing export format → Additional export formats
- Existing validation for one type → Validation for similar types

### B. Architecture Opportunities (medium - large)
- Data model supports feature X with minimal changes
- API structure enables new endpoint types
- Component architecture supports new views/modes
- State management pattern enables new features

### C. Configuration/Settings (trivial - small)
- Hard-coded values that could be user-configurable
- Missing user preferences following existing patterns
- Feature toggles extending existing patterns

### D. Utility Additions (trivial - medium)
- Existing validators that could validate more cases
- Existing formatters that could handle more formats
- Existing helpers that could have related helpers

## Phase 4: Analyze Specific Opportunities

For each promising opportunity:

```bash
# Examine the pattern file
cat [file_path] | head -100

# See how it's used
grep -r "[function_name]" --include="*.ts" apps/web/ | head -10

# Check for related implementations
ls -la $(dirname [file_path])
```

For each opportunity, analyze:
1. **Pattern Location**: Where does the pattern exist?
2. **Extension Opportunity**: What could be added/changed?
3. **Affected Files**: What files would change?
4. **Existing Code Reuse**: What can be reused?
5. **Effort Level**: trivial|small|medium|large

## Phase 5: Generate Output

Write findings to `.claude/ideation/code-ideas.json`:

```json
{
  "generated_at": "ISO timestamp",
  "scope": "apps/web",
  "linear_issues_checked": 50,
  "ideas": [
    {
      "id": "code-001",
      "title": "Short descriptive title",
      "description": "What the improvement does",
      "rationale": "Why the code reveals this opportunity",
      "builds_upon": ["Existing feature/pattern it extends"],
      "category": "pattern_extension|architecture|configuration|utility",
      "affected_files": ["apps/web/path/to/file.ts"],
      "existing_patterns": ["Pattern to follow"],
      "implementation_approach": "How to implement using existing code",
      "effort": "trivial|small|medium|large",
      "priority": "low|medium|high",
      "related_linear_issues": []
    }
  ],
  "summary": {
    "total_ideas": 0,
    "by_category": {},
    "by_effort": {},
    "by_priority": {}
  }
}
```

## Effort Levels

| Level | Time | Description |
|-------|------|-------------|
| trivial | 1-2 hours | Direct copy with minor changes |
| small | Half day | Clear pattern, some new logic |
| medium | 1-3 days | Pattern exists but needs adaptation |
| large | 3-7 days | Architectural pattern enables new capability |

## Output Summary

```markdown
## Code Improvements Ideation Complete

### Patterns Analyzed
- API routes: {count}
- Components: {count}
- Hooks: {count}
- Utilities: {count}

### Ideas Generated: {total}

| Category | Count | Effort Distribution |
|----------|-------|---------------------|
| Pattern Extensions | X | trivial: X, small: X |
| Architecture | X | medium: X, large: X |
| Configuration | X | trivial: X, small: X |
| Utilities | X | trivial: X, small: X |

### Top Opportunities
1. {title} - extends {pattern} - {effort}
2. {title} - extends {pattern} - {effort}

### Output
Ideas saved to: `.claude/ideation/code-ideas.json`
```

## Critical Rules

1. **Only Suggest Pattern-Based Ideas** - If the pattern doesn't exist, it's not code-revealed
2. **Be Specific About Files** - List actual files that would change
3. **Reference Real Patterns** - Point to actual code in the codebase
4. **No Strategic Thinking** - Focus on what code reveals, not product decisions
5. **Justify Effort Levels** - Each level should have clear reasoning

## Jovie-Specific Patterns

When analyzing, look for these established patterns:
- TanStack Query hooks in `lib/hooks/`
- Server actions in `app/actions/`
- API routes following RESTful patterns
- Drizzle schema patterns in `lib/db/schema/`
- Zod validation schemas
- `@jovie/ui` component variants
---
description: Identify code quality and refactoring opportunities
tags: [ideation, quality, refactoring, tech-debt]
---

# /ideate quality - Code Quality Ideation

Analyze the codebase to identify refactoring opportunities, code smells, best practice violations, and areas that could benefit from improved code quality.

## Arguments

- `[path]` - Target directory (default: `apps/web`)

## Phase 1: Query Linear Context

```
mcp__claude_ai_Linear__list_issues:
- team: "Jovie"
- label: "refactoring" OR "tech-debt"
- limit: 50
```

Store existing issue IDs to avoid duplicates.

## Phase 2: Large File Analysis

### 2.1 Find Large Files

```bash
# Find TypeScript files and their sizes
find apps/web -name "*.ts" -o -name "*.tsx" | xargs wc -l 2>/dev/null | sort -rn | head -20

# Check specific directories
wc -l apps/web/components/**/*.tsx 2>/dev/null | sort -rn | head -15
wc -l apps/web/lib/**/*.ts 2>/dev/null | sort -rn | head -15
```

Flag files exceeding thresholds:
- Component files > 400 lines
- Utility/service files > 600 lines
- Any file > 800 lines

### 2.2 Analyze Large Files

For each large file:
```bash
# Check exports and responsibilities
grep -E "export (function|const|class)" [file_path] | head -20

# Check imports for cohesion
head -50 [file_path]
```

## Phase 3: Code Smell Detection

### 3.1 Long Functions

```bash
# Find function definitions and estimate lengths
grep -n "function\|const.*=.*=>" --include="*.ts" --include="*.tsx" apps/web/lib/ | head -30
```

### 3.2 Deep Nesting

```bash
# Find deeply nested code (multiple indentation levels)
grep -rE "^\s{12,}" --include="*.ts" --include="*.tsx" apps/web/ | head -20
```

### 3.3 Complex Conditionals

```bash
# Find complex ternaries
grep -rE "\?.*\?.*:" --include="*.tsx" apps/web/components/ | head -15

# Find long if-else chains
grep -rB2 -A2 "else if" --include="*.ts" apps/web/ | head -30
```

### 3.4 Code Duplication

```bash
# Find similar function names suggesting duplication
grep -rh "export function" --include="*.ts" apps/web/ | sort | uniq -d

# Find repeated patterns
grep -rE "\.map\(.*=>" --include="*.tsx" apps/web/components/ | head -20
```

## Phase 4: Type Safety Analysis

### 4.1 Check for `any` Usage

```bash
# Find explicit any types
grep -r ": any" --include="*.ts" --include="*.tsx" apps/web/ | wc -l
grep -r ": any" --include="*.ts" --include="*.tsx" apps/web/ | head -20

# Find type assertions
grep -r "as any" --include="*.ts" --include="*.tsx" apps/web/ | head -15
```

### 4.2 Missing Return Types

```bash
# Find exported functions without explicit return types
grep -rE "export (async )?function \w+\([^)]*\) \{" --include="*.ts" apps/web/ | head -20
```

## Phase 5: Dead Code Detection

### 5.1 Unused Exports

```bash
# Find exports and check usage
grep -rh "export const\|export function" --include="*.ts" apps/web/lib/ | head -30
```

### 5.2 Commented Code

```bash
# Find commented-out code blocks
grep -rE "^\s*//.*function|^\s*//.*const|^\s*//.*return" --include="*.ts" apps/web/ | head -15
```

## Phase 6: Generate Output

Write findings to `.claude/ideation/quality-ideas.json`:

```json
{
  "generated_at": "ISO timestamp",
  "scope": "apps/web",
  "linear_issues_checked": 50,
  "ideas": [
    {
      "id": "qual-001",
      "title": "Split large API handler file into domain modules",
      "description": "What needs refactoring",
      "rationale": "Why this improves code quality",
      "category": "large_files|code_smells|complexity|duplication|types|dead_code",
      "severity": "critical|major|minor|suggestion",
      "affected_files": ["apps/web/path/to/file.ts"],
      "current_state": "Description of current state",
      "proposed_change": "Specific refactoring to perform",
      "code_example": "Before/after code if helpful",
      "best_practice": "Principle this follows (SRP, DRY, etc.)",
      "metrics": {
        "line_count": null,
        "complexity": null,
        "duplicate_lines": null
      },
      "effort": "trivial|small|medium|large",
      "priority": "low|medium|high",
      "breaking_change": false,
      "prerequisites": [],
      "related_linear_issues": []
    }
  ],
  "metadata": {
    "files_analyzed": 0,
    "large_files_found": 0,
    "any_usages_found": 0,
    "potential_duplications": 0
  },
  "summary": {
    "total_ideas": 0,
    "by_category": {},
    "by_severity": {},
    "by_effort": {}
  }
}
```

## Severity Classification

| Severity | Description | Examples |
|----------|-------------|----------|
| critical | Blocks development, causes bugs | Circular deps, type errors |
| major | Significant maintainability impact | Large files, high complexity |
| minor | Should be addressed but not urgent | Duplication, naming |
| suggestion | Nice to have | Style consistency |

## Output Summary

```markdown
## Code Quality Ideation Complete

### Analysis Metrics
- Files analyzed: {count}
- Large files (>400 lines): {count}
- `any` type usages: {count}
- Potential duplications: {count}

### Ideas Generated: {total}

| Category | Count | Severity |
|----------|-------|----------|
| Large Files | X | major: X |
| Code Smells | X | minor: X |
| Complexity | X | major: X |
| Duplication | X | minor: X |
| Type Safety | X | minor: X |
| Dead Code | X | suggestion: X |

### Top Refactoring Candidates
1. {file} - {line_count} lines - {reason}
2. {file} - {issue} - {severity}

### Output
Ideas saved to: `.claude/ideation/quality-ideas.json`
```

## Critical Rules

1. **Prioritize Impact** - Focus on issues affecting maintainability
2. **Provide Clear Steps** - Each finding includes how to fix
3. **Consider Breaking Changes** - Flag refactorings that might break tests
4. **Be Realistic About Effort** - Accurately estimate work required
5. **Include Code Examples** - Show before/after when helpful

## Jovie-Specific Standards

When analyzing quality, consider:
- Biome linting rules from biome.json
- TypeScript strict mode settings
- `cn()` usage for class merging
- TanStack Query patterns (not custom data hooks)
- Sentry for logging (no console.*)
- Explicit return types on exported functions
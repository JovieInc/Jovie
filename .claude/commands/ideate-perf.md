---
description: Identify performance optimization opportunities
tags: [ideation, performance, optimization, bundle]
---

# /ideate perf - Performance Optimizations Ideation

Analyze the codebase to identify performance bottlenecks, optimization opportunities, and efficiency improvements across bundle size, runtime, and network.

## Arguments

- `[path]` - Target directory (default: `apps/web`)

## Phase 1: Query Linear Context

```
mcp__claude_ai_Linear__list_issues:
- team: "Jovie"
- label: "performance" OR "optimization"
- limit: 50
```

Store existing issue IDs to avoid duplicates.

## Phase 2: Bundle Size Analysis

### 2.1 Check Dependencies

```bash
# Analyze package.json for large dependencies
cat apps/web/package.json | head -100

# Check for duplicate dependencies
grep -r "\"dependencies\"" -A 50 package.json apps/*/package.json | head -100
```

### 2.2 Find Import Patterns

```bash
# Find full library imports (should be tree-shaken)
grep -rE "import .* from ['\"]lodash['\"]" --include="*.ts" --include="*.tsx" apps/web/ | head -10
grep -rE "import .* from ['\"]date-fns['\"]" --include="*.ts" --include="*.tsx" apps/web/ | head -10

# Find large component imports
grep -rE "import.*from.*@radix-ui" --include="*.tsx" apps/web/ | head -20
```

### 2.3 Check Dynamic Imports

```bash
# Find dynamic import usage
grep -r "dynamic(" --include="*.tsx" apps/web/ | head -15
grep -r "import(" --include="*.ts" --include="*.tsx" apps/web/ | head -15

# Find heavy components that could be lazy loaded
ls -la apps/web/components/dashboard/organisms/
```

## Phase 3: Runtime Performance

### 3.1 Find Inefficient Patterns

```bash
# Find nested loops (potential O(n²))
grep -rE "\.forEach.*\.forEach|\.map.*\.map|\.filter.*\.filter" --include="*.ts" apps/web/ | head -15

# Find expensive operations in renders
grep -rE "\.filter\(|\.map\(|\.reduce\(" --include="*.tsx" apps/web/components/ | head -20
```

### 3.2 Check Memoization

```bash
# Find useMemo usage
grep -r "useMemo" --include="*.tsx" apps/web/components/ | wc -l

# Find useCallback usage
grep -r "useCallback" --include="*.tsx" apps/web/components/ | wc -l

# Find components that might need React.memo
grep -rE "export (default )?function [A-Z]" --include="*.tsx" apps/web/components/ | head -30
```

### 3.3 Find Re-render Triggers

```bash
# Find inline objects/arrays in JSX (cause re-renders)
grep -rE "style=\{\{|className=\{[^}]*\+" --include="*.tsx" apps/web/ | head -15

# Find inline function definitions in JSX
grep -rE "onClick=\{[^}]*=>" --include="*.tsx" apps/web/components/ | head -20
```

## Phase 4: Database & Network

### 4.1 Check Query Patterns

```bash
# Find database queries
grep -r "db\." --include="*.ts" apps/web/ | head -30

# Find N+1 potential (loops with queries)
grep -rB5 "await db\." --include="*.ts" apps/web/ | grep -E "for|forEach|map" | head -10

# Find queries without limits
grep -r "findMany\|select\|from(" --include="*.ts" apps/web/ | grep -v "limit\|take" | head -15
```

### 4.2 Check API Patterns

```bash
# Find fetch calls
grep -r "fetch(" --include="*.ts" --include="*.tsx" apps/web/ | head -20

# Find TanStack Query usage (check for proper caching)
grep -r "useQuery\|useMutation" --include="*.tsx" apps/web/ | head -20
```

## Phase 5: React-Specific Optimizations

### 5.1 Component Size

```bash
# Find large component files (potential split candidates)
find apps/web/components -name "*.tsx" | xargs wc -l 2>/dev/null | sort -rn | head -15
```

### 5.2 List Virtualization

```bash
# Find list rendering that might need virtualization
grep -rE "\.map\(.*=>" --include="*.tsx" apps/web/components/ | head -30

# Check for existing virtualization
grep -r "virtual\|Virtualized\|useVirtual" --include="*.tsx" apps/web/ | head -10
```

### 5.3 Image Optimization

```bash
# Find image usage
grep -rE "<img|<Image" --include="*.tsx" apps/web/ | head -20

# Check for Next.js Image component usage
grep -r "next/image" --include="*.tsx" apps/web/ | head -15
```

## Phase 6: Generate Output

Write findings to `.claude/ideation/perf-ideas.json`:

```json
{
  "generated_at": "ISO timestamp",
  "scope": "apps/web",
  "linear_issues_checked": 50,
  "ideas": [
    {
      "id": "perf-001",
      "title": "Replace moment.js with date-fns for bundle reduction",
      "description": "What the optimization does",
      "rationale": "Why this improves performance",
      "category": "bundle_size|runtime|memory|database|network|rendering|caching",
      "impact": "high|medium|low",
      "affected_files": ["apps/web/path/to/file.ts"],
      "current_metric": "Bundle includes 300KB for moment.js",
      "expected_improvement": "~270KB reduction, ~20% faster load",
      "implementation": "Step-by-step implementation guide",
      "tradeoffs": "Any downsides to consider",
      "effort": "trivial|small|medium|large",
      "priority": "low|medium|high",
      "related_linear_issues": []
    }
  ],
  "metadata": {
    "large_dependencies": [],
    "memoization_opportunities": 0,
    "potential_n_plus_one": 0
  },
  "summary": {
    "total_ideas": 0,
    "by_category": {},
    "by_impact": {},
    "potential_bundle_savings": "0KB"
  }
}
```

## Impact Classification

| Impact | Description | User Experience |
|--------|-------------|-----------------|
| high | Major improvement visible to users | Significantly faster load/interaction |
| medium | Noticeable improvement | Moderately improved responsiveness |
| low | Minor improvement | Subtle, mostly developer benefit |

## Common Anti-Patterns to Flag

### Bundle Size
```javascript
// BAD: Full library import
import _ from 'lodash';

// GOOD: Tree-shakeable import
import map from 'lodash/map';
```

### Runtime
```javascript
// BAD: O(n²) lookup
users.forEach(user => {
  const match = posts.find(p => p.userId === user.id);
});

// GOOD: O(n) with Map
const postMap = new Map(posts.map(p => [p.userId, p]));
users.forEach(user => postMap.get(user.id));
```

### React Rendering
```jsx
// BAD: Inline function causes re-render
<Button onClick={() => handleClick(id)} />

// GOOD: Memoized callback
const handleButtonClick = useCallback(() => handleClick(id), [id]);
<Button onClick={handleButtonClick} />
```

## Output Summary

```markdown
## Performance Ideation Complete

### Analysis Areas
- Dependencies analyzed: {count}
- Components checked: {count}
- Database queries reviewed: {count}

### Ideas Generated: {total}

| Category | Count | Impact |
|----------|-------|--------|
| Bundle Size | X | high: X, medium: X |
| Runtime | X | high: X, medium: X |
| Database | X | high: X, medium: X |
| Rendering | X | medium: X, low: X |
| Network | X | medium: X |

### Estimated Improvements
- Bundle size reduction: ~{X}KB
- Render optimizations: {count} components

### Top Optimizations
1. {title} - {impact} impact - {expected_improvement}
2. {title} - {impact} impact - {expected_improvement}

### Output
Ideas saved to: `.claude/ideation/perf-ideas.json`
```

## Critical Rules

1. **Measure First** - Suggest profiling before and after
2. **Quantify Impact** - Include expected improvements (%, ms, KB)
3. **Consider Tradeoffs** - Note any downsides (complexity, maintenance)
4. **Prioritize User Impact** - Focus on user-facing performance
5. **Avoid Premature Optimization** - Don't suggest micro-optimizations

## Jovie-Specific Context

When analyzing performance, consider:
- Next.js 15 App Router with server components
- TanStack Query for client-side caching
- Drizzle ORM for database queries
- Vercel deployment (edge functions available)
- `@jovie/ui` components from packages/ui
- Tailwind CSS (already optimized via PostCSS)
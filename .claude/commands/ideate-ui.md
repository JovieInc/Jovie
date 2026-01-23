---
description: Analyze UI components and identify UX improvements
tags: [ui, ux, accessibility, design, analysis]
---

# /ideate-ui - UI/UX Improvements Ideation

You are a UI/UX improvements specialist. Analyze the application's components and identify concrete improvements to the user interface and experience.

**Key Principle**: See the app as users see it. Identify friction points, inconsistencies, and opportunities for visual polish that will improve the user experience.

## Arguments

- `[path]` - Optional. Specific directory to analyze (default: `apps/web`)

## Phase 1: Context Gathering

### 1.1 Understand Project Structure

```bash
# Check UI component locations
ls -la apps/web/components/
ls -la packages/ui/src/

# Understand design system
cat packages/ui/src/index.ts | head -50
cat apps/web/tailwind.config.ts | head -80
```

### 1.2 Query Linear for Existing UI Issues

Use Linear MCP to check for existing UI/UX-related issues:

```
mcp__claude_ai_Linear__list_issues with:
- team: "Engineering" (or appropriate team)
- label: "ui" or "ux" or "accessibility"
- limit: 50
```

This prevents duplicate suggestions and provides historical context.

### 1.3 Check Recent UI Changes

```bash
# Find recently modified UI files
git log --oneline --name-only -20 -- "*.tsx" | grep -E "component|page|layout" | head -30
```

## Phase 2: Component Analysis

Analyze components in the target scope (default: `apps/web`).

### 2.1 Scan for UI Patterns

```bash
# Find all React components
find apps/web -name "*.tsx" -type f | head -100

# Check for component organization
ls -la apps/web/components/ui/
ls -la apps/web/components/

# Look at shared UI components
ls -la packages/ui/src/components/
```

### 2.2 Analyze State Handling

Search for proper state handling patterns:

```bash
# Loading states
grep -r "isLoading\|isPending\|loading" --include="*.tsx" apps/web/components | head -20

# Error states
grep -r "isError\|error\|Error" --include="*.tsx" apps/web/components | head -20

# Empty states
grep -r "empty\|no.*found\|no.*available" --include="*.tsx" apps/web/components | head -20
```

Look for components missing:
- Loading skeletons or spinners
- Error boundaries or error messages
- Empty state illustrations or guidance

### 2.3 Check Interactive Elements

```bash
# Button variants and states
grep -r "Button\|button" --include="*.tsx" apps/web/components | head -30

# Form components
grep -r "Input\|Select\|Checkbox\|form" --include="*.tsx" apps/web/components | head -30

# Look for hover/focus/active states in Tailwind
grep -r "hover:\|focus:\|active:\|disabled:" --include="*.tsx" apps/web | head -30
```

## Phase 3: Accessibility Audit

### 3.1 Check ARIA Attributes

```bash
# Find components with accessibility attributes
grep -r "aria-\|role=" --include="*.tsx" apps/web | head -40

# Find images - check for alt text
grep -r "<img\|<Image" --include="*.tsx" apps/web | head -20

# Check for sr-only (screen reader) content
grep -r "sr-only" --include="*.tsx" apps/web | head -20
```

### 3.2 Keyboard Navigation

```bash
# Check for tabIndex usage
grep -r "tabIndex\|onKeyDown\|onKeyPress" --include="*.tsx" apps/web | head -20

# Focus management
grep -r "focus\|Focus" --include="*.tsx" apps/web/components | head -20
```

### 3.3 Common A11y Issues to Flag

- Images without alt text
- Buttons without accessible names
- Missing form labels
- Low color contrast (check Tailwind classes)
- Missing skip links
- Focus traps in modals

## Phase 4: Consistency Audit

### 4.1 Design Token Usage

```bash
# Check for hardcoded colors (should use Tailwind tokens)
grep -rE "#[0-9a-fA-F]{3,6}|rgb\(|rgba\(" --include="*.tsx" apps/web | head -20

# Check for hardcoded spacing (should use Tailwind spacing scale)
grep -rE "margin:\s*\d+px|padding:\s*\d+px" --include="*.tsx" apps/web | head -20

# Look at Tailwind config for custom tokens
cat apps/web/tailwind.config.ts
```

### 4.2 Typography Consistency

```bash
# Check font size usage
grep -r "text-\(xs\|sm\|base\|lg\|xl\|2xl\|3xl\)" --include="*.tsx" apps/web/components | head -30

# Check for inline font styles
grep -r "fontSize\|fontWeight\|lineHeight" --include="*.tsx" apps/web | head -20
```

### 4.3 Spacing Consistency

```bash
# Common spacing patterns
grep -rE "p-\d|m-\d|gap-\d|space-\d" --include="*.tsx" apps/web/components | head -30
```

## Phase 5: Identify Improvement Opportunities

For each category, identify specific issues:

### A. Usability Issues
- Confusing navigation
- Hidden actions
- Unclear feedback
- Poor form UX
- Missing keyboard shortcuts

### B. Accessibility Issues
- Missing alt text
- Poor contrast
- Keyboard traps
- Missing ARIA labels
- Focus management problems

### C. Performance Perception
- Missing loading indicators
- Layout shifts (CLS)
- Missing skeleton screens
- No optimistic updates

### D. Visual Polish
- Inconsistent spacing
- Alignment issues
- Typography hierarchy problems
- Color inconsistencies
- Missing hover/active states

### E. Interaction Improvements
- Missing animations/transitions
- Jarring state changes
- No micro-interactions
- Poor touch targets (< 44x44px)

## Phase 6: Prioritize and Document

For each issue found, analyze:

1. **Severity**: How much does this impact users?
2. **Effort**: How difficult is the fix?
3. **Frequency**: How often do users encounter this?

Priority matrix:
- **High priority**: High impact + Low effort
- **Medium priority**: High impact + High effort OR Low impact + Low effort
- **Low priority**: Low impact + High effort

## Phase 7: Generate Output

### 7.1 Create Ideas JSON

Write findings to `.claude/ideation/ui-ux-ideas.json`:

```json
{
  "generated_at": "2024-01-23T12:00:00Z",
  "scope": "apps/web",
  "linear_issues_checked": 50,
  "ideas": [
    {
      "id": "uiux-001",
      "title": "Short descriptive title",
      "description": "What the improvement does",
      "rationale": "Why this improves UX",
      "category": "usability|accessibility|performance|visual|interaction",
      "affected_files": ["apps/web/components/Example.tsx"],
      "current_state": "Description of current behavior",
      "proposed_change": "Specific change to make",
      "user_benefit": "How users benefit",
      "effort": "low|medium|high",
      "priority": "low|medium|high",
      "related_linear_issues": []
    }
  ],
  "summary": {
    "total_ideas": 0,
    "by_category": {
      "usability": 0,
      "accessibility": 0,
      "performance": 0,
      "visual": 0,
      "interaction": 0
    },
    "by_priority": {
      "high": 0,
      "medium": 0,
      "low": 0
    }
  }
}
```

### 7.2 Create Linear Issues (Optional)

For high-priority findings not already tracked:

```
mcp__claude_ai_Linear__create_issue with:
- team: "Engineering"
- title: "[UI/UX] {idea title}"
- description: Markdown description with rationale and proposed fix
- labels: ["ui", "ux-improvement"]
```

Ask before creating issues:

> Found X high-priority UI/UX improvements not tracked in Linear.
> Would you like me to create Linear issues for them?

## Output Summary

After analysis, report:

```markdown
## UI/UX Ideation Complete

### Scope Analyzed
- Path: {scope}
- Components scanned: {count}
- Linear issues checked: {count}

### Ideas Generated: {total}

| Category | Count | High Priority |
|----------|-------|---------------|
| Usability | X | X |
| Accessibility | X | X |
| Performance | X | X |
| Visual | X | X |
| Interaction | X | X |

### Top 3 High-Priority Items
1. {title} - {affected_files}
2. {title} - {affected_files}
3. {title} - {affected_files}

### Output
Ideas saved to: `.claude/ideation/ui-ux-ideas.json`

### Next Steps
- Review ideas and adjust priorities
- Create Linear issues for approved items
- Implement high-priority fixes
```

## Critical Rules

1. **BE SPECIFIC** - Don't say "improve buttons", say "add hover state to PrimaryButton in Header.tsx"
2. **REFERENCE FILES** - Include exact file paths for each suggestion
3. **PROPOSE CONCRETE CHANGES** - Specific CSS/component changes, not vague suggestions
4. **CHECK LINEAR FIRST** - Don't duplicate existing tracked issues
5. **FOLLOW EXISTING PATTERNS** - Suggest fixes that match the existing design system
6. **PRIORITIZE USER IMPACT** - Focus on changes that meaningfully improve UX

## Jovie-Specific Patterns

Follow project conventions (from agents.md):

- Use `cn()` from `@/lib/utils` for class merging
- Use components from `@jovie/ui` package
- Use TanStack Query patterns for loading states
- Use Sentry for error tracking (no console.* in production)
- Follow Tailwind design tokens from `tailwind.config.ts`
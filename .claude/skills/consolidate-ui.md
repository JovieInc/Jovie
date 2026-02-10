---
description: Find divergent UI patterns that should be identical, then consolidate to one canonical implementation. Use during ideation or whenever UI inconsistencies are suspected.
---

# Consolidate UI Patterns

Find UI patterns that SHOULD be visually and functionally identical across pages but currently aren't, then refactor to ONE canonical implementation.

## When to Use

- During `/ideate` or `/ideate-ui` flows when divergence is spotted
- When multiple components serve the same user intent but differ in implementation
- After a design system change that needs propagation
- When dead/placeholder components accumulate

## Process

### Phase 1: Inventory (use Explore agent)

Search for all instances of the target pattern across the codebase:

```
Search for: Sheet, Drawer, SidePanel, Sidebar, Modal, Dialog, Popover,
Toast, Banner, Card, Table, Form, etc. (whatever pattern is being consolidated)
```

For each instance, record:
- File path and component name
- Whether it's shared/reusable or page-specific
- Key props and behavior
- Which shared components it wraps or imports

### Phase 2: Equivalence Detection

Group instances by **user intent** (same user goal), NOT by current implementation:

| Group | Intent | Instances |
|-------|--------|-----------|
| Group 1 | "View entity details in right panel" | ReleaseSidebar, ContactSidebar, AudienceSidebar |
| Group 2 | "Preview content" | PreviewPanel, ProfileContactSidebar |

### Phase 3: Divergence Analysis

For each group, identify divergences:

| Dimension | Check |
|-----------|-------|
| **Shell/wrapper** | Different container components? |
| **Width** | Hardcoded vs shared constant? |
| **Padding** | `p-4` vs `px-4 py-3` vs `px-4 py-4`? |
| **Empty state** | Different text/styling? |
| **Header** | Different close button, actions layout? |
| **Navigation** | Tabs vs segments vs none? |
| **Background** | `bg-surface-1` vs `bg-surface-2`? |
| **Mobile** | Full-screen vs sheet vs hidden? |
| **Keyboard** | Escape-to-close, focus trap? |
| **Dead code** | Unused wrappers, placeholders, props flowing nowhere? |

### Phase 4: Canonical Decision

Pick the canonical pattern:

1. **Prefer existing shared components** over page-specific ones
2. **Prefer the most complete implementation** (a11y, mobile, keyboard)
3. **Prefer composition** (slots/children) over boolean props
4. **Delete dead code** (unused wrappers, placeholder components, props that are always null)

### Phase 5: Implementation

Apply changes in this order:

1. **Create shared components** for newly identified patterns (e.g., `DrawerEmptyState`)
2. **Delete dead code** (unused components, placeholder files, dead props)
3. **Migrate divergent instances** to use shared components/constants
4. **Standardize tokens** (padding, width, colors, typography)
5. **Update barrel exports** (`index.ts` files)
6. **Clean up prop chains** (remove props that flow through multiple layers but are never used)

### Phase 6: Verification

Run these checks:

```bash
# 1. Biome formatting + lint
npx @biomejs/biome check <changed-files>

# 2. Check for stale references to deleted symbols
grep -rn "DELETED_SYMBOL" apps/web --include="*.ts" --include="*.tsx"

# 3. Server/client boundary check
# Ensure 'use client' files don't import server modules

# 4. Type check
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "CHANGED_FILES"
```

## Anti-patterns to Avoid

| Don't | Do |
|-------|------|
| Add boolean props to satisfy every variant | Use composition (slots/children) |
| Create a mega-component with 20+ props | Keep small subcomponents |
| Leave "Phase 2 TODO" placeholders | Delete them or implement them |
| Hardcode values that exist as constants | Import from `@/lib/constants/layout` |
| Keep unused re-exports | Remove from barrel `index.ts` |
| Mix `bg-surface-1` and `bg-surface-2` for same pattern | Pick one per design role |

## Output Format

```markdown
## Consolidation Results

### Dead Code Removed
- [Component/file deleted and why]

### Patterns Standardized
- [What was inconsistent → what it is now]

### Shared Components Created
- [New shared component and what it replaces]

### Files Changed
- X files modified, Y files deleted, Z files created
- Net lines: -N (target: negative)
```

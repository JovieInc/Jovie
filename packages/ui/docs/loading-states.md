# Canonical Loading States

Three loading primitives — never mix them on the same surface.

| Primitive | Package export | When to use | Never use for |
| --- | --- | --- | --- |
| **Skeleton** | `Skeleton`, `LoadingSkeleton` | Predictable page/list loads that mirror final layout 1:1 | Button actions, upload percent |
| **Spinner** | `Spinner` | Inline in-flight actions (buttons, inputs, combobox rows) | Full-page placeholders |
| **Progress bar** | `ProgressBar` | Long uploads/imports with known or indeterminate percent | Page skeletons, button loading |

## Rules

1. **Never nest** — no `Spinner` inside a `Skeleton` block.
2. **Skeleton fill** — placeholders use `JovieColor.surface1` (`bg-surface-1` / `--color-skeleton-base`).
3. **Layout shift** — skeleton dimensions must match the loaded UI; reserve space before data arrives.
4. **Accessibility** — `LoadingSkeleton` exposes `role="status"`; `Spinner` uses `aria-label`; `ProgressBar` uses `role="progressbar"`.

## Imports

```tsx
import { Skeleton, LoadingSkeleton, Spinner, ProgressBar, JovieColor } from '@jovie/ui';
```

App-layer re-exports (back-compat):

- `@/components/atoms/LoadingSpinner` → `Spinner`
- `@/components/molecules/LoadingSkeleton` → `LoadingSkeleton` (+ composite shells)

## Migration checklist

- [ ] Replace raw `className="… skeleton"` divs with `<Skeleton className="…" />`
- [ ] Replace `Loader2` + `animate-spin` in action affordances with `<Spinner size="sm" />`
- [ ] Replace bespoke upload bars with `<ProgressBar value={…} label="…" />`
- [ ] Remove spinners from skeleton shells (table loading → skeleton rows only)

## Examples

```tsx
// Page load
<Skeleton className="h-4 w-48" rounded="sm" />

// Button loading — use Button loading prop or Spinner inline
<Button loading>Save</Button>

// Spotify import
<ProgressBar
  value={total > 0 ? (imported / total) * 100 : undefined}
  label="Importing releases"
  showValue
/>
```
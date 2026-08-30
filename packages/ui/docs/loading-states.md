# Canonical Loading States

Three loading primitives — never mix them on the same surface.

| Primitive | Package export | When to use | Never use for |
| --- | --- | --- | --- |
| **Skeleton** | `Skeleton`, `LoadingSkeleton` | Predictable page/list loads that mirror final layout 1:1 | Button actions, upload percent |
| **Spinner** | `Spinner` | Inline in-flight actions (buttons, inputs, combobox rows) | Full-page placeholders |
| **Progress bar** | `ProgressBar` | Long uploads/imports with known or indeterminate percent | Page skeletons, button loading |

## Rules

1. **Never nest** — no `Spinner` inside a `Skeleton` block.
2. **Skeleton fill** — placeholders use the semantic skeleton base token (`JovieColor.skeletonBase` / `--color-skeleton-base`). Static placeholders use the equivalent `bg-surface-1` utility.
3. **Layout shift** — skeleton dimensions must match the loaded UI; reserve space before data arrives.
4. **Accessibility** — `LoadingSkeleton` exposes one named `role="status"` owner by default; child `Skeleton` placeholders are decorative (`aria-hidden="true"`). Set `announce={false}` when composing a placeholder beneath an existing loading owner. `Spinner` uses `aria-label`; `ProgressBar` uses `role="progressbar"`.
5. **Reduced motion** — shimmer is optional decoration. `prefers-reduced-motion: reduce` keeps the tokenized base fill and removes both animation and shimmer background image.
6. **Declared geometry** — `LoadingSkeleton` exposes `data-lines`, `data-height`, `data-width`, and `data-rounded` on its wrapper; when `announce` is true (the default), that wrapper is also the status owner. This keeps reserved placeholder geometry inspectable and stable.

## Imports

```tsx
import { Skeleton, LoadingSkeleton, Spinner, ProgressBar, JovieColor } from '@jovie/ui';
```

App-layer re-exports (back-compat):

- `@/components/atoms/LoadingSpinner` → `Spinner`
- `@/components/molecules/LoadingSkeleton` → `LoadingSkeleton` (+ composite shells)

The app-layer `LoadingSkeleton` facade accepts tokenized `h-*` and `w-*`
utilities for reserved geometry; invalid or arbitrary bracket sizes fall back
to the defaults.

## Migration checklist

- [ ] Replace raw `className="… skeleton"` divs with `<Skeleton className="…" />`
- [ ] Replace `Loader2` + `animate-spin` in action affordances with `<Spinner size="sm" />`
- [ ] Replace bespoke upload bars with `<ProgressBar value={…} label="…" />`
- [ ] Remove spinners from skeleton shells (table loading → skeleton rows only)

## Examples

```tsx
// Page load
<Skeleton className="h-4 w-48" rounded="sm" />

// Shared loading owner — nested placeholders stay decorative
<div role="status" aria-busy="true" aria-live="polite" aria-atomic="true" aria-label="Loading contacts">
  <LoadingSkeleton announce={false} height="h-4" width="w-32" />
</div>

// Button loading — use Button loading prop or Spinner inline
<Button loading>Save</Button>

// Spotify import
<ProgressBar
  value={total > 0 ? (imported / total) * 100 : undefined}
  label="Importing releases"
  showValue
/>
```

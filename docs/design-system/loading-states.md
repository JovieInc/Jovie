# Canonical Loading States

Three loading primitives — never mix them on the same surface.

| Primitive | Package | When to use | Never use for |
| --- | --- | --- | --- |
| **Skeleton** | `@jovie/ui` `Skeleton` / `LoadingSkeleton` | Predictable list/page loads. Mirror loaded layout 1:1 to prevent layout shift. | Button actions, upload percent |
| **Spinner** | `@jovie/ui` `Spinner` | Buttons and in-flight inline actions (search, save, validate). | Full-page loads, inside skeleton layouts |
| **ProgressBar** | `@jovie/ui` `ProgressBar` | Long uploads/imports with known percent. | Page skeletons, button loading |

## Imports

```ts
import { Skeleton, LoadingSkeleton, Spinner, ProgressBar } from '@jovie/ui';
```

Legacy app alias (deprecated for new code):

```ts
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
```

## Skeleton rules

- Placeholder color resolves to **surface-1** (`JovieColor.surface1` / `--color-skeleton-base`).
- Use the `.skeleton` shimmer class via `<Skeleton />` — not `animate-pulse`, not ad-hoc gray fills.
- Reserve the same dimensions as the loaded UI (height, width, grid, borders).
- Wrap multi-block layouts in a container with `aria-busy="true"`; individual blocks use `aria-hidden="true"`.

## Spinner rules

- Inline only — inside buttons, inputs, table cells, combobox triggers.
- Size map: `sm` (16px) for inputs/icons, `md` (24px) default, `lg` (32px) for prominent actions.
- `Button` `loading` prop uses canonical `Spinner` automatically.

## ProgressBar rules

- Pass `value` 0–100 and optional `label` (percent copy or status).
- Track uses `bg-surface-1`; fill uses `bg-accent`.
- For avatar ring uploads, keep `AvatarProgressRing` (circular variant) — do not nest a bar inside a skeleton.

## Migration checklist

1. Replace `animate-pulse` placeholders with `<Skeleton />`.
2. Replace bespoke spinners with `<Spinner size="sm" />`.
3. Replace upload percent bars with `<ProgressBar value={pct} label={...} />`.
4. Remove spinner-inside-skeleton combinations.
5. Verify layout-shift: loading → loaded transition must not move siblings.

## References

- Tokens: `packages/ui/theme/tokens.ts` (`JovieColor.surface1`)
- CSS: `apps/web/styles/design-system.css` (`--color-skeleton-base`)
- State matrix: `docs/design-system/state-matrix.md`
# @jovie/ui

Shared UI primitives for Jovie. Thin wrappers around [Radix UI](https://www.radix-ui.com) primitives with project-specific styling and the Jovie design token system. Consumed by `apps/web`.

## What's in here

- **`atoms/`** — accessible primitives. Drop-in replacements for raw HTML elements with the design system baked in.
- **`theme/tokens.ts`** — the single source of truth for colors, spacing, typography, motion, surfaces, and feature accents. Tailwind reads from here.
- **`lib/`** — reusable styling helpers (`dropdown-styles`, `linear-pill`) used across atoms.
- **`hooks/`** — `useTabOverflow` for measuring tab containers and routing overflow into a menu.

## Imports

```ts
import { Button, Card, Dialog, Skeleton } from '@jovie/ui';
import { surfaces, typography } from '@jovie/ui';
```

The package is barrel-exported from `index.ts`. Sub-paths (`@jovie/ui/atoms/*`, `@jovie/ui/theme/*`) are also valid for tree-shake-sensitive code.

## Atoms

Form: `Button` · `Input` · `InputGroup` · `Textarea` · `Checkbox` · `Switch` · `RadioGroup` · `Select` · `Field` · `Form` · `Label`

Feedback: `Skeleton` / `LoadingSkeleton` · `Tooltip` / `SimpleTooltip` / `TooltipShortcut` · `Badge` · `Kbd`

Overlays: `Dialog` · `AlertDialog` · `Sheet` · `Popover` · `DropdownMenu` · `ContextMenu` · `SearchableSubmenu` · `CommonDropdown`

Layout: `Card` · `Separator` · `SegmentControl` / `Tabs` · `OverflowMenuTrigger` · `CloseButton`

Identity: `Avatar` / `UserAvatar` / `AvatarStatusDot`

Each atom ships with `*.test.tsx` (Vitest + Testing Library) and most have `*.stories.tsx` for visual review.

## Adding a new atom

1. Create `atoms/<name>.tsx`. Wrap the Radix primitive if one exists; otherwise build on raw HTML with `cva` for variants.
2. Pull every visual decision from `theme/tokens.ts` — never hardcode colors, spacing, or radii.
3. Export from `index.ts` (alphabetical block).
4. Add `atoms/<name>.test.tsx` (a11y + interaction).
5. Optional: `atoms/<name>.stories.tsx` for the storybook surface.

Run `pnpm --filter @jovie/ui test` and `pnpm --filter @jovie/ui typecheck` before opening a PR.

## Design system constraints

`DESIGN.md` at the repo root is the canonical visual spec. Read it before deviating. Notable:

- No gold accents, ever.
- Satoshi font weights are locked — see `theme/tokens.ts`.
- Skeletons must avoid jank on row-click / drawer-open / arrow-key nav. See the loading-jank rule in the project memory if in doubt.

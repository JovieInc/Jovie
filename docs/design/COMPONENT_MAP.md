<!--
doc-freshness: docs/design/COMPONENT_MAP.md
-->
# Canonical Component Map

> **One design system, two languages.** System B tokens only. Prefer shared atoms
> before inventing chrome. This is the agent-facing prefer / allow / forbid map.
> Visual rules live in root [`DESIGN.md`](../../DESIGN.md); architecture in
> [`.claude/rules/ui.md`](../../.claude/rules/ui.md).

## Prefer first — `@jovie/ui` atoms

Import from `@jovie/ui` (see `packages/ui/atoms/*`). Do **not** recreate these as
local `@/components/atoms/*` copies when the package already exports them
(`no-restricted-imports` enforces several of these).

| Family | Atoms (non-exhaustive) |
|--------|------------------------|
| Actions | `Button`, `CloseButton`, `Link` |
| Forms | `Input`, `InputGroup`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`, `Select`, `Field`, `Form`, `Label` |
| Feedback | `Badge`, `Skeleton` / `LoadingSkeleton`, `Spinner`, `Progress`, `InlineOffline`, `Kbd` |
| Overlays | `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `DropdownMenu`, `ContextMenu`, `Tooltip` / `SimpleTooltip` / `TooltipShortcut`, `CommonDropdown`, `SearchableSubmenu` |
| Layout | `Card`, `Separator`, `SegmentControl` / `Tabs`, `OverflowMenuTrigger` |
| Identity | `Avatar` / `UserAvatar` / `AvatarStatusDot` |

**Rule:** if `@jovie/ui` has the primitive, use it. Extend via composition or CVA
variants in the package — do not fork a second Button/Input/Dialog in app code.

## App-level molecules — only when product-specific

Place in `apps/web/components/molecules/` (or feature-local molecules) when the
control encodes **product** behavior that does not belong in the pure package:

| Examples | Why app-level |
|----------|----------------|
| `PaySelector`, amount / tip rows | Payment + product copy + flow |
| Chat composer / usage banners | Product data hooks + shell slots |
| Sidebar / dashboard chrome helpers | App-shell density + routing |
| Profile / DSP / release molecules | Domain-specific composition |

Promote to `packages/ui` only when the control is framework-agnostic and reused
outside a single feature with no Next/app imports.

## Forbidden (agents blocked from drift)

| Forbidden | Why |
|-----------|-----|
| **System A / `.linear-marketing` / DM Sans** for new work | Retired. Marketing uses `.system-b-marketing` + editorial language on System B tokens. |
| **Hand-rolled buttons / inputs / dialogs** when `@jovie/ui` covers them | Duplicate chrome + a11y drift; ESLint restricted imports + style guards. |
| **Design-studio leftovers as product UI** | `components/design-studio/*` and exp page-builder chrome are quarantined — not the shipping system (`scripts/storybook-story-quality-guard.mjs`). |
| **Void Storybook atoms** | Bare atoms on pure black / gray-900 void tiles, fake `bg-blue-600` CTAs, or args-only floating controls that pass Chromatic while destroying taste. |
| **Demo / exp routes as templates** | `app/demo/*`, `app/exp/*` are **holdouts** (shrink-only). Do not copy their chrome into production marketing or app shell. |
| **Raw theme colors / arbitrary hex** for UI chrome | Use semantic tokens (`bg-surface-1`, `text-primary-token`, …). See DESIGN.md + `@jovie/no-hardcoded-theme-colors`. |
| **Off-system shipping** | If it is not on System B tokens + the map above, it does not ship. Fix or delete — do not “match the void story.” |

## Storybook

- Stories must render the **real** component (e.g. `<PaySelector />`), not a hand-rolled mock.
- Stage on System B surfaces (`bg-base` / surface tokens), not pure black void chrome.
- Guard: `node scripts/storybook-story-quality-guard.mjs`.

## Related

| Doc / artifact | Role |
|----------------|------|
| [`DESIGN.md`](../../DESIGN.md) | Tokens, languages, surface TARGET vs STATE |
| [`.claude/rules/ui.md`](../../.claude/rules/ui.md) | Layer boundaries + taste invariants |
| [`docs/llms-design-manifest.txt`](../llms-design-manifest.txt) | Generated agent contract (`pnpm ds:llms-manifest`) |
| [`packages/ui/README.md`](../../packages/ui/README.md) | Package import + atom list |
| `apps/web/tests/unit/design-system/singular-system-b-ratchet.test.ts` | Global one-system ratchet |

# Tooltip Component

A minimalist tooltip for surfacing subtle context with pixel-perfect polish.

## Copy rule

A tooltip names a thing. It never explains it. Enforced by `pnpm design:tooltip-copy:check` (rule: `packages/copy/tooltip-copy.ts`, scanner: `packages/copy/tooltip-copy-audit.ts`), which runs in the design conformance gate. CI runs the same scanner with the web design-system guards (`apps/web/tests/unit/design-system/tooltip-copy.test.ts`).

| Rule | Limit |
| --- | --- |
| Title | 6 words or fewer |
| Body | At most one sentence, 15 words or fewer. Optional. |
| Claims and explanations | None. The scanner flags tells such as "so that", "which means", "no longer", "promise" and "zero". |
| Rich formatting | `Kbd` for a shortcut, or a list of at most 3 items. Nothing interactive: no links, buttons or inputs. |

Accepted shapes: `Save changes`, `Title: one sentence.`, or one lone sentence.

- **Say more somewhere else.** If the copy needs a second sentence, it belongs on the surface the control opens. "What's new" shows a short title; the story is on `/changelog`.
- **Runtime copy.** The scanner reads literals only. Pass copy built at runtime (a changelog headline, a user-authored name) through `shortTooltipTitle` from `@jovie/copy/tooltip-copy`.
- **Existing violations.** None are grandfathered. If one ever has to be, `pnpm design:tooltip-copy:update` writes a per-file, per-rule baseline that can only shrink.

```tsx
// Good
<SimpleTooltip content="Copy link">…</SimpleTooltip>
<TooltipShortcut label="Toggle sidebar" shortcut="⌘B">…</TooltipShortcut>

// Bad: explains how it works, makes a claim, runs three sentences
<SimpleTooltip content="QR codes are now drawn on your device. Visiting a profile no longer reaches an outside service, so pages load with zero third-party requests.">…</SimpleTooltip>
```

## Anchor invariant

Tooltip content never outlives its trigger. The shared `Tooltip` root closes the content when the trigger unmounts, is hidden (`display: none`, `visibility: hidden`, `hidden`, `inert`, or an `aria-hidden` ancestor), collapses to zero size, or leaves the viewport or its clipping container, for example a collapsing sidebar. Screens do not implement this themselves.

- An owner that forces a tooltip closed with `open={false}` is still told when hover or focus ends, so it cannot hold a stale "open" and show the tooltip later with no pointer on it.
- Proven by `packages/ui/atoms/tooltip-anchor.test.tsx` and the collapse sequence in `apps/web/components/shell/SidebarDock.test.tsx`.

## Accessibility

- **Content as ReactNode:** The `content` prop accepts any `ReactNode`. Favor plain text or elements with clear ARIA labels so assistive technologies convey the same message.
- **Keep it brief:** Tooltips supplement UI, not replace it. See the copy rule above.
- **Avoid interactivity:** Interactive controls inside tooltips can confuse keyboard and screen-reader users. If you need interaction, surface it in the main interface instead.

## Usage

### Simple API (Recommended)

For most use cases, use `SimpleTooltip` for a cleaner API:

```tsx
import { SimpleTooltip } from '@jovie/ui';

<SimpleTooltip content="Save changes">
  <button>Hover me</button>
</SimpleTooltip>

<SimpleTooltip content={<span>Custom <strong>content</strong></span>} side="right">
  <IconButton />
</SimpleTooltip>
```

### Composition API

For advanced use cases requiring more control, use the composition pattern:

```tsx
import { Tooltip, TooltipTrigger, TooltipContent } from '@jovie/ui';

<Tooltip>
  <TooltipTrigger asChild>
    <button>Hover me</button>
  </TooltipTrigger>
  <TooltipContent side="top">
    Save changes
  </TooltipContent>
</Tooltip>
```

### With Keyboard Shortcut

```tsx
import { TooltipShortcut } from '@jovie/ui';

<TooltipShortcut label="Toggle sidebar" shortcut="⌘B" side="right">
  <SidebarButton />
</TooltipShortcut>
```

# Tooltip Component

A minimalist tooltip for surfacing subtle context with pixel-perfect polish.

## Accessibility

- **Content as ReactNode:** The `content` prop accepts any `ReactNode`. Favor plain text or elements with clear ARIA labels so assistive technologies convey the same message.
- **Keep it brief:** Tooltips should supplement UI, not replace it. Aim for a single, concise sentence.
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

# Jovie Design System (`@jovie/ui`) — how to build with it

Jovie is a **dark, Linear-inspired "carbon" design system**. Every component imports from
`@jovie/ui` and is styled with Tailwind v4 **token utility classes** — no inline hex, no ad-hoc CSS.
Build quiet, compact, premium UI (think Linear, not a generic admin template).

## Setup

- **Dark by default.** Surfaces and text tokens assume a dark canvas. Put content on
  `bg-(--linear-bg-page)` (the app page) or a surface (below). Light text tokens on a light
  background will be invisible.
- **No provider needed** for the common components (Button, Card, Input, Badge, Avatar, form
  controls, Dialog/Sheet/Select/DropdownMenu/Popover). The exception: tooltips need
  `<TooltipProvider>` once near the root, then use `Tooltip` + `TooltipTrigger` + `TooltipContent`
  (or the `SimpleTooltip` wrapper).
- The system's stylesheet must be loaded for tokens/fonts to apply (it ships as `styles.css`).

## Styling idiom — use these token utilities, not raw values

- **Surfaces (elevation):** `bg-surface-0` (recessed wells/inputs), `bg-surface-1` (cards/panels),
  `bg-surface-2` (hover/raised). Page background: `bg-(--linear-bg-page)`.
- **Text:** `text-primary-token` (primary), `text-secondary-token`, `text-tertiary-token` (muted).
- **Borders:** `border-subtle`, `border-default` (with `border`).
- **Radius:** pills use `rounded-full` (buttons, inputs, badges); cards use the component's own
  rounding. **CTAs are white-on-black pills — never saturated fills.**
- **Color is the exception, greyscale the default.** For emphasis use the single accent
  `text-accent` (blue-purple). For status use the semantic utilities only — `text-success` (green),
  `text-error` (red), `text-warning` (amber), `text-info` (blue) — and the matching `Badge`
  variants. Don't invent per-color accent classes; the shipped `styles.css` is the authoritative
  list of what resolves — read it before reaching for a utility.
- **Icons:** lucide-react only. **Never emoji.** Labels/buttons/badges are Title Case.
- **Prefer composing the components** over re-styling with raw token utilities; the token classes
  above are for layout glue and light theming, not for rebuilding what a component already does.

## Where the truth lives

Read the bound copies before styling: the shipped `styles.css` (tokens + utilities), and each
component's `<Name>.d.ts` (the exact prop API) and `<Name>.prompt.md` (usage). Compose with the
real exports — e.g. `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`;
`Dialog` + `DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`;
`Select` + `SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`.

## Idiomatic example

```tsx
import { Button, Card, CardHeader, CardTitle, CardDescription, CardFooter, Badge } from '@jovie/ui';

export function ReleaseCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Summer 2026</CardTitle>
          <Badge variant="success">Live</Badge>
        </div>
        <CardDescription>Out now on every platform.</CardDescription>
      </CardHeader>
      <CardFooter className="gap-2">
        <Button>Share</Button>
        <Button variant="ghost">Edit</Button>
      </CardFooter>
    </Card>
  );
}
```

Buttons are the control; the layout glue (`flex`, `gap-2`, `max-w-sm`) is plain Tailwind. Default
to `Button` (white pill); `variant="secondary" | "ghost" | "outline"` for lower emphasis,
`variant="destructive"` for delete actions.

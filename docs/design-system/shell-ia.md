# Shell and IA Canon

Status: Canon (taste default, shipped 2026-10-29; founder review after ship)
Registry: [`apps/web/data/surfaceIa/registry.json`](../../apps/web/data/surfaceIa/registry.json)
Guard: `JOV-INV-047` ([`scripts/invariants/shell-ia.mjs`](../../scripts/invariants/shell-ia.mjs))
Inherits: [`canon/PRODUCT.md`](../../canon/PRODUCT.md) (one shell for Jovie and Ovie),
[`canon/DESIGN.md`](../../canon/DESIGN.md), [`DESIGN.md`](../../DESIGN.md),
[`.claude/rules/ui.md`](../../.claude/rules/ui.md), [`.claude/rules/motion.md`](../../.claude/rules/motion.md)

One page for how every Jovie surface is framed and navigated: the logged-in
app, Ovie, public profiles and smart links, and the marketing site. The
registry is the machine copy; this page explains it. Route-level scaffold
detail stays in [`app-shell-route-scaffold-matrix.md`](./app-shell-route-scaffold-matrix.md)
and the app-screen registry (`apps/web/data/appScreens`). Do not restate them.

## North star: the canvas is the product

Tim White, 2026-10-29 ([JOV-9748](https://linear.app/jovie/issue/JOV-9748)):
the main content area is a free, living, transforming canvas, a cinematic
window into the user's world. Jovie is a circle that spins up and animates into
the composer, then compacts back to a circle in full-duplex voice. What you do
is already on the big screen.

What this means for every change made now, before the full language ships:

1. **Chrome recedes, the canvas leads.** The sidebar, header and toolbars stay
   quiet, near-monochrome and thin. Any new chrome must justify itself against
   giving the pixels back to the canvas.
2. **Views, not tab stacks.** New destinations are canvas views that can be
   pinned to the sidebar (generative views, `docs/architecture/generative-views.md`),
   not new fixed tab rows or new root nav items.
3. **One motion grammar: circle, composer, voice.** The Jovie O (`packages/ui/brand/JovieO.tsx`)
   expands into the composer capsule and compacts back to the circle for voice.
   Pills compacting to a circle while pending ([JOV-8176](https://linear.app/jovie/issue/JOV-8176))
   is the same grammar at control scale. Do not invent a second loading, morph
   or presence motion.
4. **Static matte ground.** No animated backgrounds, gradients as wallpaper or
   glass plates. Motion lives in content and in the O, never in the floor.

## Surfaces and their shells

| Surface | Shell (mounted once by the layout) | Navigation source | Page header |
|---|---|---|---|
| App (Jovie creator) | `AuthShell` → `AppShellFrame` | `primaryNavigation` (dashboard-nav/config.ts) | `DashboardHeader` breadcrumb |
| Ovie (operator) | Same `AuthShell`, `ov` workspace mode | `OPERATOR_NAV_ITEMS` (operator-navigation.ts) | `DashboardHeader` breadcrumb |
| Public profile | `ProfileShell` | `PUBLIC_PROFILE_NAVIGATION` (lib/profile/route-config.ts) | Profile identity block |
| Smart link | `ProfileDrawerShell` (release landing) | None, one action per page | Release identity block |
| Marketing | `PublicPageShell` with `MarketingHeader`/`MarketingFooter` | Site-chrome content record (`lib/content-records/site-chrome.ts`) | Page-spec hero (#23600) |

Jovie and Ovie are one shell with two workspaces (`lib/app-shell/workspaces.ts`).
An improvement to a shell owner lands in both. Ovie diverges only in nav
content (`navigationDivergenceReason: 'operator-capabilities'`).

## App shell anatomy (Jovie and Ovie)

```
┌ rail (sidebar) ──┐┌ canvas ─────────────────────────────────────┐
│ O · bell · search││ header: breadcrumb (page name) · actions    │
│ New chat         ││ toolbar: sub-nav (start) · ≤1 primary (end) │
│ primary nav (≤4) ││                                             │
│ threads          ││ content (one surface, shell-owned canvas)   │
│ account          ││                                             │
└──────────────────┘└─────────────────────────────────────────────┘
```

- **Rail.** Rows use `SidebarNavItem` only. Root destinations are the four in
  `primaryNavigation`; everything else is a contextual view, the command palette
  or a pinned view. Never add a root item without a product decision.
- **Header.** `DashboardHeader` owns the page name. Content never repeats it
  (`.claude/rules/ui.md`, no duplicate titles). The breadcrumb name must equal
  the active rail label (owner: #22986 / #23183).
- **Toolbar.** `PageToolbar`. Sub-navigation goes in `start`; at most one primary
  pill in `end`. The left seam is `px-3` for header, toolbar, first column and
  footer.
- **Canvas.** `AppShellContentPanel` (or the `PageShell` adapter). The shell owns
  the canvas tone; cards sit on it as `bg-surface-1`; wells are `bg-surface-0`.

## Sub-navigation (one treatment)

In-page views are flat text segments with no rail plate. The active segment
gets a `bg-surface-1` pill; inactive segments are tertiary text.

| Case | Primitive |
|---|---|
| View changes the URL | `RouteSegmentControl` with `surface='ghost'` |
| View is local state | `PageToolbarTabButton` |

Banned: bordered pill rails around tabs, `Button variant='secondary'` used as a
tab, two stacked tab rows for one decision, oversized text tabs.

## Section, card, list and table

- **Section.** One heading per section, Title Case, `text-balance`. No eyebrow
  or all-caps labels.
- **Card.** Only when the content needs a boundary the canvas cannot give.
  `bg-surface-1 border-subtle`, radius steps down as the element gets smaller.
  No card inside a card. No bordered icon tiles.
- **List and table.** `UnifiedTable`. Row height is set by the table density
  token, not by the route. Numbers use `tabular-nums`. Empty columns render
  nothing, not "n/a" or a dash wall.

## Empty, loading and error

- **Empty on the canvas** uses `EmptyState presentation='quiet'`: one centered
  line and at most one action, no card, no icon tile. The action starts an agent
  conversation when that is the fastest path to value (agent-first).
- **Empty inside a panel** may use `presentation='workspace'`.
- **Loading.** Route `loading.tsx` renders the route skeleton
  (`DashboardSegmentSkeleton`, `AppShellSkeleton`). No spinner where the shape
  is known. Skeletons match the final geometry so nothing shifts.
- **Error.** `PageErrorState` with a retry. Never truncate error copy in the
  rail; use the shell toast.
- **No dead ends** (`JOV-INV-046`): no "coming soon", "not available" or
  disabled controls without a reason.

## Motion

Motion tokens and rules live in `.claude/rules/motion.md`. Shell additions:

- Route changes do not animate the canvas. Content swaps resolve in place.
- Rails and drawers use `rail-motion.ts`. The composer and the O follow the
  circle, composer and voice grammar above. Reduced motion substitutes state
  without travel.

## IA across surfaces

- **App and Ovie.** Home first (what matters, then what is blocked on you, in
  flight, done today, releases). Four Jovie roots: Inbox (Home), Identity, Work,
  Audience. Ovie: Home plus one collapsed Tools group.
- **Public profile.** One right thing per visitor. Destinations come only from
  `PUBLIC_PROFILE_NAVIGATION` (Home, Music, Events, About).
- **Smart link.** One release, one primary action, no site nav.
- **Marketing.** Header and footer come only from the site-chrome content
  record. Page order and sections come from page specs and the certified section
  library. Every nav label names its destination (`JOV-INV-038`).

## Guardrails

`JOV-INV-047` (`pnpm design:shell-ia:check`) enforces this page:

1. Every registry source exists and exports the named primitive.
2. Every registered route reaches its surface shell through its layouts.
3. Ad-hoc `<nav>` and `<aside>` chrome outside registered shell owners is
   ratcheted in `scripts/invariants/shell-ia.baseline.json`. New sites fail;
   a shrink passes with a notice and is locked
   with `pnpm design:shell-ia:update`.
4. Ad-hoc sub-navigation (a plate-rail segment control in an app route) is
   ratcheted the same way.

It extends the layout guard (`scripts/layout-guard-pen-contracts.mjs`) import
walker and sits beside the ui-feel ratchet and the art-direction invariants. It
does not replace them.

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-10-29 | Created: one shell and IA registry for app, Ovie, public and marketing; canvas north star; JOV-INV-047. | Design lead; Tim White (JOV-9748) |

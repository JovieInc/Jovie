---
paths: ["apps/web/**/*.tsx", "apps/web/**/*.css", "packages/ui/**", "DESIGN.md", "docs/design-system/**"]
---

# UI System

Design system, component hierarchy, surfaces, taste rules. Always read `DESIGN.md` before making any visual decisions.

This contract covers every rendered Jovie surface, including internal HTML
artifacts, rendered specs, approval consoles, review pages, admin tools, and ops
tools. Internal or generated output has no exemption and must not introduce a
parallel design system or review standard.

## Entity identity

Follow [the founder-locked entity identity contract](../../docs/design-system/entity-identity.md): circular people, square uncropped releases, calendar events. Reuse shared media/fallback/verification owners; choose supported density and layout variants. Provider connection is not Jovie verification. The executable invariant projects from `canon/invariants.jsonl`, and the current [consumer audit](../../docs/design-system/entity-identity.md) names the owners.

## Interaction Quality Contract

Jovie is a focused work surface. Every feature must make its frequent work feel
direct, quiet, and predictable for a power user without making keyboard use or
accessibility a cleanup task. This contract governs behavior, not a visual
redesign, and inherits the canonical components, tokens, and platform
conventions in `DESIGN.md` and the frontend skill.

The full contract (feature definition gate, input and shortcuts, focus and
selection, feedback and recovery, inclusion, and the evidence and enforcement
matrix) plus the component architecture and new-component template live in
[docs/design-system/UI_REFERENCE.md](../../docs/design-system/UI_REFERENCE.md).
Read it before defining a new feature, interaction or component.

## Styling

- Tailwind utility classes only (no custom CSS unless necessary)
- Follow existing design tokens in `tailwind.config.ts`
- Mobile-first responsive design

### Surface Elevation Rules (Card/Background Consistency)

The main content area (`<main>`) uses `bg-(--app-shell-content-surface)`, the shell-owned canvas tone. In dark mode it must stay distinct from both recessed wells (`bg-surface-0`) and shared cards (`bg-surface-1`).

**Allowed patterns:**
- Card on app-shell canvas parent → `bg-surface-1` for shared cards and panels
- Recessed/"well" element inside the shell or a card → `bg-surface-0` (e.g., skeleton containers, empty states, input wells)
- Sticky shell chrome (toolbars, table headers, shell frame) → `bg-(--app-shell-content-surface)`
- Card with elevation → `Card` component as-is (has `bg-surface-1 border border-subtle shadow-card`)
- Nested card inside card → `bg-surface-0` for the inner element
- Table/workspace routes → consume the shell-owned canvas by default. A nested bordered `LINEAR_SURFACE.contentContainer` canvas is allowed only when the screen declares `canvasOwner: 'screen'` in the app-screen canvas manifest (`apps/web/data/appScreens/canvas.ts`); undeclared nested canvases are rejected by the canvas-ownership guardrail

**Banned patterns (will cause invisible cards):**
- `bg-(--app-shell-content-surface)` on card-like elements inside the shell unless the element is shell chrome (toolbar/header/frame)
- Undeclared canvas-sized surfaces nested inside the shell canvas (for example, a second `LINEAR_SURFACE.contentContainer` without an app-screen canvas-manifest exception)
- `bg-surface-1` on elements inside a `surface-1` parent WITHOUT border+shadow — same color on same color
- `bg-surface-1/XX` (semi-transparent) — low opacity surface-1 on surface-1 parent is nearly invisible
- `Card className='border-0 shadow-none'` — strips all elevation from a surface-1 card, making it invisible on surface-1 parent
- `bg-surface-0/XX` (semi-transparent) — use solid `bg-surface-0` instead
- Card-within-card nesting (e.g., `DrawerSurfaceCard variant='card'` inside another card) — use `variant='flat'` for inner elements

**Quick test:** If removing the element would cause no visual change, it's an elevation bug.

### Color & Accent Discipline

`DESIGN.md` is canonical for tokens. Color is neutral by default; accents
appear only on card and section backgrounds, rotating in visual order
blue → purple → pink (then orange, then red/green last) with no two
consecutive sections sharing one. Image cards pick the accent that
complements the art by color theory and anchor the rotation. Each gradient
uses one accent centered on its exact token value. Lower OKLCH chroma for
contrast, and more strongly behind art. The focus/link accent never rotates.
CTAs stay neutral pills. Color never carries status alone. Full rule:
`docs/design-system/DETAILS.md` (accent rotation rule).

Marketing imagery and section accents: [marketing-ui](marketing-ui.md#marketing-imagery-and-section-accents).

### Do not fuck with art (founder-locked 2026-08-13)

Hard product and marketing rules from `DESIGN.md`. Not aesthetic taste.
`DESIGN.md` is authority.

1. Never crop album art. Respect the square. `object-fit: contain`, not `cover`.
2. Do not fuck with art. No gradient, overlay, play button, or chrome on album art, merch, or a face. Never cover a face or a person.
3. Only acceptable control on art: optional mostly-transparent glass play/pause. Nothing else.
4. Border radius scales down as the asset gets smaller. Hard radii break printed borders (Never Say A Word).
5. Profile/avatar: no overlay except an approved tiny verification badge on an approved avatar component.
6. Press photo: designed one-sheet ok only if it does not cover a face.
7. Ad/marketing scale is not web scale. Pills and type can go larger.

### No Duplicate Page Titles (Breadcrumb + Toolbar)

The `DashboardHeader` breadcrumb already renders the page name prominently. Do NOT repeat the page name in `PageToolbar start={}`. The toolbar should only contain contextual metadata (counts, status) and action buttons.

**Allowed:** `<PageToolbar start={<span>3 matched platforms</span>} end={<ActionButton />} />`
**Banned:** `<PageToolbar start={<span>Earnings</span>} />` — duplicates the breadcrumb

A `PageToolbar` may contain **at most one primary pill CTA**, and that primary
action belongs in `end={}`. The canonical `Button` is pill-shaped and defaults
to `variant='primary'`, so an omitted variant counts as primary. Filters,
display controls, navigation, cancel, and overflow actions must use secondary,
tertiary, ghost, or `PageToolbarActionButton` treatment.

### One Workspace Left Seam

Authenticated workspace primitives use the canonical `px-3` seam for the
header/breadcrumb, `PageToolbar`, table/list header cells, first-column cells,
and status/footer rows. Do not recreate the seam with `px-3.5` or route-local
padding. Optional selection columns may occupy their own reserved track, but
the primary content column must return to the shared seam when that track is
absent.

### No dead ends (JOV-INV-046)

- Every control you render must work in the current runtime. Decide with a capability check (`isDesktopApp`, speech/mic support, entitlement) and render nothing when it fails.
- Banned UI: "not available", "unavailable", "not supported", "coming soon", "check back", "use X instead", "only available on Y"; `disabled` with no reason (`title`, `disabledReason`, `aria-describedby`); empty or no-op handlers; `href="#"`; links to routes that do not exist.
- Allowed: permission or entitlement prompts that lead to a working path (Allow microphone, a real checkout) and transient errors that offer retry. Mark a deliberate exception with a `dead-end-ok: <reason>` comment on the same or previous line.
- `pnpm design:no-dead-ends:check` fails on new violations; grandfathered ones live in `packages/copy/dead-ends.baseline.json` and only shrink (`pnpm design:no-dead-ends:update` locks a shrink). If a dead end can still reach a user, call `trackDeadEndShown(surface, reason)` so Summer can find it.

## Taste Rules (Hard Invariants)

### Quiet Surfaces: Hard Bans (founder, 2026-10-28)

- **No bordered or filled containers around icons or emoji.** Show the bare icon at the right size and colour token, aligned to the text grid. `IconBadge`, `IconTile` and `IconGlyphFrame` are retired. `apps/web/scripts/lint-design-noise.mjs` (`icon-tile`) ratchets existing debt; new sites fail.
- **Cards carry at most title + body + one optional bare visual.** Labels that restate structure ("Step 1", "Feature") are never visible text. Order comes from an `<ol>`; keep the count `sr-only`, or art-direct an oversized faded numeral.
- **One email-capture control: `InlineSubscribe`** (`@jovie/ui/atoms/inline-subscribe`, built on `CompositeField`). One short title, one attached field and button, at most one microcopy line. No visible label (aria-label), no subtitle, no helper that restates the title or CTA.
- **A primary button is never grey-disabled by field validity.** Validate on submit. Disable only for a genuinely unavailable service.
- **Composite fields (prefix/suffix, search pill, composer) use `CompositeField`**, which owns the radius-following focus ring. Never a raw `outline`/`ring-0` on the inner input (`lint-composite-field.mjs`).
- Rendered counterpart: `tests/e2e/marketing-noise-budget.spec.ts` (text-layer budget, icon tiles, "Step N") with deliberate-red cases for the vision critic.

### Copy Is the Message, Never the Brief

Reject AI instructions, editing rules, and unfinished text in every user-visible string, including metadata, accessibility labels, emails, errors, empty states, and demos. Use the copy system.
Run `node scripts/invariants/copy-leak/check.mjs` before review: it blocks PR Ready and merge groups. Fix real leaks; its baseline only shrinks.
Exact exceptions in `scripts/invariants/copy-leak/config.json` require reasons.

### No Emoji in UI — Use Icons

- **NEVER** use emoji characters in component markup, mock data, or UI strings.
- Emoji looks cheap and undesigned — always use proper SVG icons instead.
- For decorative indicators, use small SVG icon components (Lucide icons or inline SVGs).
- Applies to marketing pages, dashboards, mockups, and all user-facing surfaces.

### Icon and Text Alignment

- **Geometric centering is the default** for icon-and-text pairs and icon controls. Lucide and arbitrary web SVGs do not provide a guaranteed typographic baseline.
- Use **baseline alignment only when both paired assets expose compatible, meaningful baselines**. System symbols with baseline metadata are the exception, not a reason to baseline-align arbitrary SVGs.
- A **1–2px optical correction** is allowed only after screenshot evidence across the affected sizes and both themes. It must live in the shared primitive, helper, or token that owns the pair.
- Never add an optical correction as a call-site margin or translate utility. It must be static, preserve layout and hit-target geometry, and must not appear on hover.

### Text Casing Rules

- All user-facing text must follow `DESIGN.md` casing rules.
- **Title Case** for labels, headings, buttons, badges, column headers, nav items.
- **Sentence case** for body text, descriptions, tooltips, toasts.
- Never lowercase the first word of a visible label or heading.
- Use `capitalizeFirst()` from `apps/web/lib/utils/string-utils.ts` for dynamic data from the database.

### Line Break Quality

- Hero headlines, subheads, section leads, card titles, CTA labels, and nav items must be checked for orphaned final lines on desktop, tablet, and mobile.
- A single word on the last line is a design bug. Fix it with `text-wrap: balance`, a better `max-width`, nonbreaking phrase groups, or a copy edit.
- Do not add hard `<br>` tags unless the break is a natural phrase boundary and has been verified at responsive widths.
- Browser QA for marketing sections must include a visual scan for awkward wraps, clipped text, and lines that feel visually unbalanced.

### Subtraction Principle (Tim White Canon)

- UI cleanup must follow the subtraction principle: remove before adding.
- Before building a child component, open the parent container file and list what chrome (title, header, card surface, borders) it already renders — then omit those from the child.
- When a screen feels messy, agents should first look for duplicated labels, redundant helper text, nested containers, extra borders, repeated actions, and unnecessary variants.
- Prefer one clear heading, one clear action cluster, and one clear surface hierarchy instead of layering multiple decorative cues.
- If an existing label, icon, placeholder, or layout already communicates the action, remove the extra explanatory UI around it.
- Agents should not "solve" weak hierarchy by adding more badges, more cards, more copy, or more controls unless subtraction has clearly failed.
- During refactors and polish passes, explicitly audit for what can be deleted, merged, flattened, or simplified before introducing anything new.

### No AI-Slop Product UI

The machine-readable rule list is `docs/design-system/anti-slop-rules.json` (ASR ids; `node scripts/anti-slop/run.mjs list`). Run `node scripts/anti-slop/run.mjs check --files <paths>` before showing UI. Agent-first default for app and admin: ASR-031. Redundant chrome: ASR-035. Eyebrows: ASR-022.

- Jovie product UI must feel closer to Linear than generic AI-generated dashboards: compact, quiet, precise, and premium.
- Default to small typography, restrained weight changes, and clean spacing before adding decorative treatment.
- Do **NOT** use all-caps labels, eyebrow text, or section headers as a default styling move; use normal Title Case labels unless an existing canonical pattern explicitly calls for something else.
- Do **NOT** wrap content in a Card when the parent surface (Sheet, Drawer, existing Card) already provides visual grouping; first solve hierarchy with spacing, alignment, type, and surface contrast.
- Nested decorative carding around a phone, screenshot, or demo is banned by default. If the visual already lives inside a phone, drawer, or screenshot, do not wrap it in extra floating cards just to make it feel designed.
- Borders are a supporting tool, not the main design language; if a border can be removed without losing meaning, remove it.
- Prefer one compact, well-set label and one clear body line over stacked label, headline, description, and chrome all saying the same thing.
- When revising a marketing layout and the direction is unclear, do not add explanatory copy or chrome as a hedge. The fallback is subtraction: headline, subhead, one visual.
- When implementing or revising UI, compare the result against this smell test: if it looks like a generic AI admin template, it is off-style and should be simplified.

### No Redundant Chrome (Container-Aware Design)

Before adding a title, header, card wrapper, or label to a component, **read the parent container** that will render it. Containers already provide chrome — do not duplicate it.

| Container | Chrome it provides | Do NOT add inside it |
|---|---|---|
| `EntitySidebarShell` | `DrawerHeader` via `title` prop | Card header or heading repeating the drawer title |
| `Sheet` / `Dialog` | `SheetHeader` / `DialogHeader` + title | Second heading or Card wrapping the body content |
| `Card` with `CardHeader` | `CardTitle` | Nested Card or redundant heading inside `CardContent` |
| `DrawerSurfaceCard` | Card surface + optional header | Do not nest another `Card` inside; use `variant='flat'` for inner elements |
| `DashboardHeader` breadcrumb | Page name | `PageToolbar start=` repeating the page name |
| `PageToolbar` | Contextual action cluster | More than one primary pill CTA, or the same CTA repeated in page content |
| `SidebarNavItem` | Shell nav row, icon, active, focus, collapsed, and density chrome | Bespoke link/button classes that recreate sidebar navigation chrome |

**Checklist (run before every UI component PR):**

1. **Read the mount point** — open the parent layout/page and identify what container renders your component. What title, header, and surface does it already provide?
2. **Grep for repeated text** — search the route tree for your title/label string. If the same label appears 3+ times on one screen, deduplicate.
3. **Check surface nesting** — if the parent is already a Card, Sheet, or `DrawerSurfaceCard`, do not wrap children in another Card. Use `variant='flat'` or plain `div`.
4. **One heading per visual section** — a section gets exactly one title. If the container already renders one, your component renders zero.
5. **One primary toolbar action** — a `PageToolbar` gets zero or one primary
   pill CTA. Demote every supporting action.

**SidebarNavItem invariant:** every authenticated-shell sidebar row—link or
button—must compose `SidebarNavItem` or its exported
`getSidebarNavRowClassName` and `getSidebarNavIconClassName` helpers. Active,
focus, collapsed, nested, and density chrome belong to that primitive. Do not
copy its class string or create route-specific sidebar row styling.

This is the subtraction principle applied specifically to container boundaries. When in doubt, remove the inner chrome.

### No Decorative Hover Motion

- Hover states must not move layout or shift components without a product reason.
- Do **NOT** use `translate`, `scale`, lift-on-hover, or floating-card motion on buttons, cards, screenshots, auth surfaces, or marketing panels as a default polish move.
- Press/click compression is opt-in and uses the shared `--scale-press` token (`0.98`) only when an action has no immediate visible response. Dropdowns, accordions, tabs, toggles, and rail controls already communicate their state change and must not scale. Shared controls must disable the transform under reduced motion.
- Menus, panels, drawers, and sidebars may use intentional `translate`/`scale` motion for open/close because the movement communicates spatial state.
- Prefer background-color, border-color, text-color, opacity, or shadow changes for hover feedback.
- If motion is necessary because the UI is directly manipulating something spatial, it must be intentional and clearly tied to that interaction.

### No Native Browser Dialogs

- **NEVER** use `alert(...)`, `confirm(...)`, or `prompt(...)` — bare or via `globalThis` / `window` / `self` — anywhere in production app code.
- Native dialogs are blocking, unstyled, and break design-system + a11y guarantees.
- The Biome rule `noRestrictedGlobals` (level: error) catches bare calls; `pnpm --filter web lint:no-native-dialogs` catches `globalThis.X` / `window.X` forms — both run in CI.
- Canonical replacements:
  - **Confirmations (irreversible actions)** → `<ConfirmDialog>` from `@/components/molecules/ConfirmDialog`
  - **Notifications / async errors** → `toast.error()` / `toast.success()` from `@/components/feedback` (canonical feedback system; never import `sonner` directly)
  - **Reversible actions** → optimistic update + undo-toast (pattern not yet codified — file a Linear ticket if you need this)
  - **One interrupt at a time** → toasts, sheets, OS push, and in-flow prompts (vlog, pairing, What’s New) share one bus. A feature may not ship its own stacked popup. See `docs/NOTIFICATION_GUIDELINES.md` → “One interrupt bus”.
- See `DESIGN.md` → "Confirmations & Destructive Actions" for the full decision rule and copy guidance.
- Storybook stories (`*.stories.tsx`) and CLI scripts (`apps/web/scripts/**`) are exempted via the Biome override; they may use `alert()` for handler-fired signals.

### Performance Must Not Replace Route UIs

- **NEVER** replace a route's component with a different layout/design as a performance optimization.
- Use code-splitting (`dynamic()`), skeleton states, `Suspense`, and progressive hydration to make the *same* design faster.
- Screenshot test: before and after a perf PR, the fully-loaded page must look identical.
- If a route needs a genuinely different UI, that is a product decision requiring explicit approval, not a perf side effect.

### Layout Shift Prevention — Mandatory for All Agents

Before touching **any** component or surface, an agent **must** explicitly enumerate every possible visual state it can render (loading, empty, error, partial data, success, authenticated vs anonymous, with/without banners/status lines/status text, mobile vs desktop, collapsed vs expanded, first-message vs ongoing, securing/awaiting vs ready, etc.).

For every state transition, prevent **unexpected or uninitiated layout instability** and geometry changes unrelated to the state transition the user requested. Preserve scroll position, focus, selection, caret position, and hit targets unless changing one is the explicit interaction result.

Geometry changes are valid when they are the **direct, local, and deterministic result** of an explicit disclosure or navigation action and remain inside the declared interaction boundary. A collapsed accordion answer must have no footprint; opening it may move the following rows in that disclosure flow by exactly the opened panel's height.

For an async, loading, error, or content change, reserve space or use an overlay when reflow is not the component's semantic behavior. Skeletons, fixed status slots, and stable media aspect ratios are appropriate for system-initiated changes, not for hiding the semantic expansion of a disclosure.

No unrelated siblings outside the disclosure flow may jump because of animation mechanics. Animate only paint- or compositor-safe properties; semantic geometry changes should resolve directly. Under reduced motion, resolve height immediately and remove nonessential motion.

Add or update tests (Playwright layout guards, visual regression snapshots, bounding-box assertions on key containers, CLS metrics, or stability specs) for any non-trivial state changes. CLS excludes shifts shortly after qualifying user input, so browser metrics do not replace source guards that prove the change is bounded, local, deterministic, and owned by the requested state transition.

This rule is non-negotiable and applies to **all product work** (including onboarding, chat, dashboards, marketing, and shell surfaces). Violations block design review and PR landing. See also `DESIGN.md` (visual stability section), `docs/TESTING_GUIDELINES.md` (risk-based visual QA), and `AGENTS.md` (verification).

### Global UI Components Render Once

Global UI elements must only render in root `app/layout.tsx`:
- Cookie banners
- Toast providers
- Modal providers
- Analytics scripts

**NEVER** render these in individual pages or nested layouts — causes duplicate overlapping UI elements. Nested layouts must not mount `CookieBannerSection`, `ToastProvider`, or other analytics/provider singletons directly.

## Lesson Guard References

- Register new Tailwind v4 utility tokens in `@theme` or `@theme inline` in
  `globals.css`; a CSS variable declared only in `:root` does not emit utilities.
- Marketing signup CTAs use `/signup`. Do not send them to `/claim`, `/register`
  or `/waitlist`; the artist profile claim flow has a different intent.
  Exception: the paid Pro CTA is that claim intent and routes to `/claim`
  (EVENT: Tim, 2026-10-20, $12/month self-serve artist profile).
- Honor the marketing registry's above-the-fold hero contract: do not use a
  full-height hero shell that pushes the first proof element below the fold.
  Keep the opening proof in the composition without decorative inset cards.

Marketing surfaces add [marketing-ui](marketing-ui.md) (geometry, static rendering, screenshots, founder identity, ICP language).

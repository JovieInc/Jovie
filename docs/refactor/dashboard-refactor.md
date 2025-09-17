# Jovie Dashboard UI Refactor — Discovery, Migration Matrix, and Plan of Record

Last updated: 2025-09-12 19:14 PT

## Component Inventory (Focused on Dashboard)

| Path | Component(s) | Purpose | Issues (design/a11y/perf) | Duplicates |
|---|---|---|---|---|
| `app/dashboard/layout.tsx` | `DashboardLayoutClient` (client shell) | Auth gate, SSR data fetch, layout wrapper | Inline error UI; tokens used but one-off color classes; no shadcn/ui composition | Uses bespoke `Button`, `Sidebar`, `Tooltip` wrappers indirectly |
| `app/dashboard/DashboardLayoutClient.tsx` | `Sidebar`, `DashboardNav`, `EnhancedThemeToggle`, `FeedbackButton`, `UserButton` | Shell + nav + utilities | BEFORE: gradient overlays + left-heavy content. AFTER (PR#1): sticky minimal header + breadcrumb, centered container `max-w-5xl`; redundant header buttons removed | Multiple Button/Tooltip implementations (to consolidate) |
| `app/dashboard/overview/page.tsx` | `DashboardOverview` (server) | Overview tasks + CTA | Good SSR; uses local `Button`, Card; progress semantics OK | Button duplication |
| `app/dashboard/analytics/page.tsx` + `components/dashboard/DashboardAnalytics.tsx` | `DashboardAnalytics` | Client fetch + simple cards | Not lazy-splitting heavier charts (future); OK for MVP | — |
| `app/dashboard/audience/page.tsx` + `components/dashboard/DashboardAudience.tsx` | `DashboardAudience` | Placeholder CRM table | A11y hidden blur; table headers OK; uses bespoke buttons | Button duplication |
| `app/dashboard/links/page.tsx` + `components/dashboard/organisms/*Links*` | `EnhancedDashboardLinks`, `GroupedLinksManager` | Link manager forms | Mixed inputs, dialogs, modals; Headless UI usage; token drift | Input/Dialog/Combobox duplicates |
| `app/dashboard/settings/page.tsx` + `components/dashboard/organisms/Settings*` | `SettingsPolished` | Large forms | Mixed validation UX; bespoke inputs; Headless UI | Input/Dialog duplicates |
| `components/ui/*.tsx` | `Input`, `Textarea`, `Dialog`, `Combobox`, `Select`, `Tooltip`, `Badge`, etc. | Shared UI | Headless UI (`@headlessui/react`) used for several controls; custom Tooltip and duplicate tooltip file; partial shadcn style | Tooltip duplicate (`components/ui/tooltip.tsx` and `components/ui/Tooltip.tsx`) + atom wrapper |
| `components/ui/dropdown-menu.tsx` | `DropdownMenu*` (Radix) | Menu primitives | NOW themed to tokens (`bg-surface-1`, `border-subtle`, `text-primary-token`) | — |
| `components/ui/popover.tsx` | `Popover*` (Radix) | Simple tokenized popover | Uses CSS vars `--panel`, `--fg`; should align to `bg-surface-1`, `text-primary-token` later | — |
| `components/ui/Dialog.tsx` | `Dialog*` (Headless UI) | Dialog overlay/panel | Headless UI; migrate to Radix; ensure portal/focus traps | — |
| `components/ui/Combobox.tsx` | `Combobox` (Headless UI) | Search + select | Headless UI; complex styling; migrate to Radix+Command pattern | — |
| `components/molecules/UserButton.tsx` | `UserButton` | Account menu | BEFORE: Floating UI; AFTER (PR#1): shadcn `dropdown-menu` with tokens | — |
| `components/ui/Sidebar.tsx` | `Sidebar` | Layout navigation | Uses tokenized CSS variables; now unified to `bg-base` surfaces; still custom (keep) | `components/ui/Sidebar.backup.tsx` |
| `packages/ui/atoms/button.tsx` | `Button` (canonical) | Tokenized shadcn-like button | Good; cva-based; SSR-safe | Duplicated by `components/ui/Button.tsx` (deprecated) |
| `packages/ui/theme/tokens.ts` + `styles/globals.css` | Tokens + Tailwind v4 config | Theme + tokens | Solid; Tailwind v4 in place; dark/light parity defined | — |

## Migration Matrix

| Existing | New (shadcn/Radix) | Atomic Layer | Notes |
|---|---|---|---|
| `components/ui/Button.tsx` (deprecated), `components/atoms/CTAButton.tsx`, `components/atoms/FrostedButton.tsx`, loading variants | `@jovie/ui` `Button` | Atom | Codemod imports to `@jovie/ui` with `asChild` for `next/link` |
| `components/ui/tooltip.tsx` + `components/ui/Tooltip.tsx` + `components/atoms/Tooltip.tsx` | Canonical `@jovie/ui` Tooltip (Radix) | Atom | Established in this PR; app layer re-exports from UI pkg |
| `components/ui/Dialog.tsx` (Headless UI) | Radix Dialog, shadcn-styled wrapper under `@jovie/ui` | Atom | Replace Headless UI; ensure portal and focus traps |
| `components/ui/Input.tsx` (Headless UI) | shadcn Input | Atom | Remove Headless UI; align help/error/status to shadcn pattern |
| `components/ui/Combobox.tsx` (Headless UI) | Radix Popover + `Command` (shadcn) | Molecule | Keep features (async, keyboard), use `cmdk` pattern |
| `components/ui/Select.tsx` | Radix Select | Atom | Tokenize; ensure a11y |
| `components/ui/Toast*.tsx` | `sonner` unified with token theme | Organism | Already present; keep and theme via tokens |
| Sidebar/Topbar (`Sidebar`, `DashboardNav`) | Standardized Sidebar/Topbar in `@jovie/ui/organisms` | Organism | Keep current UX; unify styles | 
| `components/molecules/UserButton.tsx` (Floating UI) | shadcn `DropdownMenu` | Molecule | DONE in PR#1 |
| `components/ui/dropdown-menu.tsx` (neutral classes) | Tokenized dropdown menu | Atom | DONE in PR#1 |

## Delta Analysis

- Tailwind v4 and tokens are already present and solid (`tailwind.config.ts`, `styles/globals.css`, `packages/ui/theme/tokens.ts`). No theme reset required.
- UI package exists (`packages/ui`) with a canonical `Button` and utilities. We will expand it for Tooltip/Dialog/Input/etc.
- Headless UI is still used for `Input`, `Dialog`, `Combobox` — target for replacement with Radix + shadcn-styled wrappers.
- Duplicate Button/Tooltip variants exist across `components/ui` and atoms; select canonical from `packages/ui`.
- Clerk integration follows App Router and middleware guardrails; we will theme the Clerk shadcn components later in the sequence.

## Plan of Record (Incremental, Small, Green PRs)

1. Foundation (this PR)
   - Add canonical Tooltip to `@jovie/ui` using Radix primitives.
   - Re-export Tooltip from app-layer `components/ui/tooltip.tsx` for non-breaking paths.
   - Rewire `components/atoms/Tooltip.tsx` to import from `@jovie/ui` primitives.
   - Add discovery doc (this file).

   PR#1 delta actually included dashboard shell polish and dropdown menu tokenization:
   - Sticky header + breadcrumb in `app/dashboard/DashboardLayoutClient.tsx`.
   - Centered container `max-w-5xl` and removed redundant top-right buttons.
   - `components/molecules/UserButton.tsx` migrated to shadcn `dropdown-menu`.
   - `components/ui/dropdown-menu.tsx` themed to tokens.
   - `components/ui/Sidebar.tsx` surfaces aligned to `bg-base`.

2. Buttons adoption (PR2)
   - Replace `components/ui/Button` imports with `@jovie/ui` across `components/dashboard/**` (e.g., `DashboardNav`, `DashboardOverview`).
   - Ensure `asChild` with `next/link`. No visual changes.

3. Dialog/Input/Select baseline (PR3)
   - Introduce `@jovie/ui` Dialog, Input, Select built on Radix.
   - Replace Headless UI usage in `components/ui/Dialog.tsx`, `Input.tsx`, `Select.tsx` with re-exports to canonical.

4. Combobox replacement (PR4)
   - Build `Combobox` using Radix Popover + Command pattern in `@jovie/ui` (molecule).
   - Replace existing Headless UI combobox (feature parity: async, keyboard, status).

5. Layout shell polish (PR5)
   - Standardize Sidebar/Topbar as `@jovie/ui/organisms`.
   - Route-level skeletons and lazy-load heavier client views (charts/editors) via `next/dynamic`.

6. Clerk shadcn kit (PR6)
   - Wrap Clerk components with shadcn-styled theming consistent with tokens.
   - Verify hydration and protected layouts.

7. A11y + Perf sweep (PR7)
   - Axe checks on dashboard routes.
   - Bundle size/hydration baseline vs refactor deltas; dynamic imports where heavy.

8. Cleanup (PR8)
   - Remove deprecated duplicates; add deprecation tags; codemod import paths.

## Acceptance Criteria (for final state)

- Dark/light parity using Jovie tokens; SSR-first; zero hydration warnings.
- All interactions keyboard accessible; Radix portals for overlays; correct ARIA.
- One canonical component per type; imports resolve to `@jovie/ui`.
- Clerk UI themed via shadcn; auth behavior unchanged.
- Perf improved vs baseline; design consistency at Linear-level polish.

## Codemod Outline (planned)

- Replace `from '@/components/ui/Button'` → `from '@jovie/ui'`.
- Replace `from '@/components/ui/tooltip'` and `from '@/components/ui/Tooltip'` → `from '@jovie/ui'` (app layer keeps re-export temporarily).
- Components migrated to atomic structure: `@/components/atoms/`, `@/components/molecules/`, `@/components/organisms/`.
- Headless UI removals: migrate `Dialog`, `Input`, `Combobox`, `Select` imports to canonical `@jovie/ui` equivalents.

---

## PR #1 — Dashboard Shell Polish + shadcn Dropdown Menu

Scope:
- Breadcrumb + sticky minimal header; centered content container.
- User menu migrated to shadcn `dropdown-menu` and themed to tokens.
- Sidebar/inset surfaces aligned to tokenized `bg-base`.

Files changed:
- `app/dashboard/DashboardLayoutClient.tsx`
- `components/molecules/UserButton.tsx`
- `components/ui/dropdown-menu.tsx`
- `components/ui/Sidebar.tsx`
- `packages/ui/theme/tokens.ts`
Notes:
- No behavior regressions. All lint/typecheck green.
- Next steps target Headless UI removals (`Dialog`, `Combobox`, `Input/Select`).

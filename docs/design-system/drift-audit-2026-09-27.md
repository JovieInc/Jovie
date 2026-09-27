# Authenticated App Design-System Drift Audit (2026-09-27)

Scope: every authenticated route under `apps/web/app/app/(shell)/**` (96 pages)
and the shared sections they render. Method: a static import-graph scan per
route (transitive imports inside `apps/web`, shared DS layers counted
separately), a read-only pass over the canonical Pen file through the pencil
MCP (no writes), and the typed registries in `apps/web/data/`.

Pen status during the audit: `Jovie Design Studio — canonical.lib.pen` was
readable. The runtime masters cited below were read with `Get` only.

## Summary

| Drift class | Count (authed surface: `components/features`, `components/jovie`, `app/app`, 1,059 files) | Guardrail today |
|---|---|---|
| Pen identity unbound: app-screen components with `penRootId: null` while a Pen runtime master exists | 7 of 7 app-screen components, 11 of 11 DS atoms (Button is bound per variant) | None. No Pen-vs-code parity check for the authed app. |
| Retired shims and forks still importable | 4 retired in this PR (25 consumers migrated); `features/dashboard/tokens` barrel still has 7 consumers | **New:** `retired-modules.json` gate + ESLint |
| Raw Tailwind palette utilities (`text-amber-700`, `bg-white`, hex) | 765 occurrences in 139 files | Contrast ratchet (shrink-only), `no-hardcoded-theme-colors` |
| Arbitrary values (`w-[327px]`, `leading-[18px]`) | 999 in 272 files | Arbitrary-values ratchet (shrink-only) |
| Raw `<button>` | 293 in 175 files | Raw-button ratchet |
| Legacy `--linear-*` tokens | 351 in 103 files | Linear-namespace ratchet (903) |
| Visible 44/48px controls (`h-11`/`h-12`) | 189 in 97 files | Touch-target lint, not a visible-size cap |
| Danger colour alias sprawl (`text-error` / `text-destructive` / `text-red`, value-identical) | 264 in 122 files | None |
| Call-site restyle of `@jovie/ui` components | 240 files / 3,282 messages grandfathered | `shadcn/no-restyle` baseline |
| Parallel component families (status pills, entity headers, rails) | 7 status components, 5 entity-header variants, 8 rails outside `EntitySidebarShell` | Component-family ratchet (4 name families only) |

## Ranked drift table

Ranked by traffic (Ovie shell, chat, library/releases, contacts, settings,
tasks), then by drift density. "Signals" = raw palette / arbitrary / raw
button / `--linear-*` / oversize control counts in the route's own import graph.

| # | Route(s) | Signals | Main issues | Fix |
|---|---|---|---|---|
| 1 | Shell (all routes) | n/a | Code already matches the 2026-09-25 founder lock (sidebar 244, rows 28, header 44). Pen `JwsdW` App Shell still carries a 256px sidebar slot, and `xLyVs` App Header is 48px. Pen disagrees with Pen: `VgcZb` is 244 but its host slot is 256. | Design session: reconcile the Pen shell masters to 244/44 (D1). No code change. |
| 2 | `/app/chat`, `/app/chat/[id]` | 61 / 62 / 51 / 17 / 13 | Highest drift in the app. `TeleprompterShowcaseInterstitial`, `ChatStarterActionsRail`, and `SuggestedProfilesCarousel` hand-roll buttons and palette colours. The profile panel (`ProfileAboutTab`) has 15 `text-white`. | Migrate rail and chip buttons to `Button`/`IconButton`; move profile-panel colours to tokens. The chat empty state is intentionally bare (see memory), so nothing gets restored. |
| 3 | `/app/library`, `/app/dashboard/releases` | 23 / 26 / 23 / 23 / 4 | `AudioWaveformEditor` and `AddReleaseSidebar` have raw palette and `--linear-*` usage. Release rows vs Pen `tUaqW` (64px row, 40px art) are unverified. The release inspector vs Pen `z7lmbm` is unverified. | Token migration (mechanical). Row/inspector parity needs a Pen screenshot diff (design session, D4). |
| 4 | `/app/contacts`, `/app/settings/contacts` | 22 / 4 / 8 / 2 / 2 | The audience table initials palette (`cells/initials.ts`) is a private colour registry. `ContactDetailSidebar` composes `DrawerSection` directly instead of `EntitySidebarShell` + one entity header. | Put avatar colours behind the Avatar gradient master (Pen `s85buA`). Move the rail onto `EntityTabbedRail`. |
| 5 | `/app/tasks`, `/app/releases/[id]/tasks` | tasks 1 / 23 / 10 / 13 / 1; release tasks 19 / 2 / 10 / 2 / 1 | `TaskBoard` and `TasksPageClient` carry arbitrary geometry. `MetadataAgentPanel` uses a raw amber/red/emerald status palette. | Status colours → `Badge` variants / status glyph. Geometry → tokens. |
| 6 | `/app/settings/billing` | 10 / 2 / 0 / 0 / 0 | The canonical `Badge` is restyled at the call site with raw amber/emerald (17 grandfathered no-restyle messages). The stale warning uses a raw amber palette. | Drop the call-site restyle and use `Badge` variants plus `text-warning` (follow-up PR). |
| 7 | `/app/jovie-work` | 13 / 0 / 1 / 0 / 0 | `PHASE_STYLES` is a private status-pill palette (amber/blue/emerald/red). | Use `Badge` tone variants (`warning`/`info`/`success`/`error`). |
| 8 | `/app/settings/artist-profile` | 37 / 33 / 10 / 10 / 4 | Shares the profile-panel drift with chat. `MatchConfidenceBreakdown` hand-rolls a meter. | Same as #2. The meter needs a design decision (D6). |
| 9 | `/app/dashboard/release-plan` | 8 / 0 / 0 / 23 / 0 | `ReleaseMomentDrawer` has 22 `--linear-*` references and doesn't use `EntitySidebarShell`. | Migrate to the entity rail and canonical tokens. |
| 10 | `/app/tour-dates` | 10 / 1 / 2 / 0 / 1 | `TourDatesTable` uses raw palette. | Token migration. |
| 11 | `/app/admin/*` (35 pages) | `hud`: 18 / 70 / 1 / 4 / 4; `people`: 44 / 26 / 2 / 17 / 2; others ≤ 4 | Operator surfaces. `HudDashboardClient`, `AgentOsRunsPanel`, and `AdminReleasesTableUnified` (22 raw palette hits) are the worst. `admin/investors` wraps its table in `px-3` (inset table). | Lower priority (operator). Edge-to-edge tables are mechanical. |
| 12 | `/app/dashboard/*` (legacy aliases), `profile`, `audience`, `releases`, `threads`, `tipping`, `tracks` | 0 | Redirect-only. The registry already classifies them `legacy`/`alias`. | None. |

Tables: `UnifiedTable` itself is edge to edge. The one inset call site found is
`admin/investors/page.tsx` (`containerClassName='px-3 py-3'`). Pen's own
`A3fqK` Unified Table carries 10px side padding (`[2,10,8,10]`), which
conflicts with the 2026-09-25 "tables full width" direction (D2).

## Pen-vs-code identity map (proposed, not bound)

Every app-screen component is registered with `penRootId: null` and the
reason "no native canonical-Pen root is source-mapped". The canonical Pen file
does contain runtime masters for each. The registry rule forbids minting an ID
from source, so these are **proposals for the Pen owner to confirm with
save/readback proof**, not bindings:

| Registry id | Source | Pen runtime master |
|---|---|---|
| `component.app-shell-frame` | `organisms/AppShellFrame.tsx` | `JwsdW` Canonical / App Shell / Runtime |
| `component.app-shell-content-panel` | `organisms/AppShellContentPanel.tsx` | `JwsdW` › Shell Content Column (no standalone master) |
| `component.settings-panel` | `molecules/settings/SettingsPanel.tsx` | `PoNUx` Settings shell / `QA9C6` Settings navigation |
| `component.unified-table` | `organisms/table/organisms/UnifiedTable.tsx` | `A3fqK` Canonical / Unified Table / Runtime |
| `component.entity-sidebar` | `molecules/drawer/EntitySidebarShell.tsx` | `RosMb` Entity Sidebar Shell + `odpZ8` Entity Header |
| `component.empty-state` | `molecules/EmptyState.tsx` | `aWMQW` Library State Panel (closest; no generic master) |
| `component.error-fallback` | `organisms/DashboardErrorFallback.tsx` | none found |
| (unregistered) `PageToolbar` | `organisms/table/molecules/PageToolbar.tsx` | `ftsrB` Page Toolbar (40px, pad 6/20) |
| (unregistered) `SidebarNavItem` | `shell/SidebarNavItem.tsx` | `ki3Zp` Sidebar Nav Item (28px) |
| (unregistered) status glyph | 7 forks (below) | `jAcP1` atom.status-pill, `F0ZYd` Task Stage Glyph, `Y8zgo` Presence Status Glyph |

## Why drift keeps happening

1. **No authed-app Pen binding.** Marketing has `penContracts` and
   `data-pen-contract` bindings. The authed app has registries whose Pen
   identity is `null` by rule, so no test can say that a page diverges from
   Pen. Pen ships improvements and code never learns about them. This is the
   #1 gap.
2. **Deprecation without deletion.** Shims were marked `@deprecated` and kept
   "for backwards compatibility". New code copied old imports, and the shims
   kept consumers indefinitely: the Sidebar barrel had 25.
3. **Ratchets cap growth, not forks.** Existing ratchets count tokens,
   buttons, and arbitrary values. None of them notice a second status pill,
   entity header, or rail built from allowed primitives.
4. **Call-site restyle is grandfathered wholesale.** 3,282 `no-restyle`
   messages are baselined, so a canonical `Badge` restyled with raw amber
   passes CI.
5. **Value-identical aliases.** `error`, `destructive`, and bare `red` all
   resolve to the same colour, so authors pick at random and grep-based
   migrations miss call sites.

## Guardrails

Landed in this PR:

- `apps/web/data/designSystem/retired-modules.json` is the registry of
  retired forks, shims, and exports. Each row names its canonical
  replacement.
- `apps/web/tests/unit/design-system/retired-modules.test.ts` is a
  zero-tolerance CI gate. It fails when a retired file is recreated
  (case-exact), when any source/story/test imports or `vi.mock`s a retired
  specifier, or when a retired export reappears.
- `apps/web/eslint.config.js` feeds the same registry into
  `no-restricted-imports`, so the author sees the replacement at edit time.

Protocol: to retire a fork, migrate its consumers, delete it, and add a row
to the registry in the same PR. That makes deletion permanent.

Proposed next (tracked in the backlog):

- **Pen parity gate for authed components:** once the design session
  confirms the identity map above with readback proof, set `penRootId` and
  add a test that fails when a bound Pen master's geometry tokens (height,
  padding, radius) disagree with the source contract.
- **Component-family ratchet extension:** add `*StatusPill|*StatusBadge|
  *StatusDot|*Glyph` and `*Header` (entity) families.
- **Finish the `features/dashboard/tokens` barrel retirement:** 10 of 17
  consumers now import `@/components/tokens/linear-surface`. The remaining 7
  (three of them shared organisms, which inverts the dependency direction)
  carry pre-existing whole-file lint debt (`shadcn/no-restyle` outside the
  baseline, a react-compiler ref write, and label casing), so touching their
  import line fails pre-commit. Clear that debt first, then delete the barrel
  and add a `retired-modules.json` row.
- **Alias convergence:** retire `destructive` and bare `red` colour
  utilities in `apps/web` in favour of `error` (value-preserving), then ban
  them.

## Design decisions for the design session (not mechanical)

| Id | Decision needed | Evidence |
|---|---|---|
| D1 | Pen shell masters disagree with the 2026-09-25 lock: `JwsdW` sidebar slot 256 vs `VgcZb` 244; `xLyVs` App Header 48 vs 44. Confirm 244/44 and update the Pen masters. | Pen read 2026-09-27; `design-system.css` `--app-shell-sidebar-width: 244px`, `--app-shell-header-height: 44px` |
| D2 | `A3fqK` Unified Table has 10px side padding; Tim wants tables edge to edge. Update the Pen master, or confirm the 10px is cell padding rather than inset. | `tables-full-width-no-side-padding` memory |
| D3 | Page toolbar height: Pen `ftsrB` is 40; code `TABLE_TOOLBAR_SHELL_CLASS` is `h-11` (44) and `PAGE_TOOLBAR_CONTAINER_CLASS` is `min-h-10` (40). Pick one. | `PageToolbar.tsx:12,48` |
| D4 | Release row and inspector parity: `tUaqW` (64px row, 40px art, approval pill) and `z7lmbm` vs the library table and `ReleaseSidebar`. Needs a screenshot diff. | Pen masters exist; code parity is unverified |
| D5 | One status glyph owner. Pen has `jAcP1`, `F0ZYd`, and `Y8zgo`; code has 7 forks (`atoms/StatusBadge`, `shell/StatusBadge`, `WorkflowStatusPill`, `OutreachStatusBadge`, `MatchStatusBadge`, `SettingsStatusPill`, `ProviderStatusDot`) and no `@jovie/ui` owner. Decide the atom API (glyph fill states) before code consolidates. | Principle 4, "status as glyph" |
| D6 | One entity header. Pen `odpZ8` vs code `EntityHeader`, `EntityHeaderCard` (18 consumers), `DrawerHeader`, `AudienceMemberHeader`, and `ContactDetailHeader`. Confirm the anatomy (thumb, title, details line, 16/20 padding) and which code component becomes the owner. | Principle 1, "entities are one IA" |
| D7 | Empty state and error fallback have no generic Pen master (`aWMQW` is library-specific). Design one, or declare `aWMQW` generic. | Registry identity map above |
| D8 | Settings screens: Pen has wide/compact frames for 7 settings routes (`QS4tK` billing and others). Confirm they're current before code parity work. | Pen top-level frames |

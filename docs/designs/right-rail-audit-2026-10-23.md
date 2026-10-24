# Web right-rail and table IA audit — 2026-10-23

Scope: Jovie web product, including operator/admin surfaces and every table family.
Source baseline: `664d6de81` (`origin/main` at inspection). No Linear issue — ad-hoc.
This is a source inventory plus the bounded rendered verification recorded below;
uninspected runtime states are not certified by source inspection.

## Decision and preservation contract

Profile preview is a regular entity rail (already decided by Tim). It must use
the same shell, identity hierarchy, dismissal, scroll ownership and width policy
as releases, contacts and other entities. A phone simulator is not the rail IA.
`PreviewDataHydrator` mounts `ProfileContactSidebar`, whose read-only
`ProfileBentoView` already uses `EntityHeader`. The old `layout/PreviewPanel.tsx`
phone frame is a legacy/story surface, not the current product mount; migrating
it alone would not fix the product.

Compose the existing `EntitySidebarShell` → `RightDrawer` owners. Use
`EntityTabbedRail` for ordinary tabbed entities and retain `InspectorShell` for
its richer loading/focus and library-tab contract. Do not create a second
`RightRail` owner. Contacts, audience and analytics already use the tabbed shell.

Preserve entity data, URLs, mutations, menus, artwork, field semantics and route
selection. Allowed delta in this PR: release and profile-edit rail composition,
flat section surfaces and one child-owned scrolling region with pinned tabs.
No flags, dependencies, token changes, gate changes or baseline changes.

Relevant locks/contracts:

- [Entity identity](../design-system/entity-identity.md): circular people,
  uncropped square releases and calendar events.
- `EntityHeader.tsx` documents Tim's 2026-09-25 single-identity-header contract.
  Keep one dominant identity and quiet supporting facts; no duplicate title bar.
- [DESIGN.md](../../DESIGN.md#authority-and-precedence) and
  [UI owner contracts](../../.claude/rules/ui.md#interaction-quality-contract).
- Pen `RosMb` is mapped to `component.entity-sidebar`; the source registry marks
  it reference-ineligible pending D6. This audit does not claim Pen parity.
- App sidebar/homepage, auth, canonical palette, CI and ratchet files are outside
  the edit boundary. The latest task specifies Noir Ion: Ion `#3FAFF3`, Ultra
  `#A789F0`, Pulse `#EB6AC6`, no orange. Consume semantic tokens, never local hex.

## Inventory and findings

Paths below are relative to `apps/web/`. Inventory used production imports,
`useRegisterRightPanel`, direct drawer/shell consumers, native table markup,
`UnifiedTable`/`AdminDataTable` consumers and shared rendering owners. Stories,
unit fixtures and experimental pages are separated from product surfaces.

### Rails and detail panels

| Entity / source | Current composition and finding | Priority / this PR |
| --- | --- | --- |
| Profile preview and edit — `components/features/dashboard/organisms/profile-contact-sidebar/ProfileContactSidebar.tsx`, `ProfileContactSidebarSections.tsx` | Preview is already a compact real entity; identity scrolls with summary, unlike pinned edit identity. Edit repeats tabbed layout locally. Skeleton and summary retain their current explicit mobile dismissal. | P1.1 edit covered; P1.2 preview pending |
| Release — `components/organisms/release-sidebar/ReleaseSidebar.tsx` | Pinned identity plus analytics; outer shell scroll wraps another scrolling tab card. Default width 344 differs from shared 360; preserve explicit width in this small change. | P1.1 covered: shared tabbed layout removes outer scroll; width policy pending P1.3 |
| Track — `components/organisms/release-sidebar/TrackSidebar.tsx`, `TrackDetailPanel.tsx` | `InspectorShell`, semantic tabs, internal scroll, source/confidence detail and back-to-release action. Retain richer inspector behavior; detail panel is nested content, not another rail owner. | P1.3, P3.2 |
| Contact — `components/features/dashboard/organisms/contacts-table/ContactDetailSidebar.tsx` | `EntityTabbedRail`; pinned identity, flat fields and territories. Debounced edits flush on close. Reference composition for ordinary entities. | Reference; P4.1 |
| Audience person — `components/features/dashboard/organisms/audience-member-sidebar/AudienceMemberSidebar.tsx` | `EntityTabbedRail`; activity/referrers can be long; keep identity and selection separate from table checkbox state. | Reference; P3.2, P4.1 |
| Analytics — `components/features/dashboard/organisms/AnalyticsSidebar.tsx` | Shared tabbed rail, explicit card variant, time-range controls and ranked details. Different card choice is intentional API support, not a second shell. | P1.3, P3.1 |
| Link inspector — `app/app/(shell)/links/LinksPageClient.tsx` | `LinkInspector` is a local `aside` with `lg:w-80`, bypassing the shared drawer shell, mobile focus and dismissal contract. Migrate it to the existing entity shell; retain destination, campaign, performance and open-entity actions. Profile/release smart-link details remain nested content in their owning rails. | P1.3, P3.1, P4.1 |
| DSP presence — `components/features/dashboard/organisms/dsp-presence/DspPresenceSidebar.tsx` | Shell-owned scroll, raised workspace and match/status/link/action sections. Identity is canonical but section surface policy differs. | P1.3, P3.1 |
| Tour date — `components/features/dashboard/organisms/tour-dates/TourDateSidebar.tsx` | Shell scroll, pinned event identity, multiple form/property/analytics sections. Long forms need footer/last-control visibility qualification. | P1.3, P3.2, P4.2 |
| Add release — `components/features/dashboard/organisms/release-provider-matrix/AddReleaseSidebar.tsx` | Form in shared shell; creation/error/close behavior is distinct from selected-entity inspection. Keep form actions explicit. | P1.3, P4.2 |
| AI crawler — `components/features/dashboard/organisms/ai-crawler/AiCrawlerDetailPanel.tsx` | Shared shell with child-scroll default but ordinary non-scrolling card children. Long crawler lists need an explicit scroll owner; pinned stats and teaser add density. | P1.3, P3.1, P4.2 |
| Presence / connection — `app/app/(shell)/profiles/ProfilesWorkspace.tsx`, `AddConnectionRail.tsx` | Shell-owned scroll; connection properties, identity checks, provider actions and add form. Distinguish selected entity from creation workflow. | P1.3, P3.2 |
| Library work/assets — `app/app/(shell)/library/LibrarySurface.tsx` | `InspectorShell` with object header and real tabs; retain its mounted-content loading/focus restoration contract. | Reference; P4.1–P4.3 |
| Private creator document — `app/app/(shell)/library/CreatorDocumentsWorkspace.tsx` | Shell-owned scroll and editable document content. Document editor keyboard ownership must win over rail shortcuts. | P1.3, P4.1 |
| Tasks — `components/features/dashboard/tasks/TasksPageClient.tsx`, `TaskDocument.tsx` | Release context uses shared shell; task document is primary workspace content, not an entity-rail duplicate. Preserve task selection and editor state. | P1.3, P4.1 |
| Chat entity host — `app/app/(shell)/chat/ChatEntityRightPanelHost.tsx` | Release/contact/tour-date loading or unavailable shells precede real entity components. Fallbacks must inherit the same width, dismissal and identity policy. | P1.3, P4.1 |
| Admin creator — `components/features/admin/admin-creator-profiles/AdminProfileSidebar.tsx` | `AdminDetailRail`, custom tabbed card, enrichment/provenance and algorithm detail. Legacy comment in creator table mentions RightDrawer; actual mount is shared. | P1.3, P3.1 |
| Admin user — `components/features/admin/admin-users-table/AdminUserDetailDrawer.tsx` | Flat `AdminDetailRail`, shell scroll, dense identity/account properties. | P1.3, P3.2 |
| Admin contacts / certification — `components/features/admin/contacts-table/AdminContactsTable.tsx`, `certifications/CertificationDetailRail.tsx`, `FounderReviewRegistry.tsx` | Shared admin shell; lengthy certification/evidence groups. Distinguish evidence from primary decision/action and disclose supporting detail. | P1.3, P3.2 |
| Admin feedback / outbound — `components/features/admin/feedback-table/AdminFeedbackTable.tsx`, `outbound/OutboundRail.tsx` | Shared admin shell, long feedback/context/action groups; form state and consequential actions retain existing semantics. | P1.3, P3.2 |
| Admin shipping / company presence — `app/app/(shell)/admin/shipping/ShippingMatrix.tsx`, `admin/presence/CompanyPresenceWorkspace.tsx` | Shared admin shell; property/evidence sections are dense but use the canonical owner. | P1.3, P3.2 |
| Agent artifact — `components/features/admin/agent-os/ArtifactDrawer.tsx` | Inline `aside` below a top border, not a modal despite its name. It shows selected-run facts/gates inside its host. Decide whether it is inline detail or a true inspector before migrating; no modal focus contract is currently supplied by this component. | P1.3, P3.2, P4 |
| Release credits / calendar moment — `components/features/release/ReleaseCreditsDrawer.tsx`, `components/jovie/release-calendar/ReleaseMomentDrawer.tsx` | Purpose-specific dialogs/expansions, not registered right-rail replacements. Preserve their public/release interaction boundary. | P4.1–P4.3 |

Public profile `ProfileUnifiedDrawer`, `ListenDrawer`, `PayDrawer` and contact
sheets are public visitor action surfaces, not authenticated inspectors. Legal
and navigation sidebars are navigation. They must keep their existing canonical
modal/navigation owners; no bulk rail migration is proposed for them.

### Data tables

`UnifiedTable` owns semantics, virtualization, focus/selection, sorting, loading
and empty geometry. `AdminDataTable` composes it with schema widths and compact
operator density. `table.styles.ts` and `tableRowModeStyle` are the source for
cell seams, type, numeric alignment, selection and row modes. Reusing the table
does not by itself certify a consumer's column design or rendered states.

| Surface / source | Layout, hierarchy and density finding | Priority |
| --- | --- | --- |
| Links — `app/app/(shell)/links/LinksPageClient.tsx` | Direct `TableRoot`/semantic row owners rather than `UnifiedTable`; selection opens a local inspector. Token primitives are reused, but sorting, focus and loading/empty parity need explicit coverage. | P2.2, P4.1 |
| Investors — `app/app/(shell)/admin/investors/_components/InvestorTablePrimitives.tsx` | Shared `TableRoot` with two-line row mode. Preserve investor-specific semantics and inspect consuming tables as one family. | P2.2, P4 |
| Releases — `components/features/dashboard/organisms/release-provider-matrix/ReleaseTable.tsx`, `ReleaseTableWithTracks.tsx` | Shared table and row-mode contracts; expanded tracks add dynamic height. Qualify selection vs expansion vs playback and horizontal column priority with rail open. | P2.2, P4 |
| Library — `app/app/(shell)/library/LibrarySurface.tsx` | Shared table with catalog/list modes and asset columns. Verify schema min-width and last actions with overlay rail, not only default view. | P2.2, P4 |
| Presence — `app/app/(shell)/profiles/ProfilesWorkspace.tsx` | Shared list row mode, min-width 0. Confirm identities and statuses remain readable before optional metadata. | P2.2, P4 |
| Audience — `components/features/dashboard/organisms/dashboard-audience-table/DashboardAudienceTableUnified.tsx` | Dense shared table, explicit keyboard support and contextual actions. Validate fan identity, engagement numerals and selected-member context across sort/filter. | P2.2, P4 |
| Contacts — `components/features/dashboard/organisms/contacts-table/ContactsTable.tsx` | Dense shared table with medium minimum width and inline actions. Preserve business/person identity and keyboard save/close behavior. | P2.2, P4 |
| DSP presence — `components/features/dashboard/organisms/dsp-presence/DspPresenceTable.tsx` | Shared table, 720px min-width. Prioritize provider/entity/match state; URLs and provenance are supporting detail. | P2.2, P3.1, P4 |
| Tour dates — `components/features/dashboard/organisms/tour-dates/TourDatesTable.tsx` | Shared table. Calendar identity, venue, time and status should precede provider/detail columns. | P2.2, P4 |
| Tasks — `components/features/dashboard/tasks/TaskDataTable.tsx` | Shared table adapter. Keep row focus, checkbox selection, task opening and embedded property controls distinct. | P2.2, P4.1 |
| Earnings — `components/features/dashboard/organisms/EarningsTab.tsx` | Shared transaction table. Numeric alignment, amount formatting and empty/loading stability need the same contract. | P2.2 |
| Promo downloads — `app/app/(shell)/dashboard/releases/[releaseId]/downloads/PromoDownloadsTable.tsx` | Shared table, 100% min-width. Long destinations/identities must truncate with an accessible recovery path. | P2.2, P4 |
| Admin creators, users, contacts, waitlist — corresponding `components/features/admin/*table*` / `admin-creator-profiles` | Shared admin table, dense mode. Creator/contact tables explicitly disable built-in keyboard navigation because they own navigation externally; verify their handlers rather than assuming keyboard absence. | P2.2, P4.1 |
| Admin releases and assets — `components/features/admin/admin-releases-table`, `admin-assets-table` | Shared admin table, two-line rows. Match thumbnail semantics and stable row heights across loading/data. | P2.2 |
| Admin activity, feedback, leads — `ActivityTableUnified.tsx`, `feedback-table/AdminFeedbackTable.tsx`, `leads/LeadTable.tsx` | Shared admin table; leads use dense mode. Text-heavy secondary detail can dominate primary entity/status. | P2.2, P3.1 |
| Admin founder review, certifications, agent runs — `FounderReviewRegistry.tsx`, `certifications/OvieCertificationsWorkspace.tsx`, `agent-os/AgentOsRunsPanel.tsx` | Shared admin tables with minimum widths. Keep subject/status/next action visible; group evidence and long identifiers. | P2.2, P3.2, P4 |
| Admin outbound, campaigns, review/email queues — `outbound/OutboundWorkspace.tsx`, `campaigns/InviteCampaignManager.tsx`, `outreach/ReviewQueuePanel.tsx`, `outreach/EmailQueuePanel.tsx` | Shared admin tables; min-widths 440–980px. Campaign has two tables. Qualify controls and rail overlays at each minimum. | P2.2, P4 |
| Admin costs, features, company presence — `app/app/(shell)/admin/costs/CostsTable.tsx`, `features/AdminFeaturesTable.tsx`, `presence/CompanyPresenceWorkspace.tsx` | Shared admin table; description/controls/two-line modes respectively. Preserve stable control geometry and narrow identity columns before metadata. | P2.2, P4 |
| Shipping matrix / statistics — `app/app/(shell)/admin/shipping/ShippingMatrix.tsx`, `ShippingStatistics.tsx` | Raw semantic tables, independent header/cell/density construction. Candidate for shared owner after specialized matrix semantics are assessed. | P2.1 |
| Founder funnel — `components/features/admin/hud/FounderFunnelDrilldown.tsx` | Raw table; local type and spacing do not inherit the shared row/loading/column contract. | P2.1 |
| Shipping velocity — `components/features/admin/ShippingVelocityCanvas.tsx` | Raw table accompanies the visual velocity canvas. Preserve its alternative-data semantics; assess visibility and interaction separately before converting. | P2.1, P4.1 |
| Feature audit — `app/app/(shell)/admin/features/FeatureFlagAuditSection.tsx` | Raw read-only audit table with local compact styles. Existing flag inventory is audit scope only; this PR adds no flags. | P2.1 |
| Revenue lift — `app/app/(shell)/admin/revenue-lift/RevenueLiftDashboardView.tsx` | Three raw tables, local 32/36/40rem minimums and text-sm. Strongest operator density/overflow exception to assess. | P2.1 |
| Scoreboard — `app/app/(shell)/admin/_components/AdminScoreboardSection.tsx` | Screen-reader-only table is an accessible alternative to a visual scoreboard, not an accidental visible table fork. Preserve semantics. | P4.1 |

`components/organisms/home-loop/HomeLoopLatency.tsx` uses `UnifiedTable`; qualify its metric alignment and loading state with P2.2. `components/organisms/PageShell.tsx` is a scaffold compatibility adapter; its table example is documentation, not another table implementation. Admin activity loading now uses `ActivityTableSkeleton`, rather than the retired native table mentioned in its comment; keep skeleton/data geometry paired.

`SemanticTable`, `UnifiedTableSkeleton` and `VirtualizedTableRow` are table
internals; `ContentTable` is a prose table owner. Public pricing/comparison and
launch tables (`PricingComparisonChart`, `ComparisonPageContent`, launch page)
have marketing semantics. Dev specimens, `exp/library-v1`, and Storybook examples
are not production product tables. Keep these distinctions when measuring drift.

## Full prioritized fix list

1. **P1.1 — Unify release and profile-edit anatomy on `EntityTabbedRail`.**
   **Covered in this PR.** Extend the existing owner only for stable id, width,
   keyboard-handler and inline-tab-action passthrough. Remove the release's
   nested outer scrollbar and local tabbed compositions from both entities.
   Identity and tab controls remain pinned; only details scroll.
2. **P1.2 — Finish regular-entity profile-preview parity.** Keep the existing
   compact entity preview; move its identity/dismissal into the shared pinned
   header contract and align skeleton/summary/edit geometry. Do not restore a
   phone simulator or add a special profile-only shell.
3. **P1.3 — Apply one rail contract to remaining entities and fallbacks.**
   Migrate the standalone link inspector. Document intentional creation/inspector variants, normalize width and surface
   policy, and give crawler content an explicit scroll owner. Reconcile the
   ownership doc's in-flow claim with the current overlay implementation.
4. **P2.1 — Converge raw operator tables on the shared table system.** Start
   with revenue lift, shipping, feature audit and funnel tables. Preserve matrix
   semantics and the scoreboard's screen-reader alternative.
5. **P2.2 — Normalize table hierarchy and density.** Use schema/row-mode owners,
   shared header/cell seams, tabular right-aligned numeric values, semantic
   thumbnails and a visible identity → status → action column priority; qualify
   loading/empty/error/selected/expanded states without changing thresholds.
6. **P2.3 — Reconcile palette debt at the canonical owner.** The task's Ion
   anchor differs from the older ZiaWI/design text (`#11AFFF`); warning tokens
   can still resolve to orange. Resolve that source-of-truth drift centrally in
   separately scoped work. Do not hand-tune rail colors or claim semantic-token
   usage proves the requested rendered palette.
7. **P3.1 — Subtract repeated facts and chrome.** Keep one identity/title,
   one action group and one meaningful status; avoid repeating analytics,
   connection counts or destination links in stacked cards. This PR removes
   the migrated entities' extra inner card surface, not all content repetition.
8. **P3.2 — Make long detail/evidence groups scannable.** Put the next action
   and essential properties first; disclose secondary provenance, crawler,
   certification and track data with existing primitives. Preserve access to
   original values and long/truncated strings.
9. **P4.1 — Qualify the complete keyboard path.** Table row → rail → tabs →
   fields/menu → Escape → originating row, including portalled controls,
   editor-owned keys, disabled/pending actions and selection after sort/filter.
   Do not equate external table navigation with missing keyboard support.
10. **P4.2 — Establish full-screen ultrawide as the rendered baseline.** Check
    3440×1440 first, then 2560×1440 and 1440×900; rail open/closed, last table
    columns, long content, scroll ownership, hover/focus geometry and footer
    reachability. Current `AppShellRightRail` is an overlay; verify obscuration
    explicitly rather than claiming it reserves table width.
11. **P4.3 — Qualify compact and accessibility variants.** Check 390×844,
    200% text/zoom, long names, light/dark, reduced motion, visible focus,
    screen-reader names, focus return and mobile body-scroll locking. Keep
    canonical rounded controls and compact readable type.

## Measurement and verification

Primary engineering acceptance: two production entity rails consume the same
existing tabbed owner and each has one details scroll region. Preserve tab
selection/reset behavior, mutations, add-link controls, stable rail id, width,
context menus and keyboard handling. No conversion/time-saving claim is made.

Ship now: the bounded P1.1 composition fix. Re-evaluate when another entity needs
a distinct shell override or the ultrawide matrix exposes obscured controls.
Then: extend the existing owner or fix its geometry with a failing regression
first; do not fork the shell. Rollback is the source commit revert.

GBrain retrieval: concept query and exact-token search both timed out; prior
ownership retrieval is `gbrain-unavailable`. Repo source and the explicit user
brief govern this audit. Exact-slug GBrain read later succeeded with `page_not_found`; this does not recover prior ownership decisions. Linear live read confirms broader admin convergence is already In Progress under [JOV-8098](https://linear.app/jovie/issue/JOV-8098); preserve that lane. Historical [JOV-4651](https://linear.app/jovie/issue/JOV-4651) records entity-first order and is Done; it is prior context, not current runtime proof. Durable write/readback outcome and executable/rendered
receipts are recorded here before PR publication.

Remaining product items are tracked in [JOV-8920](https://linear.app/jovie/issue/JOV-8920); admin items are appended to the existing [JOV-8098](https://linear.app/jovie/issue/JOV-8098) lane. GBrain `design/jovie-right-rail-audit-2026-10-23` was written (request timed out) and then successfully read back with the intended source findings and pre-fix test receipt.

### Local verification receipts

- Pre-fix command: `pnpm --filter @jovie/web exec vitest run components/molecules/drawer/EntityTabbedRail.test.tsx tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx --reporter=dot`. Result: 24 passed, 2 failed. The new action was absent and release details still reported shell-owned scrolling.
- Post-fix six-file focused run: 61 passed; the read-only profile summary test exceeded its unchanged 5000ms deadline under severe host memory pressure. Its unchanged file then passed all 5 tests with `pnpm --filter @jovie/web exec vitest run tests/unit/dashboard/ProfileContactSidebar.scroll.test.tsx --config=vitest.config.mts --maxWorkers=1 --reporter=verbose`. Release action parity, profile optimistic saves/recovery, and shared-shell behavior assertions are retained.
- Biome lint: all 8 touched code/test files passed; no fixes applied.
- ESLint: all 8 touched code/test files passed with `--max-warnings=0`.
- `git diff --check` and `python3 scripts/repository_docs.py` passed.
- Coverage, final committed-diff component qualification, full web typecheck, and rendered baseline/candidate evidence are pending. The pre-commit component-gate result with no changed committed components is not a qualification receipt for this change.

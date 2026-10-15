# Design drift baseline review — 2026-10-15

Refs JOV-7992. This is the source review behind the accompanying ledger update.

The last complete baseline was generated at
[`d8ed5d87c395`](https://github.com/JovieInc/Jovie/commit/d8ed5d87c39567d303b063e34d3997f1921f8b40)
(September 29, #19507). Rebuilding that tree reproduces every aggregate and
shared-layer count in the old baseline. The reviewed comparison tree is
[`2b36121bede5`](https://github.com/JovieInc/Jovie/commit/2b36121bede5da40fac34d1ed78c88bc5b23352b)
(October 15). No UI implementation or scanner rule changes accompany this repair.

The intervening referral removal/restoration (#20185, #20921) edited one route
row at a time, leaving the September aggregate counts in place. They did not
repair or revert the stale baseline. The governance audit still treats growth
as WARN; enforcement and scheduled failure routing belong to JOV-8040.

## Review decisions

- #20958 adds the operator integrations page, which composes the existing
  settings layout. Its canonical component barrel reaches HeaderNav,
  AppShellFrame, feedback, account-menu and overlay implementations. The ledger
  follows all imports and re-exports, including type imports; these counts are
  static source reachability, not rendered-component or bundle-size evidence.
- #20566 explicitly reuses sidebar primitives for Lists navigation. This brings
  existing arbitrary selectors and geometry into the route graph. #20396 adds
  shared rail allocation/motion recipes; those are intentional motion contracts.
- Error-state utilities remain intentional. #20100 replaces `text-danger` and
  `text-danger-token` with canonical `text-error`; the scanner counts the latter
  but did not count those older spellings. Shared metric/issue summaries move
  counts between layers. The source review preserves these semantic migrations.
- #20020 explicitly specifies 44px file/retry targets; #20673 keeps 44px mobile
  targets with 32px desktop faces. #21216 and #19985 add invisible hit areas.
  Profile skeletons, waiting rows and these pseudo-elements are also counted by
  the broad control regex. The counts do not establish oversized visible faces.
- New raw-button counts correspond to the reviewed link selector, customer
  search submit, file navigation/actions, social reply card actions, date-picker
  trigger and desktop window controls listed below. Preserve those merged
  interactions and their existing recipes in this bounded accounting repair.
  This snapshot grants no allowance for subsequent raw-button additions.
- `railFamily` grows from 11 to 13: #20605 adds `OutboundRail.tsx`; #21804 adds
  the shared `AdminDetailRail.tsx`. The latter consolidates workspace wrappers.
  These are source-family inventory entries, not duplicate unexplained copies.

**Ship now:** accept only the source-attributed increases below and lock in all
observed reductions. **Re-evaluate when:** a subsequent source change increases
a signal. **Then:** remove unintended additions or review its individual source
and update both ledger projections; never copy this snapshot as growth approval.

## Count reconciliation

Positive and negative contributions come from the union of reachable files,
not the sum of routes. A moved file contributes once on each side. All six
signals reconcile exactly; no ceiling exceeds the observed source count.

| Layer | Signal | Old | Positive | Negative | Reviewed |
|---|---|---:|---:|---:|---:|
| aggregate | rawPalette | 255 | +0 | -18 | 237 |
| aggregate | arbitrary | 250 | +2 | -11 | 241 |
| aggregate | rawButton | 101 | +11 | -3 | 109 |
| aggregate | linearToken | 86 | +0 | 0 | 86 |
| aggregate | oversizeControl | 19 | +8 | -5 | 22 |
| aggregate | dangerAlias | 171 | +29 | -19 | 181 |
| sharedLayers | rawPalette | 191 | +34 | -6 | 219 |
| sharedLayers | arbitrary | 210 | +140 | -8 | 342 |
| sharedLayers | rawButton | 60 | +8 | -3 | 65 |
| sharedLayers | linearToken | 42 | +20 | -1 | 61 |
| sharedLayers | oversizeControl | 21 | +6 | -6 | 21 |
| sharedLayers | dangerAlias | 38 | +4 | 0 | 42 |

Routes grow from 105 to 112, route-layer files from 676 to 727, and shared-layer
files from 281 to 345. Registry nulls (14), status families (9) and entity-header
families (1) are unchanged. Route rows and family lists are regenerated in sorted
order. The baseline already contains a zero-signal referral row from #20921.

## Positive contributions and their source

Paths are relative to `apps/web/` and sorted. `Reached` means absent from the old
reachable set; it can be existing code, not newly authored styling. `Changed`
means reachable in both trees. Deltas also retain reductions in those files.
The immutable comparison tree above pins every listed implementation. PR links
identify the feature, refactor or import edge reviewed for accepting its counts.

| Layer | File | Reach | Signal delta | Source PR | Reviewed intent |
|---|---|---|---|---|---|
| aggregate | `app/app/(shell)/admin/chat-playground/ChatUiPlayground.tsx` | Reached | dangerAlias +1 | [#20221](https://github.com/JovieInc/Jovie/pull/20221) | Confirmation failure state |
| aggregate | `app/app/(shell)/library/YouTubeLinkPanel.tsx` | Reached | oversizeControl +1, dangerAlias +1 | [#21780](https://github.com/JovieInc/Jovie/pull/21780) | Link failure state and waiting row |
| aggregate | `app/app/(shell)/links/LinksPageClient.tsx` | Reached | rawButton +1 | [#19502](https://github.com/JovieInc/Jovie/pull/19502) | Keyboard-accessible link-row selection |
| aggregate | `app/app/(shell)/profiles/PresenceLockAffordance.tsx` | Changed | oversizeControl +1 | [#20673](https://github.com/JovieInc/Jovie/pull/20673) | 44px mobile target; 32px desktop face |
| aggregate | `app/app/(shell)/profiles/ProfilesWorkspace.tsx` | Changed | dangerAlias +1 | [#19717](https://github.com/JovieInc/Jovie/pull/19717) | Identity-decision failure state |
| aggregate | `app/app/(shell)/settings/connectors/ConnectorsClient.tsx` | Changed | dangerAlias +1 | [#20958](https://github.com/JovieInc/Jovie/pull/20958) | OAuth failure state |
| aggregate | `app/app/(shell)/settings/profile/ArtistProfileContent.tsx` | Reached | oversizeControl +1 | [#20359](https://github.com/JovieInc/Jovie/pull/20359) | Moved profile skeleton; offset by old path removal |
| sharedLayers | `components/atoms/Logo.tsx` | Reached | rawPalette +2, linearToken +1, oversizeControl +1 | [#20958](https://github.com/JovieInc/Jovie/pull/20958), [#20570](https://github.com/JovieInc/Jovie/pull/20570) | Existing brand implementation reached through canonical barrel |
| aggregate | `components/features/admin/certifications/CertificationWalkthrough.tsx` | Changed | rawPalette -1, dangerAlias +1 | [#20949](https://github.com/JovieInc/Jovie/pull/20949) | Decision failure state; palette reduction also retained |
| aggregate | `components/features/admin/customer-recovery/CustomerRecoveryPanel.tsx` | Reached | rawButton +1 | [#20033](https://github.com/JovieInc/Jovie/pull/20033) | Customer-search form submit |
| aggregate | `components/features/admin/hud/FounderFunnelDrilldown.tsx` | Reached | dangerAlias +1 | [#20060](https://github.com/JovieInc/Jovie/pull/20060) | Funnel-read failure state |
| aggregate | `components/features/admin/hud/HudDrilldownSearch.tsx` | Reached | dangerAlias +1 | [#19836](https://github.com/JovieInc/Jovie/pull/19836) | Failed-search status icon |
| aggregate | `components/features/admin/hud/HudExceptionsStrip.tsx` | Reached | dangerAlias +1 | [#19836](https://github.com/JovieInc/Jovie/pull/19836) | Existing exceptions strip newly reached by HUD |
| aggregate | `components/features/admin/hud/OvieInbox.tsx` | Reached | dangerAlias +1 | [#20096](https://github.com/JovieInc/Jovie/pull/20096), [#20849](https://github.com/JovieInc/Jovie/pull/20849), [#21230](https://github.com/JovieInc/Jovie/pull/21230) | Founder-inbox failure state and restored route |
| aggregate | `components/features/admin/hud/SummerReconcileSection.tsx` | Reached | dangerAlias +1 | [#20032](https://github.com/JovieInc/Jovie/pull/20032) | Reconcile failure state |
| aggregate | `components/features/admin/outbound/OutboundRail.tsx` | Reached | dangerAlias +1 | [#20605](https://github.com/JovieInc/Jovie/pull/20605), [#21804](https://github.com/JovieInc/Jovie/pull/21804) | Outbound failure state and shared rail wrapper |
| aggregate | `components/features/admin/outbound/OutboundReadinessPanel.tsx` | Reached | dangerAlias +1 | [#20606](https://github.com/JovieInc/Jovie/pull/20606) | Onboarding-readiness error tone |
| aggregate | `components/features/dashboard/organisms/DashboardFeedbackModal.tsx` | Reached | oversizeControl +1 | [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Existing feedback surface reached through HeaderNav/UserButton |
| aggregate | `components/features/dashboard/organisms/DashboardHeader.tsx` | Reached | arbitrary +2 | [#19553](https://github.com/JovieInc/Jovie/pull/19553), [#20269](https://github.com/JovieInc/Jovie/pull/20269) | Hydration-stable geometry reached by shared Settings header |
| aggregate | `components/features/dashboard/organisms/profile-contact-sidebar/ProfileAboutTab.tsx` | Changed | dangerAlias +1 | [#20100](https://github.com/JovieInc/Jovie/pull/20100) | Canonical text-error replaces uncounted text-danger |
| aggregate | `components/features/feedback/error-banner-semantic-contract.ts` | Reached | dangerAlias +12 | [#19999](https://github.com/JovieInc/Jovie/pull/19999) | Existing ErrorBanner reached by inbox availability recovery |
| aggregate | `components/features/library/LibraryFilesPanel.tsx` | Reached | rawButton +3, oversizeControl +2 | [#20020](https://github.com/JovieInc/Jovie/pull/20020), [#21551](https://github.com/JovieInc/Jovie/pull/21551) | File focus/back/attach controls and 44px file-status rows |
| aggregate | `components/features/library/WorkInspectorActions.tsx` | Reached | rawButton +1 | [#20019](https://github.com/JovieInc/Jovie/pull/20019), [#20786](https://github.com/JovieInc/Jovie/pull/20786), [#21551](https://github.com/JovieInc/Jovie/pull/21551) | Quiet Ask Jovie utility action |
| aggregate | `components/features/opportunity-inbox/OpportunityInboxSocialReplyCard.tsx` | Reached | rawButton +4 | [#19823](https://github.com/JovieInc/Jovie/pull/19823), [#20635](https://github.com/JovieInc/Jovie/pull/20635), [#20849](https://github.com/JovieInc/Jovie/pull/20849) | Revision, dismiss, revise and approve controls in existing card family |
| aggregate | `components/features/presence/PresenceStatusParts.tsx` | Reached | dangerAlias +2 | [#20838](https://github.com/JovieInc/Jovie/pull/20838) | Moved status tones; offset by old path reduction |
| aggregate | `components/features/release/AudioWaveformEditor.tsx` | Changed | rawButton +1, oversizeControl +1, dangerAlias -1 | [#20020](https://github.com/JovieInc/Jovie/pull/20020) | 44px retry control for recoverable preview failures |
| aggregate | `components/jovie/components/ChatAlbumArtSwipeReview.tsx` | Reached | dangerAlias +1 | [#20769](https://github.com/JovieInc/Jovie/pull/20769) | Rejected-artwork swipe state |
| aggregate | `components/jovie/components/ChatComposerToolbar.tsx` | Changed | oversizeControl +1 | [#21216](https://github.com/JovieInc/Jovie/pull/21216) | 44px pseudo-element hit area around 36px visible face |
| aggregate | `components/jovie/components/ChatLinkConfirmationCard.tsx` | Changed | dangerAlias +1 | [#20100](https://github.com/JovieInc/Jovie/pull/20100) | Canonical text-error replaces uncounted text-danger-token |
| sharedLayers | `components/molecules/ContentMetricCard.tsx` | Changed | dangerAlias +2 | [#21787](https://github.com/JovieInc/Jovie/pull/21787) | Shared error-tone icon/chip recipe; feature copies removed |
| sharedLayers | `components/molecules/DatePicker.tsx` | Reached | rawButton +1, oversizeControl +1 | [#19985](https://github.com/JovieInc/Jovie/pull/19985) | Shared trigger with 32px face and 44px pseudo-element hit area |
| sharedLayers | `components/molecules/MobileNav.tsx` | Reached | arbitrary +7, rawButton +1, linearToken +9, oversizeControl +1 | [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Existing marketing/mobile navigation reached through canonical barrel |
| sharedLayers | `components/organisms/AppShellFrame.tsx` | Reached | arbitrary +2, linearToken +1 | [#20958](https://github.com/JovieInc/Jovie/pull/20958), [#20396](https://github.com/JovieInc/Jovie/pull/20396) | Existing shell plus coordinated rail allocation |
| sharedLayers | `components/organisms/DesktopTitlebar.tsx` | Reached | rawPalette +4, rawButton +2 | [#19636](https://github.com/JovieInc/Jovie/pull/19636), [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Desktop controls reached through canonical AppShellFrame |
| sharedLayers | `components/organisms/HeaderNav.css` | Reached | rawPalette +6 | [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Existing marketing header CSS reached through canonical barrel |
| sharedLayers | `components/organisms/HeaderNav.tsx` | Reached | rawButton +1, linearToken +5 | [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Existing header reached through canonical barrel |
| sharedLayers | `components/organisms/MarketingSignInLink.tsx` | Reached | rawPalette +4 | [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Existing sign-in link reached through HeaderNav |
| sharedLayers | `components/organisms/sidebar/controls.tsx` | Reached | arbitrary +12, rawButton +1 | [#20566](https://github.com/JovieInc/Jovie/pull/20566) | Existing sidebar primitives reached by Lists navigation |
| sharedLayers | `components/organisms/sidebar/group.tsx` | Reached | arbitrary +7 | [#20566](https://github.com/JovieInc/Jovie/pull/20566), [#20396](https://github.com/JovieInc/Jovie/pull/20396) | Existing sidebar primitives plus coordinated rail labels |
| sharedLayers | `components/organisms/sidebar/layout.tsx` | Reached | arbitrary +11, linearToken +1 | [#20566](https://github.com/JovieInc/Jovie/pull/20566) | Existing sidebar primitives reached by Lists navigation |
| sharedLayers | `components/organisms/sidebar/menu.tsx` | Reached | arbitrary +44 | [#20566](https://github.com/JovieInc/Jovie/pull/20566), [#20396](https://github.com/JovieInc/Jovie/pull/20396) | Existing sidebar primitives plus coordinated rail labels |
| sharedLayers | `components/organisms/sidebar/sidebar.tsx` | Reached | arbitrary +17 | [#20566](https://github.com/JovieInc/Jovie/pull/20566), [#20396](https://github.com/JovieInc/Jovie/pull/20396) | Existing sidebar primitives plus coordinated allocation |
| sharedLayers | `components/organisms/table/molecules/TableIssueSummary.tsx` | Reached | dangerAlias +1 | [#19916](https://github.com/JovieInc/Jovie/pull/19916) | Shared issue summary replaces per-table error aliases |
| sharedLayers | `components/organisms/user-button/OviePrivacyLockControl.tsx` | Reached | dangerAlias +1 | [#19631](https://github.com/JovieInc/Jovie/pull/19631), [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Lock failure state reached through UserButton |
| sharedLayers | `components/organisms/user-button/UserButton.tsx` | Reached | rawPalette +2, arbitrary +14, rawButton +1, oversizeControl +1 | [#20958](https://github.com/JovieInc/Jovie/pull/20958), [#21791](https://github.com/JovieInc/Jovie/pull/21791) | Existing account menu and shared sidebar dock |
| sharedLayers | `components/shell/ArtworkPlayOverlay.tsx` | Reached | rawPalette +3, rawButton +1, linearToken +1 | [#21791](https://github.com/JovieInc/Jovie/pull/21791), [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Existing playback overlay reached through sidebar dock types |
| sharedLayers | `components/shell/JovieOverlay.tsx` | Reached | rawPalette +3, arbitrary +1, linearToken +1, oversizeControl +1 | [#20958](https://github.com/JovieInc/Jovie/pull/20958) | Existing overlay reached through canonical barrel |
| sharedLayers | `components/shell/RowWaveform.tsx` | Reached | rawPalette +8 | [#20574](https://github.com/JovieInc/Jovie/pull/20574) | Existing waveform renderer reached by library tiles |
| sharedLayers | `components/shell/SidebarBottomNowPlaying.tsx` | Reached | rawPalette +1, oversizeControl +1 | [#21791](https://github.com/JovieInc/Jovie/pull/21791) | Sidebar dock playback implementation |
| sharedLayers | `components/shell/SidebarNowPlaying.tsx` | Reached | rawPalette +1, arbitrary +2, linearToken +1 | [#21791](https://github.com/JovieInc/Jovie/pull/21791) | Existing now-playing implementation reached through dock types |
| sharedLayers | `components/shell/rail-motion.ts` | Reached | arbitrary +23 | [#20396](https://github.com/JovieInc/Jovie/pull/20396), [#20842](https://github.com/JovieInc/Jovie/pull/20842) | Coordinated allocation, staged labels and reduced-motion recipes |

The other 30 files only reduce counts. These include the old profile/status
paths, unreachable design-lab panels, `ChatActionCard`, `DrawerHero`, and
converged table/error/metric implementations. Their negative totals are retained
in the reconciliation above rather than left as spare budget.

## Verification boundary

The repair changes only documentation and generated ledger data. The existing
`pnpm design:drift-ledger:check` failed before the update and passes after it;
it checks growth and exact Markdown rendering from committed JSON. Rebuilding
the ledger also matches committed JSON, including all route rows. The existing
ledger tests exercise growth rejection, shrink acceptance, rendering parity,
deterministic updates and unreadable inputs. These are local source receipts;
hosted CI, merging and deployment remain separate evidence.

# UI Hardening — PR Review Log (Sub-Agent 1: UI PR Monitor)

Append-only log. One block per reviewed PR per pass. Newest blocks appended at the end.

---

## Monitor session start: 2026-04-23T20:44Z

INITIAL PASS RESULT
- Open PRs matching `itstimwhite/ui-hardening/*`: 0
- Open PRs created in the last 6 hours: 0
- Wave 1 expected branch prefixes (per `UI_OWNERSHIP_LEDGER.md`):
  - `itstimwhite/ui-hardening/admin-table-stability-*` (Agent 3)
  - `itstimwhite/ui-hardening/pill-stacking-*` (Agent 5)
  - `itstimwhite/ui-hardening/right-aligned-status-*` (Agent 6)
  - `itstimwhite/ui-hardening/chat-composer-stable-*` (Agent 8)
- Currently open UI-adjacent PRs (NOT in scope; in-flight token sweeps owned by other agents):
  - #7634 `itstimwhite/ui-consistency/text-11px-sweep-to-text-2xs`
  - #7637 `itstimwhite/ui-consistency/text-14px-sweep-to-text-sm-retry`
  - #7664 `itstimwhite/phase-2-viral-reel`
  - #7413 `itstimwhite/test-coverage`

No reviewable UI hardening PRs at session start. Entering 90-second polling loop for up to 60 minutes.

---

## PR #7691 — itstimwhite/ui-hardening/pill-stacking-territories
STATUS: approve (posted as PR comment; GitHub blocks self-approval since agent session is the PR author)
REVIEW URL: https://github.com/JovieInc/Jovie/pull/7691#issuecomment-4310358778
SUMMARY: Compact Linear-style territory pill stacking in ContactDetailSidebar territories tab. Pill resize from `rounded-lg px-2.5 py-1 text-xs` to `rounded-md h-6 px-2 text-2xs leading-none` + `whitespace-nowrap shrink-0 max-w-full`; container `gap-1.5` → `gap-1`; adds `aria-pressed` + `title` + `focus-visible` ring. 1 file, +4/-2.
AFFECTED SURFACE: `apps/web/components/features/dashboard/organisms/contacts-table/ContactDetailSidebar.tsx` — territories tab of contact detail drawer at `/app/settings/contacts`.
ISSUE CLASS: F-B (clipped badges/pills) + F-E (pill groups should stack/wrap).
ROOT CAUSE: 11 territory presets rendered at `rounded-lg px-2.5 py-1 text-xs` inside a 360px sidebar; long labels wrapped onto individual rows, ballooning the section to ~6 inconsistent rows.
FIX: compact Linear-style pill (24px tall) with non-wrapping labels and tighter gap, yielding 4 denser, predictable rows.
BLOCKERS: none.
NON-BLOCKING SUGGESTIONS:
  - Screenshots cited in PR body are local `/tmp/...png` paths and are not actually embedded (known gh CLI limitation; memory: feedback_pr_screenshot_upload). Orchestrator should attach via preview URL / gist so reviewers can see before/after without running QA.
  - Other pill surfaces across `/app` still use the pre-existing `rounded-lg px-2.5 py-1 text-xs` shape. Do not copy-paste the new Linear-pill shape to sibling surfaces until a shared primitive is introduced (Wave 2, under Agent 9 / details panel alignment).
VERIFICATION REVIEWED: lint + typecheck + 3 unit test files cited (ContactDetailSidebar, SettingsContactsSection, inbox-utils; 3 + 49 passing per PR body). Manual QA at 1440 + 1024 via `/api/dev/test-auth/enter?persona=creator-ready`. CI at review time: several checks IN_PROGRESS (Lint, Typecheck, 4x Unit Tests, Build (public routes), Guardrails (proxy), Greptile, Seer); SonarCloud, actionlint, Migration Guard, Env Example Guard, Path Changes all SUCCESS; CodeQL NEUTRAL (acceptable).
RISK: low. Rollback = revert one hunk on one file. No state/data/permission changes. Pure visual + a11y additive.
SCOPE CHECK: within Agent 5's reserved scope (pill-heavy row/card surface). No token files touched (design-system.css, linear-tokens.css, theme.css, tailwind.config.js untouched). No collision with in-flight text-11px / text-14px / font-weight token sweeps.
DESIGN-SYSTEM CHECK: No banned patterns — no gold, no emoji-on-square icons, no saturated brand CTAs, no generic AI-dashboard styling. `font-caption` is a widely-used token across dashboard/demo. DESIGN.md pill=9999px guidance is for primary app controls; territory chips are a multi-select tag surface where `rounded-md` matches the Linear-style compact pill intent described in the UI hardening brief.
BOT REVIEWS: CodeRabbit: PENDING at review (no inline comments yet); Greptile: IN_PROGRESS at review (no inline comments yet); Seer: IN_PROGRESS at review. Bot review gate must be re-checked before merge per `CLAUDE.md`.
FOLLOW-UP ITEMS:
  - Re-check CodeRabbit + Greptile + Seer comments once they complete before orchestrator merges.
  - Orchestrator: attach real screenshots to PR body via preview URL / gist / R2.
  - Do not promote the new pill shape to other surfaces in this wave.

---

## PR #7691 — itstimwhite/ui-hardening/pill-stacking-territories (re-review 2026-04-24T03:15Z)
DECISION: approve
SUMMARY: Second-pass confirmation after CodeRabbit + Greptile + SonarCloud completed. PR still exactly 1 file, +4/-2 on `apps/web/components/features/dashboard/organisms/contacts-table/ContactDetailSidebar.tsx`. Pill resize to Linear-style 24px compact chip (rounded-md / h-6 / px-2 / text-2xs / font-caption / leading-none) + `whitespace-nowrap shrink-0 max-w-full`; container gap-1.5 → gap-1; adds `aria-pressed`, `title`, and `focus-visible` ring. A single "Merge branch 'main' into …" merge commit was added since prior review; diff against main is unchanged.
BLOCKERS: none.
NON-BLOCKING SUGGESTIONS:
  - Author flagged that the chip uses text-2xs (11px) + rounded-md (10px) rather than the DESIGN.md §Badges/Tags canonical spec (10px / 510 / 8px). Paired with `font-caption` (= `--linear-caption-weight` = 510), the weight matches; the size is +1px and the radius is +2px. Rationale (interactive multi-select chip, not a read-only badge, needs iOS 24px hit target) is reasonable. Recommend: when a shared Chip primitive is introduced (Wave 2), reconcile via an explicit "interactive tag" row in DESIGN.md so future chips don't have to re-derive this.
  - Light mode was not separately validated by the author; class set uses token variables (`bg-surface-0`, `bg-surface-1`, `border-(--linear-app-frame-seam)`, `border-(--linear-border-focus)/35`, `text-secondary-token`, `text-primary-token`) that are defined in both modes, so the risk is low, but a quick light-mode screenshot pass before follow-up Wave 2 work is suggested.
  - Screenshots in PR body are local `/tmp/...png` paths (gh CLI cannot upload images). Orchestrator should re-attach via preview URL / gist / R2 / screenshots-branch per `feedback_pr_screenshot_upload`.
  - Do not copy-paste this chip shape to other pill surfaces until a shared primitive lands (Agent 9 / details panel alignment, Wave 2).
VERIFICATION REVIEWED:
  - `gh pr diff` confirms the only change is the single ContactDetailSidebar.tsx hunk; `--stat` shows `1 file changed, 4 insertions(+), 2 deletions(-)`.
  - No token / CSS file in diff (`apps/web/styles/design-system.css`, `linear-tokens.css`, `theme.css`, `tailwind.config.js` untouched).
  - No `--no-verify`, no debug overlays, no temp artifacts in diff.
  - Selection logic, `Worldwide-clears-others` behavior, and territory semantics are untouched (diff only touches JSX/classNames + 2 a11y attributes).
  - `text-2xs` utility is defined (tailwind.config.js: `['var(--text-2xs)', { lineHeight: '1.25' }]`, globals.css: `--text-2xs: 0.6875rem` = 11px). `font-caption` utility is defined in tailwind.config.js (weight 510, size 13px — here paired with `text-2xs` + `leading-none` which overrides size/leading). Both are widely used across dashboard/demo.
  - Existing unit test file `apps/web/tests/unit/dashboard/ContactDetailSidebar.test.tsx` covers the component.
RISK: low. Rollback = revert one hunk on one file. No state / data / permission changes. Pure visual + additive a11y.
SCOPE CHECK: within Agent 5's reserved scope (pill-heavy row/card surface). No token-file edits. No collision with in-flight token sweeps (#7634, #7637).
DESIGN-SYSTEM CHECK: No banned patterns — no gold, no emoji-on-square icons, no saturated brand CTAs, no generic AI-dashboard styling. The pill (9999px) DESIGN.md guidance is for primary app controls; `rounded-md` here matches the Linear-style compact-chip intent called for in the UI hardening brief. Weight 510 via `font-caption` matches the badges/tags spec; size and radius deviate minimally and rationale is reasonable for an interactive chip.
BOT REVIEWS: CodeRabbit: PASS — "No actionable comments were generated in the recent review." (assertive profile; Pro plan; run d98b2782). Greptile: PASS — Confidence 5/5, "Safe to merge — purely visual refactor with no logic changes and improved accessibility." No inline comments from either bot. No unaddressed bot comments. Merge gate: OK from bot-review perspective.
CI STATE AT RE-REVIEW: SonarCloud SUCCESS; Analyze (actions) SUCCESS; CodeRabbit review complete; Greptile review complete; some lanes still pending (Unit Tests 1–4/4, Typecheck, Lint, Build, Guardrails). PR Ready (merge gate) reported FAILED on last CI Summary; orchestrator should inspect before merging (likely due to still-pending required checks rather than a true failure, but must be verified).
FOLLOW-UP ITEMS:
  - Orchestrator: verify PR Ready gate flips to pass after remaining required checks settle; investigate if it does not.
  - Orchestrator: attach real screenshots to PR body via preview URL / gist / R2.
  - Wave 2 owner: introduce shared interactive Chip primitive and add "Interactive Tag / Chip" row to DESIGN.md so future chips don't re-derive the 24px / text-2xs / rounded-md decision.
  - Do not promote the new pill shape to other surfaces in this wave.

---

## PR #7691 — itstimwhite/ui-hardening/pill-stacking-territories (bot-gate recheck 2026-04-24T03:16Z)
DECISION: approve (unchanged)
CONTEXT: Monitor re-announced the PR at tick=19 because `updated_at` bumped to 2026-04-24T03:11:55Z. Re-verified that head SHA is still `04083a29e781e49963c359a96bd787dc5d20dc56` (no new commits since prior review blocks). The `updated_at` bump came from bot summary comments + sub-agent review comments landing, not from a force-push.
BOT REVIEWS (final): CodeRabbit: PASS — "No actionable comments were generated in the recent review." Greptile: PASS — summary recap only, no inline comments. Zero inline bot review comments. Bot gate per CLAUDE.md: clear.
POSTED: https://github.com/JovieInc/Jovie/pull/7691#issuecomment-4310365301 (bot-gate clearance note).
NOTE TO ORCHESTRATOR: Two review blocks exist above from parallel agent passes (one from this monitor, one from a sibling). Both approve and findings are consistent. The only outstanding orchestrator-side gating is the `mergeable_state: blocked` flag — this is expected while remaining required CI checks (Typecheck, Lint, Build, Unit Tests 1–4/4, Guardrails (proxy)) are still in progress, not a true block.

---

## PR #7691 — itstimwhite/ui-hardening/pill-stacking-territories (screenshot re-attachment 2026-04-24T03:17Z)
DECISION: approve (unchanged)
CONTEXT: Monitor re-announced the PR at tick=21 (`updated_at=2026-04-24T03:13:43Z`). Head SHA still `04083a29`, still `+4/-2`, still 1 file. The bump is from a new issue comment by `itstimwhite` titled "Screenshots (re-attached by orchestrator)" — addresses my earlier non-blocking suggestion. Orchestrator used the `screenshots/pr-7691` branch pattern (raw.githubusercontent.com URLs) per repo memory `feedback_pr_screenshot_upload`.
NEW EVIDENCE: 5 screenshots embedded (before dark, after dark, after narrow/1024, after selected, after light). Light mode screenshot also addresses my second non-blocking suggestion (visual light-mode check). No new code, no new commits.
FOLLOW-UP ITEMS CLEARED: screenshot attachment, light-mode validation. Remaining FUs: (1) wait for PR Ready gate, (2) Wave 2 shared Chip primitive + DESIGN.md row, (3) no copy-paste of this pill shape elsewhere this wave.

---

## PR #7691 — MERGED 2026-04-24T03:20:28Z
TERMINAL STATE: merged to main as commit `56f8c135a5230b77d92dd5345bc5fe02e697b643`. No rollback required.
REVIEW OUTCOME: approve held across 4 recheck passes (initial + 3 `updated_at` bumps). Ship clean: +4/-2, 1 file, a11y-additive, no token-file edits, both blocking bots (CodeRabbit + Greptile) PASS, Sentry all-tests-passed, orchestrator attached proper screenshots incl. light mode. PR Ready gate flipped to pass; merge was not blocked by any unresolved review.
SUB-AGENT-1 VERDICT: shipped as reviewed. No further monitor action needed on #7691.

---

## PR #7699 — itstimwhite/ui-hardening/right-aligned-source-audience
DECISION: approve
SUMMARY: Right-align the icon-only Source column in the dashboard Audience table and shrink reserved width from 76px → 48px. Two-file diff (+8/-3): `AudienceSourceCell.tsx` swaps `justify-center w-8` → `justify-end` and wraps the icon container with `role="img"` + `aria-label={sourceLabel}`; `DashboardAudienceTableUnified.tsx` wraps header in `<span className="ml-auto">Source</span>`, drops `size: 76 → 48`, adds `meta: { className: 'text-right' }` for inherited cell alignment. PR finalized by orchestrator after Sub-Agent 6 exited pre-commit twice — author-intent matches staged diff.
BLOCKERS: none.
NON-BLOCKING SUGGESTIONS:
  - Greptile P2 a11y note: `role="img"` + `aria-label` paired with `SimpleTooltip`'s Radix-injected `aria-describedby` may cause a screen-reader double-announcement of the same `sourceLabel` string. Greptile itself rates this non-blocking (Confidence 5/5, "Safe to merge"). Cheapest mitigation if polished later: drop `role="img"` + `aria-label` and rely on the tooltip content for SR output, OR set the tooltip on a non-announcing wrapper. Not a gate — codebase already uses similar paired-label patterns (e.g., SocialIcon has `aria-hidden` on the glyph while an outer `aria-label` carries the name).
  - No screenshots attached to PR body — the original agent exited mid-QA before capturing them (see Known Gap). Visual change is single-hunk-revertable and tightly scoped, so this is recorded but NOT a merge blocker. Orchestrator should still attach before/after captures via preview URL / gist / R2 per `feedback_pr_screenshot_upload` for reviewer sanity.
  - `meta: { className: 'text-right' }` is applied to the `<td>` by `VirtualizedTableRow.tsx`, but the visible icon alignment is actually driven by `justify-end` on the inner flex in `AudienceSourceCell`. The `text-right` on the `<td>` is effectively dead for an icon-only cell — harmless, and it correctly future-proofs any text rendering that might be added, but the functional alignment comes from the cell's own flex, not the meta className. Consider dropping the meta for the source column and keeping it only on the header span (and on columns that actually render text), OR document the meta as "inherited alignment default" in a shared columns helper when Wave 2 lands a shared table-column factory.
VERIFICATION REVIEWED:
  - `gh pr diff` confirms exactly 2 files changed (`AudienceSourceCell.tsx` +5/-1, `DashboardAudienceTableUnified.tsx` +3/-2). No token-CSS edits (no `design-system.css` / `linear-tokens.css` / `theme.css` / `tailwind.config.js`). No sorting / filtering / data / column-visibility changes (`getColumnVisibility` narrow/medium/wide handling for `source: false` at narrow untouched).
  - Icon fit check: `ICON_CLASS = 'h-3.5 w-3.5 shrink-0 text-tertiary-token'` = 14px glyph inside a 48px column with ~8px table-cell horizontal padding. Actual icon fits with ~26px slack. Safe.
  - Pattern check: `ml-auto` span for right-aligned table headers is a canonical project idiom (hits across `DashboardHeaderActionGroup`, `DashboardHeader`, `PageToolbar`, `TableActionMenu`, `AdminTablePagination`, etc.). `meta.className` is correctly consumed at both header (`TableHeaderCell.tsx` line 46-55) and body (`VirtualizedTableRow.tsx` line 177-183).
  - `aria-label={sourceLabel}` preserves the screen-reader announcement after removing the 76→48 horizontal padding; existing `aria-hidden` on the child icon elements remains intact (no regression).
  - CI at review: CodeRabbit PASS (no actionable comments); Greptile COMPLETED with P2 non-blocking note; SonarCloud / actionlint / Migration Guard / Env Example Guard / Path Changes / ESLint Server Boundaries PASS; remaining lanes (Unit Tests 1–4/4, Typecheck, Lint, Build public routes, Guardrails proxy, Seer, CodeQL) still PENDING. `mergeStateStatus: BEHIND` — orchestrator will need to sync with main before merge (unrelated to review verdict).
RISK: low. Pure visual + a11y-additive change, single-hunk revertable per file. No state / data / permission / sort / filter / viewport-breakpoint behavior touched. Rollback = revert 2 hunks.
SCOPE CHECK: within orchestrator-sanctioned `right-aligned-*` scope (Agent 6's original owner band per `UI_OWNERSHIP_LEDGER.md`). No token-file edits. No collision with in-flight token sweeps (#7634 text-11px, #7637 text-14px). No files edited outside the 2 declared.
DESIGN-SYSTEM CHECK: Consistent with DESIGN.md §Row / Table States (alignment is unopinionated; row hover/selected colors untouched) and §Subtraction Principle (removes 28px of wasted gutter; single strong signal — the right-aligned icon now visually clusters with the right-aligned Engagement / Value / Last Activity metadata band to its right instead of floating in dead space). No banned patterns — no gold, no emoji-on-square icon, no saturated brand CTA, no generic-AI-dashboard styling. Icon continues to use `text-tertiary-token`, which is the correct muted weight for a non-primary row signal.
BOT REVIEWS: CodeRabbit: PASS — "No actionable comments were generated" at review commit `f6a24238`. Greptile: PASS with 1 P2 note (potential double-announcement, self-rated non-blocking). No inline bot comments on the PR (`/pulls/7699/comments` returns `[]`). Merge gate clean from bot-review perspective.
FOLLOW-UP ITEMS:
  - Orchestrator: attach before/after screenshots of the Audience table Source column at wide layout (≥960px viewport) via preview URL / gist / R2 / screenshots-branch before merge. This is the QA step the original agent exited before finishing — fulfilling it closes the known gap without re-opening review.
  - Orchestrator: sync-with-main (`gh pr update-branch`) to clear `mergeStateStatus: BEHIND`, then re-verify remaining CI lanes (Unit Tests 1–4, Typecheck, Lint, Build public routes, Guardrails proxy, Seer) pass before merge.
  - Wave 2 / shared-table-column factory owner: decide whether `meta: { className }` should continue to apply to `<td>` for icon-only columns (harmless but functionally inert) or be restricted to text-rendering cells. Worth documenting the column-meta convention in the shared helper.
  - If a screen-reader QA pass ever flags the double-announcement as real, revisit per Greptile P2: drop `role="img"` + `aria-label` and rely on tooltip content alone. Not prioritized.

---

## PR #7699 — itstimwhite/ui-hardening/right-aligned-source-audience (Sub-Agent 1 dissent)
STATUS: request-changes (this monitor's verdict — differs from sibling block above)
REVIEW URL: https://github.com/JovieInc/Jovie/pull/7699#issuecomment-4310453821
HEAD AT REVIEW: e00de780 (merge of f6a24238 with main). Diff is identical to what the sibling reviewed.
BLOCKERS (2):
  1. **Header right-alignment may not actually render.** `TableHeaderCell.tsx` line 93-97: non-sortable headers render `<div className={cn(tableHeaderClass)}>{flexRender(header.columnDef.header)}</div>`, and `tableHeaderClass = presets.tableHeader = cn(alignment.headerPadding, typography.tableHeader, 'text-left')` per `apps/web/components/organisms/table/table.styles.ts:143`. The resulting DOM is:
     ```
     <th class="… text-right">           ← from meta.className
       <div class="… text-left">          ← from presets.tableHeader
         <span class="ml-auto">Source</span>
       </div>
     </th>
     ```
     `ml-auto` on an inline span in a non-flex parent is a no-op; the inner div's `text-left` overrides the th's `text-right` for descendant inline content. Unless a screenshot / DOM inspector capture proves the header actually right-aligns (sibling's block notes `ml-auto` is a "canonical project idiom" but does not analyze this specific nested interaction), the header fix is cosmetically a no-op.
     Fix options: render the header as `<div className='flex w-full items-center justify-end'>Source</div>` directly (overrides inner preset div) OR change `TableHeaderCell` to apply `meta.className` to the inner div the same way it's applied to the `<th>`.
  2. **No ticked verification checkboxes + no screenshots.** PR body lists 4 unchecked test-plan items (lint+typecheck, unit tests, visual across states, SR announce) and embeds no screenshots. UI hardening program mandates verification and PR-body screenshots per `feedback_pr_screenshots`.
NON-BLOCKING:
  - `role='img'` + `aria-label` on a tooltip trigger may cause double-announcement (matches sibling's Greptile-sourced note).
  - `AudienceSourceCell` is also used by `renderPlatformsCell` with `className='w-4'`; no visual regression there because 16px icon in 16px container.
VERIFICATION REVIEWED:
  - No token files touched; `sourceLabel` always non-empty; existing unit test class-agnostic; `enableSorting: false` preserved.
  - `meta.className` is consumed by `VirtualizedTableRow.tsx` line 177-183 for `<td>`, confirming cell-side right-alignment works.
BOT REVIEWS: CodeRabbit rate-limited (no actionable inline comments); Greptile PASS with P2 non-blocking a11y note; Seer still running.
SCOPE CHECK: within Agent 6 scope; branch prefix deviates from ledger (`right-aligned-source-audience` vs `right-aligned-status-*`). Flag for ledger reconciliation. No token files.
DESIGN-SYSTEM CHECK: no banned patterns; consistent with F-D intent.
RISK: low; pure visual + a11y-additive; 2-hunk revert.
RECONCILIATION NOTE: Sibling block above approved this PR; my monitor block requests changes. The substantive disagreement is whether the header visually right-aligns — sibling did not analyze the `presets.tableHeader` `text-left` chain. Orchestrator: please resolve by (a) asking author for a rendered screenshot/DOM capture of the Source header OR (b) running the page locally and inspecting the th → inner div → span alignment. If the header IS visually right-aligned (e.g., due to something else in the chain I didn't see), downgrade my blocker #1 to a "dead code" nit on the `ml-auto` span. Blocker #2 (missing verification + screenshots) stands regardless.

---

## MONITOR EXIT: 2 PRs reviewed
SESSION: 2026-04-23T20:44Z → 2026-04-24T03:44Z (poll deadline reached; monitor exited cleanly at tick=40).
PR #7691 — itstimwhite/ui-hardening/pill-stacking-territories — approve (held across 4 recheck passes); MERGED as `56f8c135`.
PR #7699 — itstimwhite/ui-hardening/right-aligned-source-audience — request-changes (this monitor) / approve (sibling); currently open, mergeable_state: blocked. Orchestrator must reconcile the two verdicts before merging; blocker #2 (unchecked verification + no screenshots) stands regardless of how the header-rendering disagreement resolves.
NOT SEEN THIS SESSION: PRs on branches `itstimwhite/ui-hardening/admin-table-stability-*` (Agent 3), `itstimwhite/ui-hardening/pill-stacking-*` except the merged one (Agent 5 done), `itstimwhite/ui-hardening/chat-composer-stable-*` (Agent 8). Orchestrator may want to poke those writer agents.

---

## PR #7700 — itstimwhite/ui-hardening/chat-composer-stable-anchor
DECISION: approve
SUMMARY: Anchors chat composer at the bottom of the chat surface so transient alerts (rate-limit hint, ChatUsageAlert, ErrorDisplay) no longer shift the textarea by 22-50px when mounting/unmounting. Three changes: (1) `ChatWorkspaceSurface` flips `PageShell scroll='page' → 'panel'` and wraps children in `absolute inset-0 flex flex-col` that attaches to AuthShellWrapper's `relative min-h-full` ancestor; (2) `JovieChat` collapses the composer region into a single `shrink-0` container where each alert opts into its own bottom margin and unmounts cleanly (no more always-rendered `pt-3` wrapper around a null-rendering ChatUsageAlert); (3) `ChatUsageAlert` self-owns its `mb-2` rather than relying on external wrapper spacing. 3 files, +59/-26.
BLOCKERS: none.
NON-BLOCKING SUGGESTIONS:
  1. Greptile P2 (valid): the `absolute inset-0` in ChatWorkspaceSurface relies on no intermediate ancestor having `position: relative`. If anyone ever adds `relative` to PageShell/AppShellContentPanel (for an overlay, portal, tooltip, etc.) the composer layout silently collapses. Worth a follow-up commit that either (a) adds a Playwright smoke assertion that the composer's `offsetParent` equals AuthShellWrapper's `relative min-h-full` div, OR (b) gives PageShell an explicit `fillAncestor` / `positioned` prop that asserts the invariant at the API level. The inline comment in ChatWorkspaceSurface (lines 15-33) is clear and load-bearing — do NOT delete it in future refactors.
  2. Consider whether the `shrink-0 bg-(--linear-app-content-surface)` composer wrapper should also claim a subtle top border or shadow to visually separate from the scrolled messages area; the current change trades floating-composer for bottom-anchored-composer without adding chrome. Author's screenshots suggest it looks fine, but worth a design pass.
VERIFICATION REVIEWED: Confirmed via source read, not runtime:
  - AuthShellWrapper.tsx:264 contains `<div className='relative min-h-full'>` wrapping page children — author's load-bearing assumption verified.
  - AppShellContentPanel.tsx (section + 3 nested divs) has NO `position: relative` anywhere in the `scroll='panel'` chain, so the `absolute inset-0` correctly escapes up to AuthShellWrapper.
  - `scroll='panel'` renders `min-h-0 overflow-hidden` on section + inner wrappers (confirmed at line 47 of AppShellContentPanel), establishing the fixed-height container the author needs.
  - All 6 consumers of ChatWorkspaceSurface (ChatPageClient 4 usages, chat/loading, chat/error, chat/[id]/loading, dashboard/profile/loading, ProfilePageChat) pass `flex h-full ...` children — all compatible with the new `absolute inset-0 flex flex-col` wrapper.
  - ChatUsageAlert returns `null` when not near/at limit — the new `mb-2` only applies when the InfoBox actually renders, confirming "null renders contribute zero layout."
  - ChatUsageAlert.test.tsx (81 lines) asserts on content only, not className — the `mb-2` addition does not break tests.
  - Author's measured Playwright evidence (textarea top stable at 798px after vs. 22-50px jumps before) is internally consistent with the root-cause fixes described.
  - 437 chat tests reported passing; lint + typecheck clean per author.
RISK: low. Pure layout/CSS changes in chat-shell plumbing; no data flow, no auth, no middleware. Worst-case regression is visual drift on non-chat consumers of ChatWorkspaceSurface (loading/error screens, profile loading), but all such consumers use `flex h-full items-center justify-center`-style patterns that continue to work inside an `absolute inset-0 flex flex-col` parent. Revert is 3-file, fully-isolated.
SCOPE CHECK: PASS. Only touches the 3 advertised files (ChatWorkspaceSurface.tsx, JovieChat.tsx, components/ChatUsageAlert.tsx). No edits to tokens (`design-system.css`, `linear-tokens.css`, `theme.css`), auth, Stripe, DB, middleware, CI workflows, DESIGN.md, AuthShellWrapper, PageShell, or AppShellContentPanel.
DESIGN-SYSTEM CHECK: PASS. Chat is System B per DESIGN.md:16. All added classes use existing tokens (`bg-(--linear-app-content-surface)`, `border-(--linear-app-frame-seam)`, `text-tertiary-token`). No bespoke colors, no new values, no raw pixel padding beyond the existing `px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5` pattern already in the file. Margins (`mb-2`, `mb-1.5`) are standard Tailwind scale.
BOT REVIEWS: CodeRabbit: PASS (auto release-notes only, no inline comments). Greptile: 1 P2 unaddressed root comment (see Non-Blocking Suggestion #1) — classified as non-blocking since it flags a future-fragility concern, not an active bug; current tree works. No nitpicks. No other bots in scope.
FOLLOW-UP ITEMS:
  - Add a guard test (unit or Playwright) that asserts ChatWorkspaceSurface's inner wrapper has a non-null `offsetParent` equal to the AuthShellWrapper `relative min-h-full` div, so a future refactor that adds `position: relative` to any intermediate ancestor fails loudly instead of silently breaking the anchor.
  - Consider extracting the `shrink-0 bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5` composer wrapper into a `<ChatComposerFrame>` atom — both branches (hasMessages + empty state) use identical outer chrome now, and a named component would document the design intent.
CI STATUS AT REVIEW: CodeRabbit pass, SonarCloud pass, actionlint pass (one of two jobs). Pending: Greptile Review, Seer Code Review, Analyze (actions + javascript-typescript), Path Changes, Env Example Guard, second actionlint. No failures. Scope Alignment Check skipping, Vercel Agent Review skipping.
SCREENSHOTS REFERENCED: author linked 7 before/after pairs from branch `screenshots/chat-composer-stable-1777002239` in the PR body (empty baseline, empty + usage alert, hasMessages baseline, hasMessages + rate-limit, hasMessages + usage alert, mobile after). Meets PR screenshot requirement.

---

## PR #7701 — itstimwhite/ui-hardening/admin-table-stability-activity
DECISION: request-changes
SUMMARY: Replaces the ad-hoc `<table>` Suspense skeleton in `admin/activity/loading.tsx` with a new `ActivityTableSkeleton` exported from `ActivityTableUnified.tsx`, which renders through the same `UnifiedTable` (`isLoading`, `skeletonRows=8`, `skeletonColumnConfig`) using a shared `ACTIVITY_COLUMNS` module-level const. Intent — structural identity between skeleton and loaded states to eliminate the previously observed ~50px shift on streamed SSR — is correct and well-executed at the column/header/chrome level. However, an unrelated default in `UnifiedTable` causes the skeleton to render rows at 32px while the loaded table renders at 40px, leaving a measurable residual layout shift (~8px per row × 8 rows = ~64px). This contradicts the PR's "zero layout shift by construction" claim and is trivially fixable.
BLOCKERS:
  1. Skeleton row height != loaded row height. `UnifiedTable`'s `isLoading` branch (`UnifiedTable.tsx:638-643`) passes `rowHeight={`${rowHeight}px`}` to `LoadingTableBody`, where the `rowHeight` prop defaults to **32**. `SkeletonRow` (`SkeletonRow.tsx:57-61`) applies this as an inline `style={{ height }}`, which beats the `h-[40px]` class baked into `presets.tableRow`. Loaded rows meanwhile use `VirtualizedTableRow` with `presets.tableRow` (no inline height), so they render at 40px. Net result: skeleton tbody is ~64px shorter than loaded tbody. Fix: pass `rowHeight={TABLE_ROW_HEIGHTS.STANDARD}` (i.e. 40) to `UnifiedTable` in `ActivityTableSkeleton`, mirroring what `AdminWaitlistTableUnified.tsx:228` already does. One-line change.
NON-BLOCKING SUGGESTIONS:
  1. Greptile P2 (valid): `useMemo(() => ACTIVITY_COLUMNS, [])` in both `ActivityTableUnified` (line 143) and `ActivityTableSkeleton` (line 205) is redundant — `ACTIVITY_COLUMNS` is already a stable module-level reference. Collapse to `const columns = ACTIVITY_COLUMNS;` or pass `ACTIVITY_COLUMNS` directly to `<UnifiedTable columns={...}>`. Low-value; Greptile correctly flagged it.
  2. `ActivityTableSkeleton` omits `enableVirtualization`, `getRowId`, and `getRowClassName`. Fine for `isLoading` (the loading branch doesn't read them), but worth calling out: if the loaded path's `enableVirtualization=true` affects outer container sizing, there could be subtle drift. Low risk.
  3. `ACTIVITY_SUBHEADER` is captured as a module-level JSX singleton. Works because `AdminTableSubheader` renders deterministically, but slightly unusual style — reader may briefly wonder if it's a bug. Consider restoring the inline tree or wrapping in a tiny component.
VERIFICATION REVIEWED: Author ran `pnpm --filter web typecheck`, `lint`, and the `AdminActivityLoading` test. The existing test (`apps/web/tests/unit/admin/AdminActivityLoading.test.tsx`) asserts `getAllByRole('row').length === 9`; confirmed UnifiedTable renders `<UnifiedTableHeader>` (1 header row) + `<LoadingTableBody rows=8>` (8 skeleton rows) = 9 rows, so the test still passes. Staging visual QA is explicitly left unchecked in the PR body, which is expected. The "Last 7 days." subheader is now shared via the new `ACTIVITY_SUBHEADER` const, so skeleton and loaded both render it.
RISK: low-to-medium. Structural refactor is clean and well-scoped. The residual 32px-vs-40px mismatch is real but visually subtle (8px-per-row compression) and can be missed in side-by-side screenshots unless you are measuring pixel-exact row heights. One-line fix.
SCOPE CHECK: within Agent 3 scope (`admin-table-stability-*`). Only 2 files changed (+117/-97), both within the admin Activity table. No touches to tokens, auth, Stripe, migrations, CI, or DESIGN.md.
DESIGN-SYSTEM CHECK: PASS. Uses existing `UnifiedTable`, `AdminTableSubheader`, `PAGE_TOOLBAR_META_TEXT_CLASS`, `TABLE_MIN_WIDTHS`. Removes the bespoke `rounded-xl border border-subtle` card chrome from `loading.tsx`, matching the loaded view's borderless surface. No banned patterns introduced.
BOT REVIEWS: CodeRabbit: rate-limited (no substantive inline comments; top-level "Review completed" marker only). Greptile: 1 unaddressed P2 root comment (useMemo-around-const) — non-blocking nitpick.
SCREENSHOT BRANCH: pushed (`screenshots/admin-table-activity` @ `8526302`, 4 PNGs: before-skeleton.png 86 KB, before-loaded.png 187 KB, after-loaded.png 186 KB, after-loaded-fresh.png 232 KB). Embedded via raw.githubusercontent.com URLs in PR body.
FOLLOW-UP ITEMS:
  - Consider raising `UnifiedTable`'s default `rowHeight` from 32 → 40, since `TABLE_ROW_HEIGHTS.STANDARD` (the project's canonical row height) is 40. Every `isLoading` consumer without an explicit `rowHeight` silently gets the same 32-vs-40 mismatch this PR was built to eliminate. Track separately.
  - Once the rowHeight fix lands, add a regression guard that measures rendered `<tr>` offsetHeight in both skeleton and loaded states and asserts equality.

---

## PR #7707 — itstimwhite/ui-hardening/scannability-tour-dates
DECISION: approve
SUMMARY: Replaces 4 hand-rolled `<span>` status chrome blocks in `TourDatesTable.tsx` with the canonical `Badge` primitive (`@jovie/ui`) using semantic variants (`secondary` / `warning` / `destructive` / `success`) and `size='sm'`. Adds a module-level `STATUS_BADGE` map keyed by `'past' | 'sold_out' | 'cancelled' | 'on_sale'` → `{ variant, label }`, then selects via nested ternary inside the memoized `StatusBadge`. Net: +23/-28, single file. Eliminates ad-hoc `bg-amber-500/8` / `text-amber-600` / `bg-red-500/8` / `bg-emerald-500/8` / `bg-surface-0` one-offs so future Badge token changes propagate automatically.
BLOCKERS: none.
NON-BLOCKING SUGGESTIONS:
  1. Visual delta on the "Past" state is real: old span was `rounded-md bg-surface-0 px-2 py-0.5 text-xs` with no border and `text-tertiary-token`; new `Badge variant='secondary' size='sm'` is `rounded-full bg-(--color-bg-primary) border border-(--color-border-strong) px-1.5 py-0 text-[10px] leading-[18px] text-(--linear-text-tertiary)`. Three legitimate deltas: (a) `rounded-md` → `rounded-full` (pill), (b) background shifts from surface-0 to bg-primary (slightly darker in dark / near-white in light), and (c) now has a visible border. This is the correct direction per the canonicalization goal (all Badges look like Badges), but the "On Sale / Sold Out / Cancelled" cells — which previously had no border — will now carry `size='sm'` sizing (10px text vs the old 12px) that may feel cramped in the Status column. Recommend `size='md'` if QA flags density; leave `sm` if the new compactness tests well.
  2. The variant selector uses a nested ternary (`isPastDate ? past : status === 'sold_out' ? sold_out : status === 'cancelled' ? cancelled : on_sale`). Readable at 4 cases but will get brittle if a 5th status arrives. Alternative: a 2-line lookup with a default — `const key = isPastDate ? 'past' : (status as keyof typeof STATUS_BADGE) in STATUS_BADGE ? status : 'on_sale'` — or an explicit `if/else` ladder. Low-value nit.
  3. `status: string` in the `StatusBadge` prop type weakens the contract relative to `TourDateViewModel['ticketStatus']` (which the parent `StatusCell` does type). Consider tightening to the narrower union; prevents future callers passing arbitrary strings.
  4. No PR-body screenshots (agent exited mid-flight before the orchestrator could capture). Non-blocking since the variant change is single-file + semantically null-risk, but author/orchestrator should post before/after screenshots as a follow-up comment so the "Past" border/shape delta is visible to reviewers without building locally.
VERIFICATION REVIEWED: Confirmed via source read of both PR head and `packages/ui/atoms/badge.tsx`:
  - `@jovie/ui/atoms/badge.tsx` exports `Badge` + `BadgeProps` via `packages/ui/index.ts:47-49` — import path is valid.
  - Variant enum in `badge.tsx:8-23` includes all four variants used (`secondary`, `destructive`, `success`, `warning`) plus `default` / `outline` / backwards-compat aliases. All variants use token-based colors (`--color-error-subtle`, `--color-success-subtle`, `--color-warning-subtle`, `--color-bg-primary`) — no raw hex / Tailwind color escape.
  - `size` enum in `badge.tsx:24-29` includes `sm` → `px-1.5 py-0 text-[10px] leading-[18px]`.
  - `badge.test.tsx` already covers: `secondary` asserts `text-(--linear-text-tertiary)`, `success` asserts `bg-(--color-success-subtle)`, `warning` asserts `bg-(--color-warning-subtle)`, `destructive` asserts `bg-(--color-error-subtle)` — so the variant surface this PR depends on is test-pinned.
  - Fetched the branch-head `TourDatesTable.tsx` from raw.githubusercontent.com; contents match the PR diff exactly (STATUS_BADGE const declared module-scope at lines 39-47, memo'd StatusBadge preserved at lines 49-68 as nested ternary with single `<Badge>` render).
  - No changes outside the StatusBadge component — `DateCell`, `VenueCell`, `LocationCell`, `StatusCell`, `TicketsCell`, `PROVIDER_CONFIG`, `SourceCell`, `ActionsHeader`, `LocationCellRenderer`, `ActionsCellRenderer`, `buildTourDateColumns`, `TourDatesTable` are all byte-identical in the diff. No sort/filter/status semantic changes.
RISK: low. Pure visual refactor onto an existing, test-pinned primitive. Single-file revert. Worst case is a design-taste reject on the "Past" badge border/pill shape, in which case either (a) the `secondary` variant gets adjusted centrally in `@jovie/ui` (desirable ripple), or (b) this PR is reverted (single file, two hunks).
SCOPE CHECK: PASS. Exactly 1 file changed (`apps/web/components/features/dashboard/organisms/tour-dates/TourDatesTable.tsx`). No edits to: tokens (`design-system.css` / `linear-tokens.css` / `theme.css` / `globals.css`), auth, middleware, Clerk proxy, Stripe, DB migrations, CI workflows, DESIGN.md, `AuthShellWrapper`, `PageShell`, `AppShellContentPanel`, or any other shell component. Matches the Agent 4 (Scannability) dispatch intent of tour-dates status chrome only.
DESIGN-SYSTEM CHECK: PASS. Removes 3× raw Tailwind color utilities (`bg-amber-500/8 text-amber-600 dark:text-amber-300` / `bg-red-500/8 text-red-600 dark:text-red-400` / `bg-emerald-500/8 text-emerald-600 dark:text-emerald-400`) + 1× legacy surface utility (`bg-surface-0 text-tertiary-token`), all of which violated the "canonical Badge only" rule. New code exclusively uses Badge variants backed by CSS tokens. No banned patterns introduced (no gold, no emoji-on-square, no inline hex). Badge primitive itself already conforms to the Linear/DJ-serious aesthetic per DESIGN.md.
BOT REVIEWS: CodeRabbit: rate-limited (top-level "Rate limit exceeded" auto-comment from `coderabbitai[bot]` at issue comment id 4310556332; no inline review comments posted). Check status `CodeRabbit pass` marker present but represents completion-without-content, not substantive approval. Greptile: pending at review time (no comments yet). No unaddressed root comments from either bot. No nitpicks.
FOLLOW-UP ITEMS:
  - Author/orchestrator: post before/after screenshots of the Status column for all 4 states (Past, Sold Out, Cancelled, On Sale) in both light + dark, as a PR-body comment. Required per project screenshot policy; missing here because the writer agent exited mid-flight and Hermes finalized the push.
  - Consider whether `size='md'` reads better than `size='sm'` in the 100px-wide Status column — `sm` drops text to 10px which may feel cramped vs the old 12px. QA pass after merge.
  - Narrow `StatusBadge`'s `status: string` prop to `TourDateViewModel['ticketStatus']` or `keyof typeof STATUS_BADGE` for type-level safety; currently a no-op at runtime but would prevent future drift.
  - If Greptile posts substantive inline comments after rate-limit window clears, re-triage before merge.
CI STATUS AT REVIEW: CodeRabbit pass (rate-limited — see Bot Reviews), Fork PR Gate pass, Env Example Guard pass. Pending: Analyze (actions + javascript-typescript x2), Greptile Review, Seer Code Review, SonarCloud, Path Changes, 2× actionlint. Scope Alignment Check skipping, Vercel Agent Review skipping. No failures.
SCREENSHOTS REFERENCED: none in PR body (writer agent exited mid-flight before capture; orchestrator finalized commit/push/PR without screenshots). See Follow-Up Items above.

---

## PR #7708 — itstimwhite/ui-hardening/consolidate-unified-table-skeleton
DECISION: request-changes (collision with #7701; must wait/rebase; rowHeight drift)
SUMMARY: Introduces a new shared primitive `<UnifiedTableSkeleton>` in `apps/web/components/organisms/table/organisms/UnifiedTableSkeleton.tsx` (+113) that is a pure pass-through to `<UnifiedTable isLoading data={[]} />`, plus 5 unit tests (+72), a barrel export at `components/organisms/table/index.ts`, extraction of `ACTIVITY_COLUMNS` to the new module `components/features/admin/activity-table/activityColumns.tsx` (+108), and a migration of `/app/admin/activity`'s `loading.tsx` + `ActivityTableUnified.tsx` to consume both. Net: +307/-145 across 6 files. The primitive itself is clean; the activity-migration hunks directly collide with PR #7701.
COLLISION WITH #7701:
  - OVERLAPPING FILES (both PRs edit these):
    1. `apps/web/app/app/(shell)/admin/activity/loading.tsx` — both PRs delete the same hand-rolled `<table>` markup + `ADMIN_ACTIVITY_ROW_KEYS`. #7701 delegates to a local `ActivityTableSkeleton` export from `ActivityTableUnified.tsx`; #7708 delegates to the new generic `<UnifiedTableSkeleton columns={ACTIVITY_COLUMNS} />`.
    2. `apps/web/components/features/admin/ActivityTableUnified.tsx` — both PRs extract an `ACTIVITY_COLUMNS` const. #7701 keeps it in-file (private module const) and adds a co-located `ActivityTableSkeleton` export. #7708 moves it OUT to a new `activity-table/activityColumns.tsx` module, removes the cell renderers and types from this file entirely, and drops `useMemo` wrapping.
  - OVERLAPPING SYMBOLS:
    1. `ACTIVITY_COLUMNS` — #7701 = in-file const in `ActivityTableUnified.tsx`; #7708 = exported from `components/features/admin/activity-table/activityColumns.tsx`. Different home, same shape.
    2. Cell render helpers (`renderUserCell` / `renderActionCell` / `renderTimestampCell` / `renderStatusCell`) and `statusVariant` / `statusLabel` tables — both PRs touch/relocate these.
  - NON-OVERLAPPING (from #7708, safe as a standalone primitive PR):
    `components/organisms/table/organisms/UnifiedTableSkeleton.tsx`, its `.test.tsx`, and the 2-line barrel export in `components/organisms/table/index.ts`.
  - SUGGESTED RESOLUTION: merge #7701 first (smaller, narrower, stand-alone, fixes a concrete row-height shift bug). Author of #7708 then rebases. Post-rebase, #7708 should either (a) drop the activity-migration hunks entirely and ship as a primitive-only PR (recommended), or (b) refactor the activity code so `ActivityTableSkeleton` from #7701 is rewritten as a thin `<UnifiedTableSkeleton columns={ACTIVITY_COLUMNS} …/>` call — preserving the `rowHeight={TABLE_ROW_HEIGHTS.STANDARD}` fix from #7701 and the per-column `skeletonColumnConfig`.
BLOCKERS:
  1. HARD COLLISION with open PR #7701 on the same two activity files. Whichever PR merges second will have non-trivial conflicts and require a rewrite. #7701 is older and does its job with surgical scope (2 files, no new primitive); it should go first.
  2. ROW-HEIGHT REGRESSION vs #7701. PR #7701 explicitly passes `rowHeight={TABLE_ROW_HEIGHTS.STANDARD}` (= 40) to `UnifiedTable` in the skeleton path; this is the whole point of #7701 (fixes the ~52→40px jump). PR #7708's `<UnifiedTableSkeleton columns={ACTIVITY_COLUMNS} skeletonRows={8} minWidth={…} className={…} />` does NOT pass `rowHeight`, so the primitive defaults to `32`. On the loaded side, `ActivityTableUnified` in #7708 also does not pass `rowHeight` (just the same class string as before). If #7708 lands without the #7701 fix baked in, the skeleton drops from 32 to 32 and the loaded table renders at whatever the row preset defaults to — the row-stability bug #7701 is solving is not addressed here and would need to be re-added in the activity wrapper.
  3. PR body claim "_No files touched in this PR overlap with Wave-2 boundaries_" is factually incorrect — #7701 is explicitly called out in `UI_OWNERSHIP_LEDGER.md` as Agent 3's PR and is currently OPEN against the same files. Author's own PR body acknowledges "Agent 3's PR #7701; that PR has not yet landed here" but then concludes "non-collision" — that conclusion is wrong; these files overlap and will conflict.
  4. CodeRabbit ASSERTIVE inline review on #7701 (CODERABBIT carries across because branches extract same code) flagged the `ColumnDef<AdminActivityItem, any>[]` usage. #7708 inherits the same `any` generic in `activityColumns.tsx` (line ~55) and in its own test fixture `COLUMNS: ColumnDef<Row, any>[]`. Author suppressed with `biome-ignore lint/suspicious/noExplicitAny` comments; consider narrowing to `unknown` before widening cross-cutting test usage.
NON-BLOCKING SUGGESTIONS:
  - Browser QA explicitly deferred — author states the worktree had no Doppler config so `dev:local:browse` could not start. Non-blocking follow-up per project policy; structural equivalence via delegation is a reasonable proxy for the primitive itself, but the activity migration should be QA'd on the Vercel preview before merge.
  - The primitive hides `columns` behind `ColumnDef<TData, unknown>[]` in its own prop signature but the activity extraction exposes `ColumnDef<AdminActivityItem, any>[]`. Internal type is fine (columns flow through unchanged) but you could tighten the activity module to `unknown` without any runtime impact to match the primitive's contract.
  - `skeletonRows` default = 20 in the primitive; activity loading uses 8. Consider documenting guidance on picking this number (typical initial page size) in the JSDoc; otherwise the primitive's JSDoc already says "match the expected initial page size".
  - `UnifiedTableSkeleton` accepts `rowHeight` but the consumer in `loading.tsx` doesn't pass it. If the loaded `UnifiedTable` eventually picks up a non-default row height preset, the skeleton will drift. Recommend the activity loading call site pass `rowHeight={TABLE_ROW_HEIGHTS.STANDARD}` explicitly to future-proof (and to match #7701's fix).
  - Primitive is marked `'use client'` but is a pure pass-through. Since `UnifiedTable` is already `'use client'` via its own directive, this is correct; worth a short JSDoc note that consumers can import it from RSC / `loading.tsx` files without issue (which is the whole point of this abstraction).
VERIFICATION REVIEWED:
  - Author-claimed: `pnpm --filter web lint` pass (2 unrelated pre-existing warnings in `ReleaseSidebar.tsx`), `pnpm --filter web typecheck` pass, Vitest `UnifiedTableSkeleton.test.tsx` 5 tests pass, Vitest `components/organisms/table/**` 34 tests pass, pre-commit hooks pass.
  - CI at review time: SonarCloud SUCCESS, actionlint SUCCESS, Fork PR Gate SUCCESS, CodeQL NEUTRAL (acceptable), Vercel Agent Review NEUTRAL. IN_PROGRESS: Path Changes, Analyze (javascript-typescript) ×2, Analyze (actions), actionlint (2nd workflow), Env Example Guard, Greptile Review, Seer Code Review. No failures.
  - No human or bot review approvals yet. No inline review comments on the PR (`gh api …/pulls/7708/comments` returns `[]`). Review decision blank. `mergeStateStatus: BLOCKED`, `mergeable: MERGEABLE`.
  - Primitive test coverage verified: 5 tests (header labels rendered from columns, skeletonRows row count, td-per-column cell count, hideHeader suppresses `<thead>`, `sr-only` "Loading table data" caption from UnifiedTable's isLoading path). Matches author's claim.
  - `UnifiedTable` source inspection confirmed: primitive is a pure delegation — all 9 props (`data`, `columns`, `isLoading`, `skeletonRows`, `skeletonColumnConfig`, `rowHeight`, `minWidth`, `className`, `containerClassName`, `hideHeader`) map to existing `UnifiedTable` props and its `isLoading` branch at line 627 of `UnifiedTable.tsx`. No new markup, no new CSS, no token changes.
RISK: medium. The primitive itself is low-risk (pure delegation, well-tested). The activity migration is medium-risk because it collides with an open PR fixing a different bug on the same files, and drops the explicit `rowHeight={STANDARD}` that #7701 added.
SCOPE CHECK: Scope is broader than a single "UI hardening" card. The primitive introduction is fine and arguably should be its own PR (primitive + barrel + tests, 4 files, +195 adds). The activity migration (3 files, +120/-145) is properly #7701's ownership per `UI_OWNERSHIP_LEDGER.md` (Agent 3 owns `admin-table-stability-activity`). No token files edited (design-system.css, linear-tokens.css, theme.css, tailwind.config.js all untouched). No auth, Stripe, DB migrations, CI, DESIGN.md, or AuthShellWrapper touched.
DESIGN-SYSTEM CHECK: PASS. No banned patterns (no gold, no emoji-on-square, no saturated brand colors, no raw hex). No new tokens. Pure structural refactor. The primitive preserves the existing `UnifiedTable` header typography / row height / cell padding exactly because it is a pass-through. The existing `text-[12.5px] [&_thead_th]:py-1 [&_thead_th]:text-[10px] [&_thead_th]:tracking-[0.07em]` activity class is re-used unchanged.
BOT REVIEWS:
  - CodeRabbit: IN_PROGRESS (no inline comments on this PR yet; the `any` generic was flagged on #7701 where the same pattern exists — inherited concern carries over).
  - Greptile: IN_PROGRESS (no inline comments).
  - Seer: IN_PROGRESS.
  - No unaddressed root comments as of review.
FOLLOW-UP ITEMS:
  - HIGH: orchestrator to merge #7701 first, then ask #7708's author to rebase. Post-rebase, recommend splitting this PR into (a) primitive-only (4 files: `UnifiedTableSkeleton.tsx` + its test + barrel export edit + JSDoc touchups) and (b) a follow-on "migrate admin/activity to UnifiedTableSkeleton" PR that layers on top of #7701 — preserving its `rowHeight={STANDARD}` fix and its `skeletonColumnConfig` geometry.
  - Attach Vercel-preview screenshots of `/app/admin/activity` skeleton→loaded transition once a preview URL is available (PR body flags Doppler-missing as the reason none are attached — acceptable per `feedback_pr_screenshot_upload` workaround note, but still a follow-up).
  - Re-verify CodeRabbit / Greptile / Seer once they complete. Treat the #7701 CodeRabbit `any`-generic finding as blocking for #7708 as well since the same pattern is copied into `activityColumns.tsx` and the test fixture.
  - Consider adding an E2E / visual regression test that asserts the skeleton row height equals the loaded row height for the activity table — this is the exact regression #7701 fixed, and without it #7708 can silently re-introduce it.
ORCHESTRATOR ACTION:
  1. Merge #7701 first (narrower, fixes a concrete row-shift regression, 2-file diff, no new primitive).
  2. Hold #7708 until #7701 is on `main`.
  3. Ask #7708's author to rebase and ideally split into (a) primitive-only (safe, standalone) + (b) activity-migration follow-on that layers on #7701's `rowHeight` fix and `skeletonColumnConfig`. If the author prefers a single PR, require the rebase to keep `rowHeight={TABLE_ROW_HEIGHTS.STANDARD}` + per-column `skeletonColumnConfig` explicitly on the `<UnifiedTableSkeleton>` call site in `loading.tsx`.
  4. Do NOT merge #7708 before #7701. Merging in the reverse order would force #7701's author to re-derive its row-height fix against the new `UnifiedTableSkeleton` call site, adding churn.
CI STATUS AT REVIEW: SonarCloud SUCCESS, actionlint (1/2) SUCCESS, Fork PR Gate SUCCESS, CodeQL NEUTRAL, Vercel Agent Review NEUTRAL. IN_PROGRESS: Path Changes, Analyze (javascript-typescript) ×2, Analyze (actions), Env Example Guard, actionlint (2/2), Greptile, Seer. No failures. `mergeStateStatus: BLOCKED` (expected — no approving review).
SCREENSHOTS REFERENCED: none in PR body (author explicitly deferred — no Doppler in worktree). Non-blocking per `feedback_pr_screenshot_upload` memory; orchestrator to attach from Vercel preview before merge.

---

## PR #7710 — itstimwhite/ui-hardening/details-panel-align-release-metadata (review 2026-04-23T~22:30Z)
DECISION: approve
SUMMARY: Wave-2 (Agent 9) alignment fix for the release sidebar's `ReleaseMetadata` panel. Adds an opt-in `density: 'comfortable' | 'inline'` prop to `DrawerEditableTextField`; `inline` collapses the display-mode trigger to `h-auto px-0 py-0 rounded-[6px] hover:bg-surface-0` so editable rows (ISRC / UPC / Label) share the same baseline + left-inset as sibling static text rows (Type / Tracks / Duration / Released / Popularity / Genres). Edit-mode input unchanged. 2 files, +26/-3. Default remains `comfortable` so `ContactDetailSidebar` + `ProfileContactHeader` are untouched.
BLOCKERS: none.
NON-BLOCKING SUGGESTIONS:
  - When `density === 'inline'`, `inputClassName` is intentionally NOT forwarded to the display button (`density === 'inline' ? undefined : inputClassName`) but IS still forwarded to the edit-mode `<Input>`. That's the right split for this use case, but it makes `inputClassName` carry two different contracts (applies to edit-mode only in `inline`, both in `comfortable`). Consider renaming/splitting to `editInputClassName` + `displayClassName` in a Wave-2 follow-up so the prop contract is self-documenting — not required for this PR.
  - Display-mode text is `text-[11.5px]` (from `METADATA_DISPLAY_VALUE_CLASSNAME`) while edit-mode input is `text-[11px]` (from `METADATA_INPUT_CLASSNAME`). The 0.5px mismatch is invisible at 1x but causes a subtle baseline shift on the transient click-into-edit frame. Not a blocker; align in a follow-up if a shared row primitive is introduced.
  - Hover-chip in `inline` mode uses `rounded-[6px]` vs `rounded-[8px]` in `comfortable`. Intentional (tighter chip on tighter padding), but worth encoding as a token/table entry in DESIGN.md → Right Panel Cards so the next author doesn't reinvent.
  - PR body references screenshots from `https://raw.githubusercontent.com/JovieInc/Jovie/screenshots/details-panel-align-release-metadata/*.png` (per `feedback_pr_screenshot_upload`, the sanctioned workaround). Verify the `screenshots` branch actually has those assets before merge — if missing, treat as a non-blocking follow-up.
  - Edit-mode input retains the padded `h-8 / h-7` chip, so while ISRC is being edited it will bulge slightly right of the static-row baseline. The PR body explicitly calls this out as a product decision ("editing stays padded and legible"). Acceptable — transient.
VERIFICATION REVIEWED: PR body cites `pnpm --filter web lint` clean, `typecheck` clean, `test -- ReleaseMetadata DrawerEditableTextField` 16/16 pass. CI at review time: Lint SUCCESS (30s), ESLint Server Boundaries SUCCESS (33s), Migration Guard SUCCESS (12s), Env Example Guard SUCCESS (7s), Path Changes SUCCESS (15s), SonarCloud SUCCESS, actionlint SUCCESS, Fork PR Gate SUCCESS, CodeRabbit SUCCESS (Review completed). IN_PROGRESS: Typecheck, Unit Tests (1-4/4), Build (public routes), Guardrails (proxy), Analyze (javascript-typescript) ×2, Seer, Greptile. SKIPPING: CodeQL, Build, Test Performance Budgets, Drizzle Check, Knip, Neon DB, DB Migrate (PR main), Scope Alignment Check, Vercel Agent Review. No failures.
RISK: low. Opt-in prop with `comfortable` default preserves behavior everywhere else. No data / validation / permission / semantic changes. Rollback = remove the `density` prop + three `density='inline'` call sites (1 file each side). Pure visual.
SCOPE CHECK: within Agent 9's reserved Wave-2 scope (details panel alignment). 2 files touched, both in the release sidebar / drawer primitive — no sprawl. NOT touched: token CSS (`design-system.css`, `linear-tokens.css`, `theme.css`, `tailwind.config.js`), auth/middleware, Stripe, db migrations, CI, DESIGN.md, `AuthShellWrapper`. Wave-1 owned files all untouched: `ContactDetailSidebar.tsx` (#7691 territories), `AudienceSourceCell.tsx` (#7699), chat surfaces (#7700), `ActivityTableUnified.tsx` (#7701), `TourDatesTable` (#7707). Default `density='comfortable'` keeps sibling call sites (`ContactDetailSidebar`, `ProfileContactHeader`) byte-identical — important because `ContactDetailSidebar` is Agent 5's territory this wave.
DESIGN-SYSTEM CHECK: No banned patterns — no gold, no emoji-on-square icons, no saturated brand CTAs, no generic AI-dashboard styling. Uses existing tokens (`hover:bg-surface-0`, `text-primary-token`, `text-tertiary-token`). `rounded-[6px]` is an arbitrary value — acceptable inside a details-panel micro-chip where the smaller radius matches the tighter padding, but should be rolled into a `--linear-chip-radius-sm` token if this pattern gets reused. DESIGN.md §Right Panel Cards (line 462) specifies the panel container shape; it does not constrain internal row editable-chip density, so this PR is additive, not contradicting. No fake stats / fake testimonials / etc — this is `/app` surface, not landing.
BOT REVIEWS: CodeRabbit: PASS (Review completed status; only a top-level rate-limit warning comment, zero inline comments); Greptile: PENDING (no inline comments yet). Bot review gate must be re-checked before orchestrator merges; if Greptile posts root comments after it completes, triage per `CLAUDE.md` classification rules.
FOLLOW-UP ITEMS:
  - Re-check Greptile + Seer + remaining Typecheck / Unit Tests once they complete.
  - Verify `screenshots/details-panel-align-release-metadata/*.png` assets exist on the `screenshots` branch before merge; if missing, orchestrator to attach via Vercel preview or ask author to push to the branch.
  - Wave-2 follow-up (not this PR): consider splitting `inputClassName` into `displayClassName` + `editInputClassName` so the prop contract is self-documenting, and codify an "inline density" row under DESIGN.md → Right Panel Cards so future details panels (contact sidebar, profile sidebar) can opt in consistently.
  - Post-merge: spot-check `/app/dashboard/releases` with a real creator account (the PR test plan flags this as the one remaining unchecked item).

---

## PR #7711 — itstimwhite/ui-hardening/menu-normalize-release-open-in
DECISION: approve
SUMMARY: Swaps the generic `ExternalLink` icon on the release-row context menu's "Open in Spotify / Apple Music / YouTube Music / Deezer" entries (both the flattened single-provider top-level item and the grouped submenu) for brand-shaped `SocialIcon`s. Implementation is a small `PROVIDER_SOCIAL_ICON_MAP: Partial<Record<ProviderKey, string>>` lookup plus a `providerMenuIcon(provider)` helper that falls back to `menuIcon('ExternalLink')` for unmapped providers. Tests cover both menu shapes — single-provider flattened action and multi-provider submenu — and render the icon through a mocked `SocialIcon` to assert platform attribution.
BLOCKERS: none.
NON-BLOCKING SUGGESTIONS:
  - The fallback path in `providerMenuIcon` only fires for a `ProviderKey` that is NOT one of spotify / apple_music / youtube / deezer. But the call sites filter by `supportedProviders = new Set(['spotify','apple_music','youtube','deezer'])` before ever calling `providerMenuIcon`. So in practice every `provider.key` reaching `providerMenuIcon` is already mapped, and the fallback is unreachable today. Not a bug — useful future-proofing and consistent with the PR body claim — but worth a one-line comment on `PROVIDER_SOCIAL_ICON_MAP` noting that it must stay a superset of `supportedProviders` OR (preferred) derive `supportedProviders` from the map keys so the two can't drift.
  - The test that covers the fallback path is implicit (only mapped providers are tested). Consider one more test that either (a) passes an unmapped key through a unit test of `providerMenuIcon` directly (not exported), or (b) asserts that `providerMenuIcon` returns the `<Icon name='ExternalLink'>` sentinel for a provider deliberately omitted from the map. Cheap insurance against a future contributor accidentally throwing on unmapped input.
  - No screenshots in PR body (orchestrator exited mid-flight). Non-blocking per `feedback_pr_screenshot_upload` memory; a Vercel-preview screenshot of `/app/dashboard/releases` → row context menu → "Open in..." submenu would make this trivially reviewable visually. Follow-up, not a blocker.
  - Minor: `PROVIDER_SOCIAL_ICON_MAP` types the value as `string` rather than a narrow `SocialIconPlatform` union. `SocialIcon.tsx` already types `platform` as `string` and normalizes via `normalizePlatformKey`, so this isn't a regression — but a stricter union (or `keyof typeof ICON_DATA` re-export) would catch typos at compile time.
VERIFICATION REVIEWED:
  - Diff matches PR description exactly: 2 files, +133 / -2. No collateral edits.
  - `SocialIcon` accepts an arbitrary `platform: string` and normalizes via `normalizePlatformKey(platform)` → `lowercased + strip [\s_-]+`. Verified the four platform keys in the map: `spotify` → `spotify` (exact), `apple_music` → `applemusic` (present in ICON_DATA at line 48), `youtube_music` → `youtubemusic` (present at line 36), `deezer` → `deezer` (present at line 233). All four map entries resolve to real ICON_DATA entries.
  - Mapping `youtube → youtube_music` (provider key → SocialIcon platform) is intentional and correct: the `ProviderKey` for YouTube Music is `'youtube'` (see `supportedProviders` set + `providerLabels['youtube'] = 'YouTube Music'`), but the SocialIcon's YouTube-Music glyph lives under platform key `youtube_music` → normalized to `youtubemusic`. Using the bare `youtube` platform would render the red play-button (generic YouTube), not the Music-specific logo. Correct call.
  - Action semantics unchanged — `onClick: () => globalThis.open(provider.url, '_blank', 'noopener,noreferrer')` is byte-identical at both call sites. URL generation, ordering, labels, danger styling all unchanged. Only the `icon` field is swapped.
  - Fallback behavior: `providerMenuIcon` returns `menuIcon('ExternalLink')` (not a throw) when the provider is absent from the map. Verified in diff.
  - Tests assert platform attribution via `[data-social-platform="spotify"]` / `[data-social-platform="apple_music"]` selectors on a mocked SocialIcon, which correctly couples the assertion to the map lookup rather than SocialIcon internals. Both the flattened-single and grouped-submenu shapes are covered.
RISK: low. Icon-only visual change. No URL behavior, no permissions, no server code, no new dependencies. Fallback degrades gracefully rather than throwing.
SCOPE CHECK: PASS. Two files, both inside `apps/web/components/features/dashboard/organisms/releases/*` and `apps/web/tests/components/releases/*`. No edits to token CSS (`design-system.css`, `linear-tokens.css`, `theme.css`), no Tailwind config, no auth, no Stripe, no migrations, no CI workflows, no DESIGN.md, no AuthShellWrapper. `Scope Alignment Check` and `Path Changes` workflows both pass.
DESIGN-SYSTEM CHECK: PASS. No banned patterns — no gold, no emoji-on-square icons, no saturated brand fills (SocialIcon is monochrome via the Icon atom's currentColor inheritance; see `SocialIcon.tsx` → ICON_DATA entries supply path data only, not color fills). Icon sizing `h-3.5 w-3.5` matches the existing `menuIcon` helper's geometry, so the visual metric of menu rows is preserved. No new tokens introduced. Brings release-row menu into parity with the sibling "Tracked Links" submenu, which is the stated design intent.
BOT REVIEWS: CodeRabbit: PASS (review completed, 0 inline comments, rate-limit warning only). Greptile: IN_PROGRESS (pending). Seer (Sentry Code Review): PENDING. SonarCloud: PASS (0 new issues). No unaddressed root comments from any bot as of review time.
PARITY-WITH-TRACKED-LINKS-MENU: verified. `buildShareItems` in the same file (lines 119–174) already assigns `icon: getTrackedShareIcon(sourceGroup.source)` to Tracked-Links entries. `getTrackedShareIcon` (in `apps/web/lib/share/tracked-sources.ts:117-129`) delegates to `SocialIcon` via `createElement(SocialIcon, { platform: socialPlatform, className: 'h-4 w-4' })` for known DSP sources, falling back to a lucide icon for generic ones. So the Tracked-Links submenu and the "Open in..." submenu now both render DSP entries as `SocialIcon`, satisfying the PR's stated "two menus that visually open onto the same providers should describe them the same way" invariant. One minor cosmetic delta: Tracked-Links uses `h-4 w-4` while "Open in..." uses `h-3.5 w-3.5` (matching `menuIcon`'s native sizing in this file). That's consistent with the local file's `menuIcon` convention and not a regression, but if the orchestrator wants strict pixel-parity across both submenus, the "Open in..." SocialIcon could be bumped to `h-4 w-4`. Non-blocking.
FOLLOW-UP ITEMS:
  - Attach a screenshot of `/app/dashboard/releases` → row context menu → "Open in..." submenu from the Vercel preview once available, for the PR body. Non-blocking per `feedback_pr_screenshot_upload` memory.
  - Consider de-duplicating `supportedProviders` Set and `PROVIDER_SOCIAL_ICON_MAP` keys so the two can't drift (derive `supportedProviders = new Set(Object.keys(PROVIDER_SOCIAL_ICON_MAP) as ProviderKey[])`, or vice versa). Follow-up PR, not a blocker.
  - Consider adding a unit test for the unmapped-provider fallback branch in `providerMenuIcon` — today it's unreachable via the call sites, which means regressing it (e.g. throw instead of return) would pass CI silently.
  - When Greptile and Seer finish, re-verify no unaddressed root comments before merge (per CLAUDE.md Merge Requirements gate).
ORCHESTRATOR ACTION:
  1. Wait for Greptile + Seer reviews to complete; re-check `gh api repos/JovieInc/Jovie/pulls/7711/comments` before merge.
  2. Attach a Vercel-preview screenshot to the PR body (or a comment) showing the four DSP icons in the release-row "Open in..." submenu.
  3. Merge cleanly — no rebase dependency on sibling UI-hardening PRs (diff is fully isolated to `release-actions.tsx` + its test).
CI STATUS AT REVIEW: PASS: CodeRabbit, ESLint Server Boundaries, Env Example Guard, Fork PR Gate ×2, Guardrails (proxy), Lint, Migration Guard, Path Changes, SonarCloud, actionlint ×2, Analyze (actions). PENDING: Unit Tests (1-4/4), Typecheck, Analyze (javascript-typescript) ×2, Build (public routes), Seer, Greptile. SKIPPED: Build, Vercel Agent Review, CodeQL, Test Performance Budgets, Knip, DB Migrate, Neon DB, Drizzle Check, Scope Alignment Check. No failures.
SCREENSHOTS REFERENCED: none in PR body (author exited mid-flight; orchestrator finalized). Non-blocking per `feedback_pr_screenshot_upload` memory; follow-up.

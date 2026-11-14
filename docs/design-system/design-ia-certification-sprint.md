# Design, IA and Pen fidelity certification sprint

Snapshot: November 13, 2026, America/Los_Angeles. Research and prioritization,
not a production-certification receipt. No Linear issue — ad-hoc, directly
requested by Tim. GBrain unavailable; repository, live Linear and GitHub evidence
used. The existing commissioning owners remain
[JOV-6220](https://linear.app/jovie/issue/JOV-6220),
[JOV-6038](https://linear.app/jovie/issue/JOV-6038), and
[JOV-11838](https://linear.app/jovie/issue/JOV-11838).

## Complete backlog sweep

The live sweep exhausted pagination for all non-archived open issues in both
workspace teams: **3,692 issues, 3,491 Jovie and 201 LYB**, across 21 issue pages.
Open includes Backlog, Todo, Triage, In Progress, In Review, Rework, Merging and
Validating. Done, Canceled, Duplicate and archived work are excluded. All 1,556
Jovie labels (seven pages) and all 37 Jovie projects were inspected. Both teams
were enumerated from the workspace team list, which had no further page.

The inclusive review set contains **576 issues**: 563 Jovie and 13 LYB. Selection
uses explicit design/IA/UX labels, interface/design terms in titles, and existing
design projects. **129** have explicit design/IA/UX labels. Six additional
paginated provider searches—information architecture, Pen fidelity, Pen reference,
design system, IA invariant, canonical Pen—returned **111 additional candidates**.
Provider search is fuzzy; those are a separate review set, not 111 confirmed UI
defects. Broad terms also select infrastructure and product-research issues.

The machine-readable session artifact `ds-design-ia-issues.json` preserves IDs,
URLs, states, labels, owners, selection reasons, scope and pagination metadata.
List descriptions are provider-truncated; the 21 sprint anchors below were read
in full. This is an exhaustive open-inventory screening, not a visual audit of
every referenced screen or an assertion that all 687 candidates need changes.
No issues were created, reassigned, closed or marked certified during the sweep.

## Current constraint

The founder's complaint already has a specific investigation owner:
[JOV-11838](https://linear.app/jovie/issue/JOV-11838) names the What's New
announcement losing its Pen editorial gradient and LYB sign-in quality. It asks
which escape occurred: missing mapping, skipped comparison, judge miss,
override, or unenforced gate. This must be answered from exact reference and
production renders. A passing source test or issue status cannot answer it.

[JOV-6038](https://linear.app/jovie/issue/JOV-6038) already specifies the reusable
contract: exact approved Pen artifact/frame/revision, route/component, state,
viewport/theme, rendered reference, deployment SHA, comparison and disposition of
every material residual. It requires deliberate drift and stale-reference RED
controls, then repair and recapture to GREEN. Extend that machinery rather than
creating another registry, screenshot store or broad QA epic.

The supplied Mac sign-in screenshot maps to
[JOV-6709](https://linear.app/jovie/issue/JOV-6709), which already covers browser
handoff, code fallback, loading/error/cancel and first/returning Touch ID states.
Its linked implementation PRs are #19555 and #20738. A screenshot of Pen does not
establish which states currently ship or which saved revision is authoritative.

## Dependency-ordered execution

| Order | Existing owners and current state | Concrete exit evidence |
| --- | --- | --- |
| 0. Make evidence production reliable | [JOV-12456](https://linear.app/jovie/issue/JOV-12456), In Progress; PR #25375. [JOV-8853](https://linear.app/jovie/issue/JOV-8853), Backlog. [JOV-12104](https://linear.app/jovie/issue/JOV-12104), Backlog | Complete certificate retained, bounded delivery acknowledged, delivery failure still fatal. Record which model gates actually ran. Measure existing stage p50/p95/n before and after optimization with every check retained. |
| 1. Recover and reconcile Pen authority | [JOV-6897](https://linear.app/jovie/issue/JOV-6897), Backlog; [JOV-6943](https://linear.app/jovie/issue/JOV-6943), Backlog | Inventory every saved artifact/frame and all alternates; record owner, exact revision, approval, canonical dependency and production mapping. Distinguish missing source, missing still, unapproved, unmapped and stale. Select each existing approved winner by state; preserve unresolved choices visibly. |
| 2. Prove one complete round trip | [JOV-6038](https://linear.app/jovie/issue/JOV-6038), In Progress; [JOV-7437](https://linear.app/jovie/issue/JOV-7437), Todo | Existing button pilot preserves 28px visible face, >=44px interaction target and same-blue focus. Exact reference and deployed render compare at matching state/viewport. Wrong revision and deliberate visual drift fail. Repair restores GREEN. |
| 3. Close the known escape class | [JOV-11838](https://linear.app/jovie/issue/JOV-11838), Backlog; [JOV-11628](https://linear.app/jovie/issue/JOV-11628), Backlog | Trace the actual What's New/LYB escape before repair. Reconcile homepage SSIM versus pairwise mockup/text-position disagreement with the 3D-staging fixture, without blanket skips. Missing production/reference evidence stays unknown. |
| 4. Expand calibrated visual evidence | [JOV-8850](https://linear.app/jovie/issue/JOV-8850), Backlog; [JOV-8851](https://linear.app/jovie/issue/JOV-8851), Backlog; [JOV-8852](https://linear.app/jovie/issue/JOV-8852), Backlog | Versioned real labels, untouched holdout, separate synthetic negatives; narrow rendered-image judges through existing dispatch; measured precision/recall, calibration and false-positive/throughput monitoring. New uncalibrated judges stay shadow. Existing checks remain. |
| 5. Certify golden-path composition | [JOV-6220](https://linear.app/jovie/issue/JOV-6220), In Progress; [JOV-7713](https://linear.app/jovie/issue/JOV-7713), Merging; [JOV-7846](https://linear.app/jovie/issue/JOV-7846), In Progress | Sign-in/claim/onboarding/profile/checkout/app landing get component, screen and journey receipts on the exact deployed build. Include keyboard, autofill/password manager, effective viewport and native input behavior. Report actual denominator/pass/fail/unknown/stale separately. |
| 6. Converge IA and shell | [JOV-7878](https://linear.app/jovie/issue/JOV-7878), In Progress; [JOV-8017](https://linear.app/jovie/issue/JOV-8017), Rework; [JOV-7541](https://linear.app/jovie/issue/JOV-7541), Todo | One named destination and selection identity across sidebar, title, command actions and deep links; shared hierarchy with native adaptations. Preserve the single thread-history-header new-chat action, drafts, keyboard and recovery. Capabilities claimed by UI come from certified truth. |
| 7. Extend reuse after proof | [JOV-6943](https://linear.app/jovie/issue/JOV-6943), Backlog; [JOV-10098](https://linear.app/jovie/issue/JOV-10098), Backlog; [JOV-8021](https://linear.app/jovie/issue/JOV-8021), Backlog | Pinned canonical components plus independently owned working shards; selective dependent recertification. Check the shared company certify kit before copying another implementation. Apply reference patterns through existing primitives and tests. |

Parallelize independent evidence capture, component repair, Pen mapping and
backlog verification with explicit file/state owners. Do not let parallel workers
edit shared canonical primitives independently. Shared-token changes invalidate
the dependent proof; a new whole-tree source SHA alone must not fabricate new
rendered evidence.

For LYB, preserve the existing related owners:
[LYB-86](https://linear.app/jovie/issue/LYB-86) for Jovie DS adoption,
[LYB-266](https://linear.app/jovie/issue/LYB-266) for Home/composer decisions,
[LYB-39](https://linear.app/jovie/issue/LYB-39) for preview/export geometry, and
[LYB-351](https://linear.app/jovie/issue/LYB-351) for the recorded paid journey.
Jovie web proof cannot certify a native LYB build.

## Open PR reconciliation

All **80** open repository PRs were listed with complete REST pagination.
Eighteen title matches were screened; the table includes the false-positive
outbound certification match so the selection remains inspectable. Eleven
directly relevant PRs had full live metadata/body readback. Mergeability is a
snapshot; every candidate needs refreshed ancestry, review, checks and queue
admission at its actual head. None was merged during this research.

| PR | Observed scope/state | Next action before landing |
| --- | --- | --- |
| [#25375](https://github.com/JovieInc/Jovie/pull/25375) | Compact certificate delivery; open, mergeable; 10 files, +890/-112 | Priority unblock. Head `4d9d8fc0` has PR Ready, unit, source, coverage and a11y success, but Company guards and Certification config failed. Diagnose those exact jobs, then ordinary queue. |
| [#25187](https://github.com/JovieInc/Jovie/pull/25187) | Pen drafting on existing paid subscription; open, mergeable; 7 files | Verify auth/model-pool contract and an actual draft/export receipt. Preserve no canonical writes or automatic approval. |
| [#25269](https://github.com/JovieInc/Jovie/pull/25269) | Off-scale Tailwind/shrink-only ratchet; open, conflict | Rebase with current spacing canon, rerun positive/negative fixtures and prove existing checks retained. |
| [#25036](https://github.com/JovieInc/Jovie/pull/25036) | Sign-in code primitives/tests/stories; open, conflict | Reconcile #25218's overlapping SegmentedDigitBox edits and actual evidence requirements; run OTP/autofill/focus/state tests and rendered proof. PR prose saying certified is not independently verified. |
| [#25218](https://github.com/JovieInc/Jovie/pull/25218) | Four component token repairs; open, conflict | Preserve the intended color decisions and avoid duplicate OTP work; bind real before/after evidence. |
| [#25254](https://github.com/JovieInc/Jovie/pull/25254) | InsetPanel, account menu, What's New/footer; draft, conflict; 52 files, +5066/-596 | Review scope/ancestry first: live base is main but body still says stacked on `claude/desktop-update-control`. Reconcile Pen gradients and states before promotion. |
| [#25270](https://github.com/JovieInc/Jovie/pull/25270) | Release truncation and shared edges; open, conflict | Reconcile shell geometry with #24746/#25254; render long-content and narrow-width states. |
| [#25303](https://github.com/JovieInc/Jovie/pull/25303) | Compact header typography; draft, mergeable | Verify existing founder locks and Pen reference; scoped checks and rendered comparison before readiness. |
| [#24746](https://github.com/JovieInc/Jovie/pull/24746) | Sidebar/inspector IA alignment; open, conflict | Resolve overlap and prior marketing import-closure failure; verify naming/selection and geometry together. |
| [#24727](https://github.com/JovieInc/Jovie/pull/24727) | Bounded GitHub retry in screen proof; open, mergeable | Preserve exact artifact/source provenance and terminal-error failures; verify retry tests at current main. |
| [#22450](https://github.com/JovieInc/Jovie/pull/22450) | Complete local path evidence for design gate during quota exhaustion; open, conflict | Rebase and verify ordered merge parents, base lineage, deletions/renames/whitespace and fail-closed missing evidence. |
| [#25217](https://github.com/JovieInc/Jovie/pull/25217) | Sidebar toggle rerender reduction; open | Inspect current diff/checks and measure interactions before adoption; title screening only. |
| [#25253](https://github.com/JovieInc/Jovie/pull/25253) | Root-404 marketing-shell loading reduction; open | Keep separate unless current golden-path measurements identify it as a blocker; title screening only. |
| [#24818](https://github.com/JovieInc/Jovie/pull/24818) | Route document titles; draft | Reconcile canonical destination names with current IA; title screening only. |
| [#24504](https://github.com/JovieInc/Jovie/pull/24504) | Missing Pen secrets diagnostic; draft | Check whether #25187/current main supersedes the repair; title screening only. |
| [#23381](https://github.com/JovieInc/Jovie/pull/23381) | Certifier commits-API consumption; open | Verify present ownership and lineage semantics before reuse; title screening only. |
| [#23148](https://github.com/JovieInc/Jovie/pull/23148) | Counted-label grammar guard; open | Inspect scoped copy contract and overlaps before adding to the sprint; title screening only. |
| [#25249](https://github.com/JovieInc/Jovie/pull/25249) | Certified outbound drafts; open | Search false positive for this DS sprint. No outbound actions or unrelated landing implied. |

## Competitive patterns translated into contracts

These are official-document research findings, **not authenticated hands-on
competitor audits**. They inform existing [JOV-8021](https://linear.app/jovie/issue/JOV-8021)
and [JOV-7710](https://linear.app/jovie/issue/JOV-7710); they do not authorize a
new provider, service spend, or arbitrary product redesign.

| Reference | Evidence-backed pattern | Existing contract to strengthen |
| --- | --- | --- |
| [Frame.io Comparison Viewer](https://help.frame.io/en/articles/9952618-comparison-viewer) | Side-by-side assets, linked zoom, overlay slider and pixel difference for matching static dimensions | Put approved Pen reference, production and diff together with matching dimensions/state/revision. Adopt the inspection pattern inside existing proof artifacts, not a second evidence store. |
| [Raycast ActionPanel API](https://developers.raycast.com/api-reference/user-interface/action-panel) and [manual](https://manual.raycast.com/action-panel) | Contextual actions, semantic groups, discoverable keyboard shortcuts and stable primary action | The selected entity and authorized action must agree across row/menu/command/chat; Escape/back restores context and focus. Use existing JOV-8018/JOV-8021 action ownership. |
| [Linear Search](https://linear.app/docs/search) | Distinguishes workspace search, find-in-view and quick issue lookup; command menu can scope entity results | Search/composer scope must be visible and preserve destination/selection context; empty, restricted, loading and failed results stay distinct under JOV-8019/JOV-8021. |
| [Apple sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars.md) | Succinct hierarchy, generally two levels, adaptive sidebar/tab presentation and familiar show/hide behavior | Share semantics across web/Mac/iOS while testing native width/focus/navigation behavior. Existing founder geometry and focused-composition decisions remain the authority. |

Ship now: optimize existing producers without losing checks, reconcile relevant
open PRs, recover exact Pen authority, and run the deployed pilot. Re-evaluate
when the pilot has deliberate-red/repair-green receipts and measured throughput.
Then expand by shared dependency count and golden-path/revenue traffic, recording
every actual screen/state receipt and remaining issue under the existing owners.

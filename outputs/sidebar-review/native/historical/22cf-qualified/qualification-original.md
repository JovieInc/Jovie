Shared sidebar review packet — 2026-10-08

Current web head `245ec38c89228b87f07c7bfffb2e2ce2f1c69c07`, tree `8ecb24fde1992b0038951de59cdd4965b1122d03`. Native sibling `22cf14a9e614a66ec0dbb95361cd4077c82328d7` passed matching qualification and recording. Sole source writer: Polish the shared sidebar. No Linear issue — ad-hoc. Zero branches pushed; zero PRs created.

The implementation retains permanent brand/toggle, reversible floating and explicit Pin behavior, permitted navigation, bounded More/search, scoped pins, stable Recent/read state, mobile hydration and account/update/audio geometry. Large registries keep at most 12 inline destinations with the current destination retained, full permitted search and all valid pins. The hover-to-click regression now promotes a hover preview to explicit access before a subsequent activation dismisses it.

Current web checks passed: 18/18 typecheck tasks; all four actual CI coverage shards, 2,274 tests passed and 12 skipped; changed lines 1,573/1,588 (99.1%, required 60%). The unchanged browser matrix passed 25/25, zero skipped/flaky/unexpected cases, in 47.9 seconds. The focused regression first failed before repair, then passed among 27 tests. Selector and raw outputs are in [current qualification](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/qualification.json) and [raw browser provenance](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/web/current/browser/provenance.json).

| Measurement | RAF median | RAF p95 | RAF maximum | Long tasks |
|---|---:|---:|---:|---:|
| Rail reversals, 26 samples | 8.4 ms | 9.5 ms | 9.5 ms | 0 |
| Full More → search → page120 → existing Calendar route, 35 samples | 8.3 ms | 26.7 ms | 33.6 ms | 0 |

Percentiles use nearest rank. Full flow exceeded 16.7 ms on three intervals and 8.3 ms on 16; rail exceeded 8.3 ms on 15. More React render maximum was 9.8 ms; palette maximum 3.3 ms. Event-to-assertion wall time was 57 ms including automation. The full-flow Chromium CPU profile contains 5,047 nodes and 656 samples over 565.5 ms. Raw CPU sampling, React rendering, document Long Tasks and RAF intervals remain distinct measurements; no physical display or app-cause attribution is inferred. Frame-budget acceptance remains unproven.

Historical failures remain preserved under their own source heads. Prior web `e26b95db8444` initially passed25 cases but recorded a95 ms task; its second run passed24/25, failed the hover assertion and recorded99 ms. Three isolated repeats and five profiling flows recorded zero tasks, without resolving the earlier cause. The original unbounded120-row menu measured58.1 ms React rendering and132/99/89 ms opening tasks, motivating the existing-search boundary. Current clean sampling does not erase those observations.

Successful standalone browser videos were captured after qualification, outside every performance window. Media dimensions/duration were verified and frames inspected. The first capture helper tried a nonexistent Jovie More trigger; the second used an incorrect compact close name. Capture now follows the actual tested controls; no application/test gate changed.

[Jovie desktop floating → Pin → Recent recording](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/web/current/recordings/jovie-desktop-success.webm) (1440×900,5.84 s). [Ovie compact More → Back → close recording](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/web/current/recordings/ovie-compact-success.webm) (390×844,4.88 s).

![Jovie desktop Recent](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/web/current/recordings/jovie-desktop-success.png)
![Ovie compact More](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/web/current/recordings/ovie-compact-success.png)

Native Recent already shared More’s drawer composition; direct full-window f66 image inspection contradicted the reported missing-anchor/sheet hypothesis. The confirmed correction removes the duplicate Conversations heading and replaces the verbose empty paragraph with a short cue. New largest-text assertions verify Back/All chats/account hit access and brand/account stable on-screen frames at0.001-point tolerance. The first renewed test failed only on floating-point epsilon; the second passed those anchors but queried history search by its placeholder instead of assigned ID. Both failed bundles/logs/screenshots are retained; the final identifier correction passed the complete matching renewal.

The existing native navigation performance test passed twice with five measurements each. Its exporter returned Clock/CPU/Memory metrics, including final-head mean wall time2.2044 s for the full automated Profile/chat round trip. Although source requests XCTHitchMetric on iOS26+, the exported result contains no hitch values. No hitch-budget pass is asserted. Native measurement provenance remains separate from current UI qualification and physical runtime.

| Layer | Exact head | Intended draft base |
|---|---|---|
| native | `22cf14a9e614a66ec0dbb95361cd4077c82328d7` | `main` |
| foundation | `8d36078f1a658e7bb130a2cc998e20a936ac4db5` | `main` |
| overflow-search | `a4914f19134d74185d574c61c82a3a7e27d1219a` | `codex/shared-sidebar-foundation` |
| history-navigation | `4686b36bfd4801f23a4d78e30102f65b1062eda9` | `codex/shared-sidebar-overflow-search` |
| browser-proof | `245ec38c89228b87f07c7bfffb2e2ce2f1c69c07` | `codex/shared-sidebar-history-navigation` |

[Five exact draft descriptions and publication destinations](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/publication-plan.json). Dependent web children remain draft and unenrolled while their parents are open. Automatic approval review rejected the five-branch remote push because specific publication authority was absent in this chat, and rejected cross-chat messaging; neither action was bypassed or delivered. The design/root coordinator is consolidating the exact approval action after this packet is concrete.

Outstanding acceptance evidence: actual Mac window-control geometry, physical120 Hz and human VoiceOver, hosted CI/queue/deployment and authenticated runtime. Native private Summer history still uses an explicit existing web door; full native private resume is not established. These are unfinished criteria of the active task, not a claim that local fixtures certify them.

[Requirement audit](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/requirement-audit.json), [historical native evidence](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/native/historical), [hover RCA](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/findings.md). Current web proof is frozen. Storybook6017 was stopped after qualification, then reopened with no-open for this review prototype; all heavy jobs/captures finished. Native simulator original settings were large/Shutdown and are restored by each owned-run trap. Final native qualification and recording are saved below.

The history-search failure was a confirmed native identifier inheritance defect, not a hidden field: exported hierarchy showed a visible TextField with the parent threads ID. Final source uses an explicit accessibility container and direct field identifier; matching qualification passed16/16.

Final native renewal at `22cf14a9e614a66ec0dbb95361cd4077c82328d7`:16/16 tests passed,0skipped (14semantic,1largest-text UI,1existing navigation measurement). Drawer coverage1,470/1,737(84.63%); Recent/pin helpers fully exercised. Three earlier failed renewals retained. Matching recording via existing test-without-building passed1/1; restored text `large` and simulator `Shutdown` read back. Current metrics contain no hitch values, so hitch/physical frame-budget acceptance remains open.

[Native drawer viewing excerpt](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/native/current/recordings/sidebar-native-drawer-short.mp4) (5.6s excerpt from seconds27-32.6 of [complete successful capture](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/native/current/recordings/sidebar-native-success.mp4),35.03s,1320×2868). [Native coverage/metrics/provenance](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/native/current/provenance.json).

![Final native Recent at largest text](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/native/current/ios-shared-sidebar-recent.png)

Final native/web local publication preflights passed all six contracts and secrets scan; all five final draft bodies passed admission. Every publication manifest uses native22cf14 and web245ec38. The review prototype is [owned Storybook6017](http://localhost:6017/iframe.html?id=organisms-unifiedsidebar--shared-shell&viewMode=story); it remains a fixture, distinct from installed/deployed/authenticated runtime.

GBrain final qualification saved and full canonical readback matched: `decisions/shared-sidebar-local-qualification-2026-10-08`, hash `bc8688b87654d9a848422dc9f74953d3a3c228f91219f883fb921258fd95e188`. This dated page supersedes the earlier pending-qualification status while preserving RCA and historical failure provenance.

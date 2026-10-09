Shared sidebar review packet — 2026-10-08

Current web `245ec38c89228b87f07c7bfffb2e2ce2f1c69c07` remains frozen. Current native `3cdda15bd68479050c0acb421651554f004e49a4` changes only UI assertions from qualified22cf; all product source is identical. Sole source writer: Polish the shared sidebar. No Linear issue — ad-hoc. Zero pushes and zero PRs.

The native CI parity gap is closed locally. The existing drawer/settings case failed at22cf because it expected an obsolete inline paragraph. The corrected case opens Recent, checks the actual short cue and navigates Back; closed-plane occlusion now checks actual control hittability. The real runner passed22/22 with zero skipped:14 semantic and eight CI-discovered UI cases. Drawer coverage1,481/1,737 (85.26%). This targeted selection does not claim the entire hosted iOS suite passed.

A separate same-build largest-text UI case and recording passed1/1. Brand, Back, All chats, search and account access, stable frame geometry and Settings return are verified. Simulator textlarge and stateShutdown were restored and read back. Current screenshots/logs/coverage are in [native provenance](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/native/current/provenance.json). [Current recording](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/native/current/recordings/sidebar-native-success.mp4) was captured outside performance sampling. No new Mac session or Simulator foreground was created.

![Current native Recent at largest text](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/native/current/ios-shared-sidebar-recent.png)

Prior22cf qualification, recordings and five navigation measurements are preserved under native/historical/22cf-qualified. Mean full automated Profile/chat round trip was2.2044s; no hitch values were exported. These measurements remain attributed to22cf.

Web qualification remains18/18 typecheck tasks, all four actual CI coverage shards (2,274passed,12skipped;1,573/1,588 changed lines,99.1%), and25/25 unchanged browser cases with no skip/flaky/unexpected result. Full-flow RAF median8.3ms/p9526.7ms/max33.6ms exceeds frame budgets; rail max9.5ms. Current sample has no long tasks, while earlier95/99ms observations remain preserved. Physical120Hz and causal acceptance remain unproven. [Web raw provenance](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/web/current/browser/provenance.json).

| Layer | Frozen local head | Publication stage | Proposed base |
|---|---|---|---|
| native |3cdda15bd68479050c0acb421651554f004e49a4|initial draft candidate|main|
| foundation |8d36078f1a658e7bb130a2cc998e20a936ac4db5|initial draft candidate|main|
| overflow-search |a4914f19134d74185d574c61c82a3a7e27d1219a|after foundation lands and requalification|main|
| history-navigation |4686b36bfd4801f23a4d78e30102f65b1062eda9|after overflow lands and requalification|main|
| browser-proof |245ec38c89228b87f07c7bfffb2e2ce2f1c69c07|after history lands and requalification|main|

The former five-at-once parent-based draft proposal is superseded. docs/PR_FLOW.md57–79 and pr-stacking.md permit dependent draft bases, but .github/workflows/pr-targets-main.yml62–64 rejects every non-main base, with no draft exception. Local source and cachedorigin/mainb09456 agree. No remote-main refresh was performed. The executable guard remains intact. [Publication policy](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/publication-policy.json) prepares only native and foundation as initialmain-targeted drafts; all other branches stay local until each parent lands, followed by fresh-main rebase, semantic diff/cap verification and renewed exact-head checks. No source rebase was performed prematurely.

[Exact descriptions and destinations](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/publication-plan.json). Current native publication preflight passed secrets scanning and six policy contracts. All five bodies passed title/body admission; that receipt does not certify PR bases or hosted checks. The coordinator’s unanswered old publication question must be replaced with the revised two-root action. No duplicate approval question is issued here.

Outstanding original criteria remain Mac window geometry, physical120Hz/human VoiceOver, frame/hitch acceptance, hosted CI/queue/deployment/authenticated runtime and full native private Summer resume. The owned [Storybook6017 prototype](http://localhost:6017/iframe.html?id=organisms-unifiedsidebar--shared-shell&viewMode=story) remains a fixture. [Requirement audit](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/requirement-audit.json) preserves the full scope.

Automatic approval review rejected remote publication because specific authority was absent, and rejected cross-chat messaging. Neither action was bypassed. The task remains active and unfinished.

GBrain durable CI/policy page saved; full canonical body readback matched: `decisions/shared-sidebar-ci-parity-and-main-base-policy-2026-10-08`, hash `c27de03c0436ef2e3fd2b09b098093fe7ede3eb6dd6ca77f0b2e4413f8a0ac13`. Managed native QA checkout archived and branch3cdda preserved; web primary remains245.

Additional current245 diagnostic: [synchronized capture comparison](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/diagnostics/common-clock/comparison.json) preserved all large-fixture interaction/geometry checks. Capture-off RAFp9524.9/max33.4ms; snapshot-on p9525/max40.7ms; both3intervals>16.7ms,0longtasks. Capture-off trace overlaps44.387/29.099ms keyboard React dispatches. Frame budget remains unmet; onepair is not a general overhead estimate. [Cachedmain root compatibility](/Users/timwhite/.codex/worktrees/94af/Jovie/outputs/sidebar-review/diagnostics/cached-main-root-compatibility.json) has zero mergeconflicts and unchangedcaps for bothroots; remote main not refreshed and derivedtrees unqualified. Sourceheads and acceptedbodybytes unchanged. GBrain receipts/shared-sidebar-cached-main-and-profile-audit-2026-10-08 fullbodyreadback matched.

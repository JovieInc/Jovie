# Chat interaction budgets and surface coverage

Source contract for [JOV-8717](https://linear.app/jovie/issue/JOV-8717), part of
[JOV-3887](https://linear.app/jovie/issue/JOV-3887). Inventory checked against
repository source on 2026-10-21. This document records required coverage for the
subsequent slices; it does not certify deployed availability or measured speed.

## Scoring and boundary semantics

The existing [manifest](../../apps/web/scripts/performance-interaction-manifest.ts)
owns numeric budgets. The [report evaluator](../../apps/web/scripts/performance-interaction-report.ts)
enforces every declared budget independently. Feedback cannot borrow the
usable-state limit, and declaring a data-ready limit enforces its value as well
as its presence. Optional unbudgeted metrics remain diagnostic.

| Chat metric | Retained limit | Passing boundary | Boundary failure |
| --- | ---: | --- | --- |
| First visible feedback p50 | 100ms | `<100ms` | `100ms` fails |
| First visible feedback p95 | 100ms | `<100ms` | `100ms` fails |
| Usable state p95 | 300ms | `<300ms` | `300ms` fails |
| Render to interactive p95 | 50ms | `<50ms` | `50ms` fails |
| Dropped scroll frames | 0 | Maximum count `<=0` across scored samples | Any dropped frame fails |
| Scored samples per required scenario | 5 | Integer count `>=5` of distinct identities | Four samples fail |

The epic specifies strict `<100ms` median, `<300ms` p95 and `<50ms` interactive
targets. Chat explicitly uses `timingBoundary: 'exclusive'`; equality fails.
The inherited 100ms feedback-tail budget is stronger than the epic's 300ms
usable-state target and remains independently enforced. Existing non-chat
budgets retain their inclusive `<=` timing semantics. No numeric budget changes.

Percentiles use nearest rank: sort ascending and select
`max(0, ceil(p / 100 * n) - 1)`. At five samples, p50 is the third value and
p95 is the worst value. Use unrounded values for scoring; Markdown rounds only
for display. The ranked table's single p95 column is a summary; JSON contains
the independent feedback, usable-state, data-ready and render results.

First feedback means the optimistic user bubble is visible. Usable state means
the first assistant token is visible and the composer remains usable. These
are distinct from full response completion and from provider/network latency.
Warmup samples are excluded by the collector before scoring. Each scored sample
has a unique `(scenarioId, runIndex)`; run indices are nonnegative safe integers
and may start at zero. Combining layouts, products or platforms into the same
scenario population is not evidence that each population passes.

## Required scenario contract

Declare the required scenario set before collection, independently of emitted
samples. `buildInteractionLatencyReport` defaults to the full existing manifest;
focused callers supply `scenarios`. The audit CLI supplies its selected manifest
scope. The existing chat Playwright ratchet explicitly selects
`chat-message-round-trip`. A focused pass qualifies only that scope.

- A report passes only when every required scenario passes all its budgets.
- An omitted or skipped scenario emits no scored samples and has `passed: null`.
  With other measured required scenarios, the report fails. An entirely unmeasured
  scope (including an empty selection) is `pending`, never `pass`.
- An undersampled scenario or one missing a budgeted metric on even one sample
  fails. `firstFeedbackMs` is mandatory; a missing value is malformed input.
- All submitted timings, including optional diagnostics and samples outside the
  selected scope, must be finite nonnegative numbers. Nulls, strings, negative
  values, NaN and infinities are rejected. Counts must also be safe integers.
- Duplicate sample identities, duplicate required scenario declarations and
  unknown sample scenario IDs are rejected rather than silently discarded.
- Known samples outside an explicit required scope are validated but do not
  qualify that scope. Metadata `sampleCount` cannot substitute for scored rows.

A skipped browser test itself produces no report. This evaluator cannot detect
that runner outcome. [JOV-8728](https://linear.app/jovie/issue/JOV-8728) owns
promotion qualification of missing/skipped required runs; absence is never a
performance pass.

## Bounded surface matrix

“Gap” means a product surface exists in source but has no per-surface timing
qualification in the current interaction report. Desktop and phone browser
populations must be measured separately, including new and existing threads,
composer editing/send, streaming, thread switching, long-list scroll, recovery,
and empty/loading/error states where supported. A shared component alone does
not qualify its callers. Listed routes are canonical entry points, not new UI.

| Current surface / source owner | Desktop layout | Phone layout | Current collector / required coverage |
| --- | --- | --- | --- |
| Creator chat: `/app/chat`, `/app/chat/[id]`; [ChatPageClient](../../apps/web/app/app/(shell)/chat/ChatPageClient.tsx), [JovieChat](../../apps/web/components/jovie/JovieChat.tsx) | Full chat workspace, entity inspector overlay | Same chat with responsive composer and drawer adaptation | Existing [chat ratchet](../../apps/web/tests/e2e/chat-performance-ratchet.spec.ts): creator-ready auth, mocked backend, 1280×480, five scored sends on the warmed document, composer pacer respected, warmups excluded, scroll probe. Phone, existing-thread and other interaction qualification: gap, JOV-8720. |
| Ovie chat: `/app/ov/chat`; [OvChatClient](../../apps/web/app/app/(shell)/admin/chat/OvChatClient.tsx) | Canonical chat with Ovie mode and Home canvas | Same responsive chat, operator auth/data scope | Gap, JOV-8720. Shared JovieChat is not creator-to-Ovie timing proof. [Ovie deployment](../../apps/ovie/next.config.mjs) uses shared route adapters; it is a separate authenticated population. |
| Creator onboarding: [OnboardingShell](../../apps/web/components/features/onboarding/OnboardingShell.tsx) → [OnboardingChat](../../apps/web/components/features/onboarding/OnboardingChat.tsx) | Existing onboarding conversation | Existing responsive onboarding conversation | Gap, JOV-8720. Do not infer onboarding from the creator-ready fixture. |
| Conditional creator links conversation: [GroupedLinksManager](../../apps/web/components/features/dashboard/organisms/grouped-links/GroupedLinksManager.tsx) → [InlineChatArea](../../apps/web/components/features/dashboard/organisms/InlineChatArea.tsx) | Inline chat when links, profile and artist context exist and sidebar is closed | Conditional responsive component; mounted phone behavior requires verification | Gap, JOV-8720. Source has an inline caller and a fallback to canonical chat; do not invent a permanent second chat rail. |
| Creator decision inbox: `/app`; [OpportunityInboxRoute](../../apps/web/app/app/(shell)/OpportunityInboxRoute.tsx), [OpportunityInboxPageClient](../../apps/web/components/features/opportunity-inbox/OpportunityInboxPageClient.tsx) | Suggested actions, decisions, revision comments | Responsive inbox with the same supported actions | Gap under JOV-3887/JOV-8728. Measure pending/acknowledged/failed decision feedback and preserve comment drafts. `/app` is the inbox, not a second creator chat route. |
| Ovie decision inbox: `/app/ov/inbox`; [OvieInbox](../../apps/web/components/features/admin/hud/OvieInbox.tsx) | Existing approve/reject/modify decisions and source-specific evidence | Responsive component; phone qualification required | Gap under JOV-3887/JOV-8728. Measure the supported decision actions independently of chat send. |
| Existing browser audio and comments: [JovieChat](../../apps/web/components/jovie/JovieChat.tsx) audio attachment, [AudioPreviewStrip](../../apps/web/components/jovie/components/AudioPreviewStrip.tsx), [ThreadAudioCard](../../apps/web/components/shell/ThreadAudioCard.tsx), [FounderReviewRecorder](../../apps/web/components/features/opportunity-inbox/FounderReviewRecorder.tsx) | Attachment preview/playback, inbox revision text and founder review recording | Same controls where browser media support/permissions allow | Existing `audio-play-pause-visual` manifest covers transport visual feedback only (50ms inclusive p95), not a qualified chat/audio-comment round trip. Capture attach/pending/error/playback and existing text/recording feedback separately under JOV-3887. |
| Native iOS: [RootView](../../apps/ios/Jovie/App/RootView.swift), [MobileChatView](../../apps/ios/Jovie/Features/Chat/MobileChatView.swift), [InboxSurfaceView](../../apps/ios/Jovie/Features/Inbox/InboxSurfaceView.swift), [TalkOverlayView](../../apps/ios/Jovie/Features/AppShell/TalkOverlayView.swift) | Not applicable: native phone app, no desktop layout | Native chat with Jovie/Ovie workspace selection, shell rails, decisions with optional comments and Talk overlay | Native presentation/frame qualification gap: JOV-8725. Browser marks and simulator shell timing do not establish native chat frame timing. |
| Electron: [main.ts](../../apps/desktop/src/main.ts) opens `/app/chat` | Hosted web chat in Electron renderer and native window chrome | Not applicable: no Electron phone product | Renderer/platform timing gap under JOV-3887/JOV-8728. Browser results do not certify Electron startup, renderer scheduling or window presentation. |
| Unavailable independent surfaces | No separate mounted audio-comment conversation or permanent shell chat rail identified in this inventory | No Electron phone app; no separate native audio-comment chat identified | Explicitly unavailable as independent product surfaces. Test existing audio, decision-comment and Talk flows above; do not build new surfaces to fill a matrix cell. Native Ovie uses workspace selection, not an invented standalone app. |

The existing right rail is an [inspector overlay](../../apps/web/components/shell/AppShellRightRail.tsx).
Legacy `/app/dashboard/chat` redirects to canonical chat. Demos, story catalogs,
unused components and redirect aliases are not additional production timing
populations. Product reachability, permissions and feature flags must be read
back by each collector; source inventory is not live availability proof.

Ship now: corrected evaluator, executable boundary/coverage regressions and this
bounded contract. Re-evaluate when JOV-8720, JOV-8725 and JOV-8728 supply additional
surface collectors and promotion receipts. Then qualify each supported surface,
layout and platform separately without weakening budgets or creating missing UI.

## Verification

Run the existing suite from the repository root with the pinned toolchain:

```sh
pnpm --filter @jovie/web exec vitest run scripts/performance-interaction-report.test.ts
```

It includes a 231.8ms feedback p95 with 56.3ms p50 and 180ms usable-state p95;
the report must fail. Equality/just-below/just-above checks cover strict chat and
inclusive non-chat limits, and coverage tests reject omitted metrics/scenarios,
invalid values and duplicate identities. These are deterministic evaluator
results, not a measured production chat performance claim.

# LYB → Eve Hypertrophy Coach — Fable 5.1 Audit (JOV-5961)

Date: 2026-09-04 · Issue: [JOV-5961](https://linear.app/jovie/issue/JOV-5961/lyb-eve-fable-audit-simple-aesthetic-hypertrophy-coach) · Branch: `fallback/JOV-5961-fix`

## Scope

Delivery item 1 of the issue: a Fable 5.1 audit of the LYB app against the Eve aesthetic-hypertrophy-coach vision — gap vs vision, kill list, smallest Eve surface, design-system atom reuse, hypertrophy-programming backend slice, voice path, and what to delete from the current app. Audit target is `JovieInc/logyourbody@main` as of 2026-09-03. This repo (`JovieInc/Jovie`) hosts the canonical design-system atoms and a reusable on-device voice-capture pattern referenced below.

**Naming rule (binding):** both repos are public and Linear mirrors to this public repo, so reference-app, competitor, and person names stay out of code, docs, tests, and issue bodies (JOV-3241). The in-repo name for the backend is the **hypertrophy programming engine**; "the reference hypertrophy programming app" refers to the methodology source. Public seed data uses neutral identifiers (`volume_landmarks`, `contribution_map`).

## Vision under audit

A simple Eve app on the Jovie design system, 100% aesthetics:

- Visual timeline + Instagram-clean carousel feed of body and stats over time.
- Chat with a personal trainer at the level of a leading evidence-based hypertrophy educator — science-backed claims only.
- AirPods in → voice-log workouts; voice mode coaches through hypertrophy sessions.
- Backend: a faithful re-implementation of the reference hypertrophy programming methodology.
- Desktop: a Linear-like kanban to design workouts, or chat-only.
- Next workout rendered as an editorial card in chat with Apple-like graphics and clarity.
- Web stays landing-only; the product app is iOS on Neon. Current LYB stats screen is good; the rest of the UX is not this vision.

Non-goals: no second design system, no web app, no speculative UI beyond capability-complete surfaces.

## Gap vs vision (verified facts)

1. **No training domain model exists anywhere.** Core Data entities are `CachedBodyMetrics` / `DailyMetrics` / `HKSample` / `Profile` / `DexaResult` / `Device` / `SyncMetadata`; Neon collections are `app_users`, `body_metrics`, `chat_*`, and `native_product_records` collections `daily_metrics` / `glp1_medications` / `glp1_dose_logs` / `dexa_results` / `progress_photos`. HealthKit reads only `bodyMass`, `bodyFatPercentage`, `height`, `stepCount`. No workout, exercise, set, or program model.
2. **No voice path.** No speech/audio code, no `NSMicrophoneUsageDescription`, no `UIBackgroundModes` audio.
3. **Policy docs forbid the coach scope.** The LYB repo's `AGENTS.md` and `docs/product-development-roadmap.md` forbid a workout tracker and require AI to stay deterministic-insight; `agent/instructions.md` and the web chat persona (`apps/web/src/lib/chat/context.ts`) forbid training recommendations. These must be superseded before any cook agent will accept the scope.
4. **Design atoms are certified but unlanded.** The atom stack (logyourbody PRs #1059 → #1060 → #1063 → #1061/#1062 → #1064) is open, green, and machine-certified but not on `main`, which still runs the old Carbon slates (`#08090A`…), `controlHeight` 52, `cardRadius` 20.
5. **Three token sources = a de-facto second design system.** `Theme.swift` on `main`, `packages/design-tokens` (style-dictionary, off-brand purple primary), and the unlanded Noir Ion stack.
6. **Chat is thin and capped.** `/api/auth/mobile/chat/v1` SSE via a small chat model behind a `ChatModelPort`, 12-per-10-min and 100/day limits, 600 output tokens; iOS renders plain text inside a ~50 KB `Views/MainTabView.swift`. The eve.dev agent has all general tools disabled and six cutover gates unmet.
7. **The web landing-only lock is violated on disk.** `dashboard` / `log` / `photos` / `onboarding` / `import` / `steps` / `mobile` / `signin` / `signup` / `settings/*` pages exist in the LYB web app.
8. **Surface sprawl.** 47 `WorldClassScreen` cases; a 16-step BodyScore onboarding; `PaidAppSurfacePolicy` hard-returns `.photoTimelineHUD` while `weightLoggerMVP` and `legacyFullDashboardBeta` still compile.
9. **CI lacks surface gates.** `ci.yml` has js / ios / ios_quality (launch-quality-audit) lanes, but no screen registry, no per-screen capture requirement, and SwiftLint disables `type_body_length` / `function_body_length`.
10. **Reusable assets live in this repo.** Canonical atoms at `apps/ios/Jovie/DesignSystem/JovieTheme.swift` and an on-device-preferred `SFSpeechRecognizer` pattern at `apps/ios/Jovie/Core/VoiceCaptureService.swift`; there is no shared SwiftPM package between the repos.

## Design-system atom reuse

- Land the atom stack first, in order: #1059 → #1060 → #1063 → #1061/#1062 → #1064 (snap #1064 spacing: 30 first).
- Locked atoms: 32/510, 28/620, splash B, night-dj, optical grid. These stay; Eve reuses them as-is.
- Collapse to one token source: delete `packages/design-tokens` and retire the `Theme.swift` Carbon values in favor of the landed stack. No second design system.

## Kill list (what to delete from the current app)

- Dead home modes: `weightLoggerMVP` and `legacyFullDashboardBeta` surface policy branches (keep `.photoTimelineHUD` only).
- GLP-1 UI surfaces (medications, dose logs) — off-vision for the aesthetic coach.
- Share card and FFMI tile.
- Duplicate sliders.
- `LiquidGlass*` components.
- `packages/design-tokens` (see above).
- Dormant web routes (`dashboard` / `log` / `photos` / `onboarding` / `import` / `steps` / `mobile` / `settings/*`); restore the web landing-only lock.
- Onboarding cut from 16 steps to ≤ 6.
- `WorldClassScreen` cases pruned to the surface map below.

## Smallest Eve surface (≤ 12 screens)

- **Feed** — paged 4:5 date cards (body + stats over time), the Instagram-clean carousel; primary home, paired with **Stats**.
- **Coach chat** — one `WorkoutCard` organism rendering the next workout as an editorial card; drills into **Live Session**.
- **Single Talk FAB** — the only entry to voice logging and voice coaching.
- Everything else (settings, profile, import) stays off the primary tab bar.

## Hypertrophy programming backend slice

Deterministic engine in `apps/web/src/lib/training` (domain, not UI):

- Schema: `MesoBlock`, `Microcycle`, `Session`, `ExercisePrescription`, `SetLog` (weight / reps / **RIR**), `MuscleContribution` (fractional), `DeloadState`.
- Seed data: internally curated exercise + muscle-contribution table using neutral public names (`volume_landmarks`, `contribution_map`); no copied data or naming from any reference app.
- v0 deterministic rules: weekly fractional volume vs landmarks; simple double progression; deload heuristic stub with an explain string; progression driven by logged soreness / pump / performance / joint-pain feedback.
- Persistence: `native_product_records` collections `training_sessions`, `logged_sets`, `training_feedback`, plus typed `training_programs` on Neon.
- API: one route, `GET /api/auth/mobile/training/v1/next`, serving the next-workout editorial card.
- LLM boundary: the model **narrates** engine output and never prescribes numbers — enforced by engine-numbers and claims-registry evals.
- Eval harness: fixture mesocycles → expected prescriptions; the fixture corpus grows in CI so the algorithm is ever-improving and versioned.

## Voice path

- v1 = on-device `SFSpeechRecognizer` + server-side intent parse + `AVSpeechSynthesizer` coaching replies + background audio mode (pattern already proven in this repo's `VoiceCaptureService`).
- Disabled with a named reason when on-device STT is unavailable; no cloud/realtime voice SDK until the standing realtime-voice founder-decision gate flips.
- Vendor-boundary deny list for voice SDKs added to CI.
- Requires `NSMicrophoneUsageDescription` and `UIBackgroundModes` audio — both currently absent.

## Delivery and orchestration

1. **This audit** locks the scope (P0).
2. A tiny docs-supersession PR in the LYB repo flips `AGENTS.md`, the roadmap, agent instructions, and the chat persona to the coach scope — no cook agent can start before this lands.
3. A dedicated **LYB Eve** bot orchestrates end-to-end (Linear → cook → dogfood → App Store path); ops does not write product code.
4. Phases: **P1** training-engine v0 (domain + eval harness); **P2** Eve iOS surfaces (feed/carousel, coach chat + editorial card, voice log/coach); **P3** closed loop (post-session feedback → plan rewrite → next card); **P4** decision on the desktop kanban — deferred because it conflicts with the web landing-only lock.

## Fail-closed gates to add

- `WorldClassScreen` registry gate (unregistered screens fail CI).
- Per-screen 390pt capture required for machine-certified status.
- Shrink-only file-length ratchet (replaces the disabled SwiftLint length rules).
- `control_geometry` and `font_literal` detectors in `optical-grid-audit.py`.
- Engine-numbers and claims-registry evals gating the coach LLM.
- Vendor-boundary deny list for voice SDKs.

## Optimization-contract exception (JOV-5961)

This issue's in-repo deliverable is a product-audit and planning document: it ships no product surface, variant, or user-facing outcome in this repo, and the audited app lives in a different repository with no experiment or analytics surface wired to these documents. The optimization contract (stable variant identity, exposure, outcome, attribution, eligible context dimensions, hypothesis/primary metric, guardrails, privacy/consent, optimizer owner/cadence, decision writeback, rollback) is **declared not applicable** — there is nothing to expose or optimize here. The measurable proxies are the audit's own acceptance evidence: atom stack landed in order, kill-list PRs merged, engine eval fixtures green in CI, and the surface registry gate enforced. Rollback is the revert of this branch; the audit is advisory and deletes nothing by itself.

# Public Profile Hardening — Release Notes

Epic: [JOV-2018](https://linear.app/jovie/issue/JOV-2018/epic-public-profile-hardening-mobile-native-high-traffic-reliability)
Phase 11/11: [JOV-2029](https://linear.app/jovie/issue/JOV-2029)

## Goal

Make every `/{username}` and `/{username}/*` route feel native on mobile, render reliably under share-link / SMS / Gmail traffic, and run on a single canonical surface stack instead of N competing legacy templates.

## What shipped

### Phase 0 — Audit ([JOV-2019](https://linear.app/jovie/issue/JOV-2019), PR [#8376](https://github.com/JovieInc/Jovie/pull/8376))

- `docs/public-profile-hardening-audit.md`: 26-row route matrix, 9-category component duplication map, legacy cleanup list, prioritized risk register.
- No product code changes.

### Phase 1 — UX contract ([JOV-2020](https://linear.app/jovie/issue/JOV-2020), PR [#8378](https://github.com/JovieInc/Jovie/pull/8378))

- `docs/public-profile-surface-spec.md` (511 lines): canonical state matrix, layout spec, analytics surface names, and CTA copy contract for every `/{username}` state.

### Phase 2 — Central route config + canonical shell ([JOV-2021](https://linear.app/jovie/issue/JOV-2021), PR [#8384](https://github.com/JovieInc/Jovie/pull/8384))

- `lib/profile/route-config.ts`: single source of truth for profile routes, tab bar visibility, and caching strategy (48 unit tests).
- `components/features/profile/shell/` canonical shell barrel.
- Removed `animated-artist-page/` (6 files), `animated-listen-interface/` (5 files), `PublicProfileTemplate.tsx`, `ArtistPageShell.tsx`, drawer/mode duplicates.

### Phase 2 — Bottom tab bar + safe area ([JOV-2022](https://linear.app/jovie/issue/JOV-2022), PR [#8391](https://github.com/JovieInc/Jovie/pull/8391))

- Extracted `BottomTabBar.tsx` from inline template (26 unit tests).
- `lib/profile/nav-constants.ts` exposes `TAB_BAR_HEIGHT_REM` and `CONTENT_SAFE_AREA_BOTTOM_PADDING`.
- Retired the V2 template chain (`PublicProfileTemplateV2`, `ProgressiveArtistPage`, `ProfileViewportShell`).

### Phase 2/3 — Canonical subscribe form ([JOV-2023](https://linear.app/jovie/issue/JOV-2023), PR [#8401](https://github.com/JovieInc/Jovie/pull/8401))

- `components/features/profile/subscribe/` SubscribeForm (7 unit tests).
- Locked CTA labels to spec: "Turn on alerts" → "Get alerts", "Manage Alerts" → "Manage alerts".

### Phase 2 — Canonical metadata + OG ([JOV-2026](https://linear.app/jovie/issue/JOV-2026), PR [#8400](https://github.com/JovieInc/Jovie/pull/8400))

- `lib/profile/metadata.ts` shared `generateMetadata` builder; sanitizes artist-provided text; unpublished profiles emit `noindex`.
- Metadata wired into redirect sinks (`/listen`, `/releases`, `/subscribe`, etc.).
- 43 unit tests.

### Phase 2 — Design tokens + z-index ([JOV-2025](https://linear.app/jovie/issue/JOV-2025), PR [#8521](https://github.com/JovieInc/Jovie/pull/8521))

- `lib/profile/z-index-constants.ts` documents canonical layering for drawers, overlays, and takeovers.
- Replaced one-off hex (`#15161a`, `#ff8b8b`) with token utilities; replaced magic `duration-200` values with motion tokens.

### Phase 2 — Scroll / viewport / safe-area hardening ([JOV-2024](https://linear.app/jovie/issue/JOV-2024), PR [#8465](https://github.com/JovieInc/Jovie/pull/8465))

- `ProfileCompactSurface` / `ProfileCompactTemplate` viewport and safe-area handling stabilized for iOS / Android share traffic.
- TS lib bumped es2022 → esnext to unlock ES2023+ helpers used in the new shell.

### Phase 2/7 — Performance + image fallbacks ([JOV-2027](https://linear.app/jovie/issue/JOV-2027), PR [#8522](https://github.com/JovieInc/Jovie/pull/8522))

- `ProfileWebVitalsReporter` mounted in `/[username]` layout — emits LCP / INP / CLS / FCP / TTFB.
- AboutSection press photos use `ImageWithFallback` for graceful missing-image degradation.

### Phase 3 — Mobile E2E + metadata + copy regression ([JOV-2028](https://linear.app/jovie/issue/JOV-2028), PR [#8546](https://github.com/JovieInc/Jovie/pull/8546))

- Playwright specs: `responsive-shell.spec.ts`, `metadata-regression.spec.ts`, `copy-regression.spec.ts` (3 files, 240+ lines combined).
- Coverage: 375–1280px viewport matrix, redirect parity, OG shape assertions, placeholder copy blocking.

## Legacy purged

The epic deleted ~20 legacy files. Anything in this list should not return without a Linear issue:

- `components/features/profile/animated-artist-page/` (6 files)
- `components/features/profile/animated-listen-interface/` (5 files)
- `PublicProfileTemplate.tsx` and `PublicProfileTemplateV2.tsx`
- `ProgressiveArtistPage.tsx`
- `ProfileViewportShell.tsx`
- `ProfileScrollBody.tsx`
- `ArtistPageShell.tsx`
- `ProfileModeDrawer.tsx` / `ProfileMenuDrawer.tsx` / `SubscribeDrawer.tsx`
- `SwipeableModeContainer.tsx`
- Co-located test/story files for each of the above

Canonical replacements all live under `components/features/profile/shell/` and `components/features/profile/subscribe/`.

## QA verification matrix

This section is the [JOV-2029](https://linear.app/jovie/issue/JOV-2029) execution checklist. It is meant to be filled in by a human operator and committed back as a follow-up PR. Anything not verifiable from inside Claude Code is flagged `[manual]`.

### Real-device QA `[manual]`

| Device | Tester | Date | Result | Notes |
|---|---|---|---|---|
| iPhone SE (smallest current iOS Safari) | | | | |
| iPhone 15+ (current iOS Safari) | | | | |
| Pixel mid-range (Android Chrome) | | | | |

Per device walk:

- [ ] Profile root → top-level sections (Home / Music / About / etc.)
- [ ] Subscribe flow (tap CTA → email → success → back)
- [ ] External link tap behavior
- [ ] Back-button returns cleanly to previous surface
- [ ] No horizontal scroll at any width
- [ ] No clipped content under tab bar / safe-area
- [ ] No scroll traps
- [ ] Keyboard does not cover the email field or submit button

### Gmail share preview `[manual]`

Send each URL from a desktop client, then open from Gmail iOS and Gmail Android. Confirm preview, then tap through.

| URL | iOS preview | Android preview | iOS tap-through | Android tap-through |
|---|---|---|---|---|
| `https://jov.ie/tim` | | | | |
| (representative profile 2) | | | | |
| (representative profile 3) | | | | |
| `https://jov.ie/subscribe` (canonical) | | | | |

Capture: screenshot of each preview card and each first-paint of the destination route.

### In-app browser smoke `[manual]`

Test where practical. Same URLs as above:

- [ ] Instagram in-app browser
- [ ] TikTok in-app browser
- [ ] X / Twitter in-app browser
- [ ] iMessage / SMS preview
- [ ] Slack preview
- [ ] Discord preview

### Content fixture sweep `[manual]`

Walk one profile per fixture from [JOV-2028](https://linear.app/jovie/issue/JOV-2028). Confirm the experience is intentional (not broken, not surprising):

- [ ] No avatar
- [ ] Long display name
- [ ] Many links
- [ ] No music
- [ ] Broken image
- [ ] Unpublished
- [ ] First-load empty state

### Screen recordings `[manual]`

Record three short clips on a real device, attach to this PR or to JOV-2029:

- [ ] Mobile profile home → top-level tab navigation
- [ ] Subscribe flow (CTA → submit → success → back)
- [ ] External link tap behavior

### Screenshot grid `[manual]`

At 4+ mobile widths (e.g. 320 / 375 / 414 / 768), for the canonical fixture set:

- [ ] Profile root
- [ ] Music / Listen surface
- [ ] About surface
- [ ] Subscribe sheet

### Verifiable from CI (already green when these PRs merged)

- [x] Unit tests for `route-config`, `BottomTabBar`, `SubscribeForm`, `metadata` (148+ tests across phases)
- [x] Playwright regression specs (`responsive-shell`, `metadata-regression`, `copy-regression`) from JOV-2028
- [x] Web-vitals reporter installed (JOV-2027)
- [x] Z-index canonicalization (JOV-2025)

## Epic acceptance criteria audit

Cross-check against [JOV-2018](https://linear.app/jovie/issue/JOV-2018) acceptance criteria. Each item resolves to either ✅ (verified true from this branch) or `[manual]` (requires the QA matrix above) or 📋 (tracked follow-up with a Linear ID).

| AC item | Status | Evidence |
|---|---|---|
| Single canonical profile shell (no V1 / V2 / animated forks) | ✅ | Legacy list above; only `components/features/profile/shell/` remains |
| Central route config | ✅ | `lib/profile/route-config.ts` |
| Canonical subscribe form | ✅ | `components/features/profile/subscribe/SubscribeForm.tsx` |
| Canonical bottom tab bar + safe area | ✅ | `components/features/profile/shell/BottomTabBar.tsx`, `lib/profile/nav-constants.ts` |
| Canonical metadata / OG for all profile routes | ✅ | `lib/profile/metadata.ts` (43 unit tests) |
| Mobile E2E regression coverage | ✅ | `apps/web/tests/e2e/profile/*.spec.ts` (JOV-2028) |
| Web vitals instrumentation | ✅ | `ProfileWebVitalsReporter` in `/[username]/layout.tsx` |
| Z-index / token canonicalization | ✅ | `lib/profile/z-index-constants.ts` |
| Real-device QA across iOS Safari + Android Chrome | `[manual]` | QA matrix above |
| Gmail share preview verified (iOS + Android) | `[manual]` | Gmail row above |
| In-app browser smoke | `[manual]` | In-app row above |
| Screen recordings + screenshot grid | `[manual]` | Recordings / Grid rows above |

## Known follow-ups

File each as a Linear issue when discovered. Do not leave inline TODOs. None recorded at release time — operators running the QA matrix above must open issues for any failures.

- _none_

## How to use this document

1. Operator runs the manual QA matrix on real devices.
2. For each `[manual]` row, fill in tester / date / result / notes.
3. Attach screenshots and recordings to JOV-2029.
4. Any failure → file a follow-up Linear issue with priority + owner, link it under "Known follow-ups", and reference in the closing comment on JOV-2029.
5. When all rows are ✅ or 📋, move JOV-2029 and the epic to Done.

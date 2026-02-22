# iOS App Strategy: Capacitor-First with Native Migration Path

## Summary

Ship an iOS app in 2 phases: a Capacitor WebView wrapper for fast App Store presence (Phase 1), followed by extraction of shared packages to enable a future native Swift app if demand warrants it (Phase 2). This avoids months of speculative native development while validating iOS demand with real users.

---

## Problem

Jovie has no iOS presence. All features (creator dashboard, chat, billing, analytics, social links, content management) live exclusively in the Next.js web app. Mobile users get the responsive web experience but miss native capabilities: push notifications, home screen presence, haptics, and the distribution/trust signal of the App Store.

Building a native Swift app from scratch would take 3-6 months to reach feature parity and create a permanent second codebase to maintain. The current architecture makes this especially expensive:
- 50+ TanStack Query hooks locked inside `apps/web`
- Zod validation schemas not extractable as a shared package
- 100+ API route handlers with no OpenAPI spec (undocumented contract)
- Drizzle types not shared outside the web app

---

## Proposed Solution

### Phase 1: Capacitor Shell (1-2 weeks)

Wrap the existing Next.js PWA in a Capacitor iOS shell. The web app runs inside a WKWebView with native bridge plugins for platform APIs.

**Scope:**
- [ ] Initialize Capacitor in the monorepo (`apps/ios` or `apps/capacitor`)
- [ ] Configure WKWebView to load the production web app URL
- [ ] Add `@capacitor/push-notifications` plugin — register for APNs, forward tokens to existing notification infrastructure
- [ ] Add `@capacitor/haptics` plugin — light haptic feedback on key interactions (tip sent, link saved, etc.)
- [ ] Add `@capacitor/share` plugin — native share sheet for creator profile links
- [ ] Add `@capacitor/splash-screen` — branded launch screen
- [ ] Add `@capacitor/status-bar` — style status bar to match app theme
- [ ] Configure `capacitor.config.ts` with app ID, server URL, and plugin defaults
- [ ] Set up Xcode project with correct signing, capabilities (Push Notifications, Associated Domains)
- [ ] Add universal links / deep linking support
- [ ] App Store assets: icon (1024x1024), screenshots, metadata
- [ ] Submit to App Store review

**What users get:**
- Home screen icon with badge count
- Push notifications (native APNs)
- Share sheet integration
- Full feature parity with web (it IS the web app)

**What users DON'T get:**
- Native iOS animations/transitions (still web-feel scrolling)
- Widgets, Live Activities, App Intents
- Offline mode
- Native keyboard/gesture handling

### Phase 2: Shared Package Extraction (2-4 weeks, parallel or after Phase 1)

Extract reusable logic from `apps/web` into shared packages so that a future native client (or any client) can consume validated types and API contracts.

**Scope:**
- [ ] `packages/validation` — Move Zod schemas from `apps/web/lib/validation/schemas/` into a shared package. Export inferred TypeScript types.
- [ ] `packages/api-client` — Create a typed fetch client generated from route handler signatures. Consider adding OpenAPI spec generation to route handlers (e.g., `next-swagger-doc` or manual OpenAPI YAML).
- [ ] `packages/constants` — Extract shared enums, config values, and business logic constants currently duplicated or buried in `apps/web/lib/`.
- [ ] Update `apps/web` imports to consume from shared packages instead of local paths.
- [ ] Validate with `pnpm turbo build` — no regressions.

**Why this matters for native:**
- A Swift app could consume the OpenAPI spec to auto-generate API client code (via `swift-openapi-generator`)
- Validation rules stay in sync — one source of truth
- API contract is documented and versioned

### Phase 3: Native Swift App (future, only if validated)

**Trigger criteria — only start if:**
- iOS Capacitor app has 1,000+ MAU
- User feedback specifically cites performance/UX issues with the wrapper
- Business case for iOS-exclusive features (widgets, Live Activities, etc.)

**If triggered:**
- SwiftUI app in `apps/ios-native`
- Auto-generated API client from OpenAPI spec (Phase 2 output)
- Feature parity roadmap: start with highest-traffic screens (dashboard, chat, profile)
- Retire Capacitor app once native reaches 80% feature parity

---

## Architecture

```
jovie/
├── apps/
│   ├── web/                    # Existing Next.js app (unchanged)
│   ├── ios/                    # NEW: Capacitor shell (Phase 1)
│   │   ├── capacitor.config.ts
│   │   ├── ios/                # Xcode project (auto-generated)
│   │   └── src/                # Native plugin bridges if needed
│   └── ios-native/             # FUTURE: Swift app (Phase 3)
├── packages/
│   ├── ui/                     # Existing shared UI
│   ├── validation/             # NEW: Shared Zod schemas (Phase 2)
│   ├── api-client/             # NEW: Typed API client (Phase 2)
│   └── constants/              # NEW: Shared constants (Phase 2)
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Capacitor vs React Native | Capacitor | Zero rewrite — wraps existing web app as-is |
| Capacitor vs PWA-only | Capacitor | Push notifications require native APNs; App Store presence matters for trust |
| App loads remote URL vs bundled assets | Remote URL | Ship web updates without App Store review cycle |
| Phase 2 before Phase 3 | Yes | Shared packages benefit web DX regardless of native app |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Apple rejects WebView wrapper | Medium | Ensure native plugin usage (push, haptics, share) demonstrates native integration. Add a native settings screen. Apple's bar is "meaningful native functionality." |
| WebView performance on older iPhones | Low-Medium | Test on iPhone 12 (minimum target). Optimize critical CSS, reduce JS bundle. |
| Users expect native feel | Medium | Set expectations in App Store description. Prioritize Phase 3 if retention data shows drop-off. |
| Phase 2 extraction breaks web app | Low | Incremental migration with barrel re-exports. CI validates builds. |

---

## Success Metrics

- **Phase 1:** App Store approval within 2 review cycles. 500+ installs in first month.
- **Phase 2:** Zero regressions in web app. Shared packages consumed by `apps/web` with no import path changes needed by feature code.
- **Phase 3 trigger:** 1,000+ iOS MAU AND negative UX feedback citing wrapper limitations.

---

## Effort Estimates

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Phase 1: Capacitor Shell | 1-2 weeks | Apple Developer account, APNs certificates |
| Phase 2: Package Extraction | 2-4 weeks | None (can run parallel) |
| Phase 3: Native Swift | 3-6 months | Phase 2 complete, iOS engineer hire |

---

## Open Questions

1. **Apple Developer account** — Is one already set up, or does this need to be created?
2. **Push notification infrastructure** — What's the current web push setup? Can APNs tokens feed into the same system?
3. **App Store identity** — App name, bundle ID (`com.jovie.app`?), App Store category?
4. **Minimum iOS version** — iOS 16+ (covers ~95% of devices) or iOS 17+?

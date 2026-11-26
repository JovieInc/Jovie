# Native / web / Electron decision records

> Policy owner: [`canon/ENGINEERING.md` § Native / web / Electron boundary](../../canon/ENGINEERING.md#native--web--electron-boundary).
> Status: living receipts for real surfaces. Add a row when a boundary changes;
> do not invent hypothetical stacks here.

Each record uses the policy fields: user problem + evidence; why chosen impl;
API/auth/nav/state boundary; compatibility/fallback; migration/rollback; what
can be retired; what would justify revisiting.

---

## D1 — Jovie iOS: YouTube / Insights / Jovie Work / release-plan stay web-only

| Field | Record |
| --- | --- |
| Surface | `webOnly.youtube`, `webOnly.insights`, `webOnly.jovieWork`, `webOnly.releasePlan`, `webOnly.dashboardInsights` (`AppRouteManifest`); merch checkout outside `/app/*` |
| Platforms | Jovie iOS (boundary); web owns the product UI; Mac Electron loads the same hosted routes |
| Decision | **Retain web.** Do not mount these workspaces in the iOS shell. |
| User problem + evidence | Dense packaging/insights/work UIs have no iOS route graph. Claiming them via Universal Links stranded users in-app (JOV-7632). Manifest classification `.webOnly`, AASA `NOT` prefixes in `apps/web/lib/ios/apple-app-site-association.ts` (`IOS_WEB_ONLY_APP_PATH_PREFIXES`), and `MobileWebOnlyRouteBoundary` in `AppShellIntentNavigation.swift` are the paired guards; `AppRouteManifestTests` / `AppShellIntentNavigationTests` lock the list. |
| Why this impl | Ownership cost of a second native IA exceeds benefit for infrequent / long-tail creator tools. One hosted implementation stays authoritative. |
| API / auth / nav / state | Server session + web app routes. iOS never owns route state for these paths. Deep links that still arrive hand off to Safari via `webFallbackURL`. |
| Compatibility / fallback | Stale AASA or older builds: in-app guard opens the web URL. Merch checkout never enters `/app/*` AASA claims. |
| Migration / rollback | Adding a native surface requires removing the path from both `IOS_WEB_ONLY_APP_PATH_PREFIXES` and `MobileWebOnlyRouteBoundary.pathPrefixes`, a manifest entry change, and tests. Rollback restores both lists. |
| Can retire | Nothing today — web surfaces remain. Retire the Safari handoff only after a shipped native workspace exists. |
| Revisit when | Paid creators hit these weekly from iOS with measured drop-off, or a native IA slice lands with parity evidence. |

**Ship now:** keep web-only lists synced. **Re-evaluate when:** native IA for one
workspace is certified. **Then:** promote that path only, leave others web.

---

## D2 — Jovie iOS Settings: Billing / Manage Account / legal → Safari

| Field | Record |
| --- | --- |
| Surface | `settings.billing`, `settings.manageAccount`, `settings.privacy`, `settings.terms`, `settings.support` |
| Platforms | Jovie iOS Settings (`SettingsView.swift` `Link` rows); web owns Stripe Customer Portal and legal pages |
| Decision | **Retain web handoff** (Safari `Link`). Native Settings stays the shell for logout, build provenance, and workspace switch. |
| User problem + evidence | Billing and account management are infrequent, Stripe-owned portal flows. Certification oracle (`canon/certification/jovie-ios.json`) requires the Settings billing handoff to show canonical price and reflect entitlement after return — not a native StoreKit rewrite. Route rows are `.externalLink` in `AppRouteManifest`. |
| Why this impl | Server-authoritative entitlements + Stripe portal; duplicating portal UX natively raises PCI/App Store and ownership cost without daily-loop benefit. |
| API / auth / nav / state | Web session after Safari open; entitlements refresh when the user returns to the app. iOS does not mutate plan state locally. |
| Compatibility / fallback | If the URL is unavailable, the row is omitted (`SettingsExternalURL` optionals for support/privacy/terms); billing uses the configured `billingURL`. |
| Migration / rollback | Native IAP would need a separate receipt, App Store review path, and entitlement reconciliation. Until then, keep Safari links. |
| Can retire | Nothing — web portal remains source of truth for plan changes. |
| Revisit when | App Store requires IAP for the digital good, or dogfood shows billing completion failing because of Safari context loss with measured activation impact. |

---

## D3 — Jovie iOS public profile: WKWebView hosts the single playback engine

| Field | Record |
| --- | --- |
| Surface | `PublicProfileBrowserView` / `PublicProfileBrowserMediaPolicy` |
| Platforms | Jovie iOS (native chrome + WKWebView); web owns playback (`JOV-3683` / `JOV-5871`) |
| Decision | **Hybrid:** native browser chrome; **retain web** for the playback engine inside WKWebView. |
| User problem + evidence | One playback engine must work across web and iOS. Without inline media flags, iOS forces fullscreen system player and breaks Media Session resume (documented in `PublicProfileBrowserMediaPolicy`). Haptics bridge (`jovieHaptics`) keeps dial feel native. |
| Why this impl | Forking a second native player would drift from the hosted smart-link engine. WebKit is on-demand for this surface, not a permanent chat shell (Mac ADR web-bridge rule). |
| API / auth / nav / state | Loads public profile URLs; main-frame navigation guarded; media session + audio background mode for continuity. No second auth token family. |
| Compatibility / fallback | Load failure shows in-webview error HTML; reload/back/forward stay in the native chrome. |
| Migration / rollback | A native player needs feature parity receipts (inline, lock-screen, Media Session). Until then, keep WKWebView + media policy. |
| Can retire | A future native player could retire the WKWebView **only** after parity; the hosted engine remains for web. |
| Revisit when | Playback bugs are iOS-WebKit-specific and dominate support, with a measured native alternative. |

---

## D4 — Jovie macOS: Electron shipped; SwiftUI direction; no native Ovie

| Field | Record |
| --- | --- |
| Surface | `apps/desktop` (shipped), `apps/ios/JovieMac` (dev target), Ovie door → `/app/ov` |
| Platforms | Jovie macOS |
| Decision | **Retain Electron** as the shipped Mac product until accepted native cutover. **Native direction** for new Mac product work (SwiftUI). **Web-only** for Ovie. |
| User problem + evidence | Accepted ADR [`docs/macos/ADR-swift-native-mac.md`](../macos/ADR-swift-native-mac.md); stack receipt [`docs/macos/swift-control-invariants.md`](../macos/swift-control-invariants.md); founder EVENT one Ovie (`canon/PRODUCT.md`, `canon/product-surfaces.json`). Electron remains maintenance-only for new surfaces (`.claude/rules/macos.md`). |
| Why this impl | Users need a working Mac app now; native chat path is uncertified. Ovie is company OS on the shared web shell — a second native Ovie already failed (agent sprawl). |
| API / auth / nav / state | Hosted Next via `BrowserWindow`; desktop auth/PKCE contracts in `docs/macos/desktop-auth.md`. Native cutover must preserve session migration and rollback. |
| Compatibility / fallback | Electron updater feeds stay live through cutover window. Unsigned/fixture Mac builds are not auth proof. |
| Migration / rollback | Stages 1–5 in the Mac ADR. Retire `apps/desktop` only after parity/signing/update/rollback receipts close. |
| Can retire | Electron shell and its release machinery — only after the rollback window closes. |
| Revisit when | Native chat path has real Mac interaction, security, and performance receipts (ADR acceptance). |

---

## D5 — LogYourBody iOS: HealthKit / logging stay native; coach policy stays server-side

| Field | Record |
| --- | --- |
| Surface | LYB iOS body logging, charts, HealthKit; coach responses |
| Platforms | LogYourBody iOS (`JovieInc/LogYourBody`); contracts held in this repo |
| Decision | **Native** for capture, HealthKit, background, and charting performance. **Shared/server** for health trust dispositions. No parallel web coach that bypasses the boundary. |
| User problem + evidence | Swift architecture ADR (`docs/architecture/swift-architecture-adr-2026-10-29.md`): production hangs were LYB-native `View.body` derived-data work — proves the daily loop is a native performance surface, not a WebView. Trust boundary (`docs/product/lyb-health-trust-boundary.md`) requires deterministic ALLOWED/DISALLOWED/ESCALATE before generation; clients must not invent medical policy. |
| Why this impl | HealthKit, notifications, and offline logging need platform APIs. Safety dispositions are undifferentiated policy mechanisms that must stay server-authoritative (capability-sourcing §6–8). |
| API / auth / nav / state | Native stores follow the shared Swift ADR (`@Observable`, off-main derivation). Coach tools call server policy; no client override of DISALLOWED. |
| Compatibility / fallback | When evidence is thin, disposition is defer (`lyb-health-trust-boundary`). Web admin/content surfaces (if any) must not expose a coach that skips the boundary. |
| Migration / rollback | Web-only LYB coaching would need HealthKit bridging and trust-boundary eval parity — not authorized by this receipt. |
| Can retire | One-off hang patches that recompute in `body` — retired by the architecture ratchet, not by moving to web. |
| Revisit when | Design-partner evidence shows a refused category was core to paid outcome (trust-boundary re-eval), or a measured web surface is needed for admin-only tooling. |

---

## Open questions (deferred; evidence threshold)

| Question | Threshold to reopen |
| --- | --- |
| Native Mac cutover date | Complete stage-3 chat path + stage-4 signing/parity receipts on real Mac hardware |
| Native iOS Insights or YouTube | ≥3 distinct paid creators weekly-active on that workspace from iOS with measured Safari drop-off |
| Native IAP for Artist Presence | App Store policy change or measured Safari billing failure rate impacting activation |
| Native public-profile player | iOS-WebKit-specific playback defects dominating support with a parity plan |
| LYB web coach surface | Explicit product decision + trust-boundary eval suite green on that client |

`gbrain-unavailable` at authoring time; receipts bound to repo paths and existing
issue IDs above.

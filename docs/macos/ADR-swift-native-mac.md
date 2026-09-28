# ADR: The Mac app goes Swift-native

> Status: **Accepted.** Permanent direction.
> Date: 2026-09-27
> Supersedes: the "Mac product is Electron, not Swift" rule in
> [`docs/MACOS_SWIFT_CONTROL_ADR.md`](../MACOS_SWIFT_CONTROL_ADR.md) (JOV-5359)
> and proposed slug `JOV-INV-013` in
> [`swift-control-invariants.md`](swift-control-invariants.md).
> Spike: `apps/ios/JovieMac` (`JovieMac.xcodeproj`). Epic: [JOV-6747](https://linear.app/jovie/issue/JOV-6747) (children JOV-6748..6760).

EVENT: permanent direction set by Tim 2026-09-27. "The goal should be to go
Swift native eventually, since Electron is dead in an AI shipping world." The
Mac app becomes a native SwiftUI app that shares one Apple codebase with iOS.
Electron (`apps/desktop`) stays the shipped Mac app until the native app
reaches parity, then retires.

**Ship now:** land the spike target, `webcredentials` in the AASA, and the
phased plan. Electron keeps shipping, including in-flight auth and update work.
**Re-evaluate when:** the native app passes the Phase 3 parity checklist on
Tim's Mac for 7 consecutive days of daily use.
**Then:** ship the native app to all Mac users through the chosen channel and
retire `apps/desktop` (Phase 4).

## 1. Why

| Reason | What it buys |
| --- | --- |
| AI agents ship Swift/SwiftUI well | One typed, compiler-checked UI language. Agents already ship the iOS app. Electron adds a Node main process, preload IPC, Chromium quirks, and an electron-builder release graph for every change. |
| Platform passkeys, including 1Password | `ASAuthorizationPlatformPublicKeyCredentialProvider` goes through the system passkey sheet. On macOS 14+ that sheet includes credential-provider extensions such as 1Password. Electron's WebAuthn sees only Chromium's authenticators, so Tim's 1Password passkeys never appear. |
| Native performance and battery | One process, no bundled Chromium, and no renderer watchdogs. Most of the recovery machinery in `renderer-recovery.ts`, `main-liveness.ts`, and `desktop-csp-watchdog.ts` exists only because Electron is present. |
| Notifications, menu bar, Spotlight, Shortcuts | `UNUserNotificationCenter`, `MenuBarExtra`, App Intents (Spotlight, Shortcuts, Siri), and `NSUserActivity` handoff are first-class, and several already exist in iOS (`Features/Intents`). |
| One SwiftUI codebase with iOS | `JovieTheme`, the API client, Better Auth session handling, and the response models are written once and compiled for both platforms. |

The Electron-only ADR (JOV-5359) was right about its own problem: agents were
starting parallel Swift shells, remocking atoms, and inventing a second HUD.
This ADR keeps that discipline and changes the target. There is still one
Swift Mac app. It shares iOS source and tokens, and it has an exit plan for
every web-hosted surface.

## 2. Target architecture

### Options

| Option | Shape | Verdict |
| --- | --- | --- |
| A. Add a macOS destination to the iOS `Jovie` target | One target, `SUPPORTED_PLATFORMS` includes macOS | Rejected for now. 16 iOS files import UIKit (teleprompter capture, wallet, QR/CoreImage, brightness, window scenes), and the shell is phone-shaped (tab bar, drawer, sheets). One target would need `#if os(...)` throughout the views. |
| B. Mac Catalyst | Run the iOS app on Mac through UIKit-for-Mac | Rejected. It produces an iPad-shaped Mac app, gives poor menu, toolbar, and window control, and ties Mac UX to iOS layout. That fails the "native Mac affordances" goal. |
| C. Separate Mac app/repo | New codebase | Rejected. It forks tokens, networking, and auth, which is the drift JOV-3854 already killed once. |
| **D. Sibling native macOS target sharing iOS source** | Separate SwiftUI Mac app target. Shared code is compiled into both targets now and moves into a local `JovieKit` Swift package in Phase 1. | **Recommended.** Each platform gets native shells (`NavigationSplitView`, `MenuBarExtra`, `Settings`, `commands`) on shared foundations. |

### Recommended layout

```text
apps/ios/                          # rename to apps/apple in Phase 1
  Jovie/                           # iOS app target (unchanged owner)
  JovieMac/                        # macOS app target: shells, windows, menus
  JovieMacTests/
  Packages/JovieKit/               # Phase 1: shared, platform-neutral
    DesignSystem  (JovieTheme)
    Networking    (APIClient, response models)
    Auth          (NativeSessionTokenStore, passkey + PKCE clients)
```

Rules:

- `JovieTheme` stays the only token source for both platforms (DESIGN.md
  Noir Ion). The Mac target does not get its own palette, fonts, or atoms.
- Shared code imports Foundation or SwiftUI only. Platform shells own
  UIKit/AppKit.
- Bundle ID `ie.jov.Jovie` on both platforms, so one App ID covers Associated
  Domains and a possible Mac App Store universal purchase. Electron keeps
  `app.jov.ie` until retirement.

The spike took the first step. It compiles 8 shared iOS files unchanged plus
one small refactor: `JovieTheme` fonts now go through a platform font alias,
and the chat-entity accent mapping moved beside the chat views so the design
system no longer depends on chat models.

## 3. Native first vs temporarily web-hosted

WKWebView is allowed only as an **explicit, time-boxed bridge**. Each bridged
surface must have a Linear issue with an exit date and an entry in the
bridge register (section 9). A bridge must never be the permanent owner of a
product surface.

| Surface | Phase | Native or bridge |
| --- | --- | --- |
| Sign-in (passkey + PKCE browser fallback), session, sign-out | 1 | Native |
| Ovie home (`/hud?ovie=mac` Ops metrics, identity) | 1 | Native, backed by `/api/hud/metrics` |
| Chat (`/app/chat`, `/app/ov/chat`) incl. streaming, tool cards, voice | 2 | Native. Port `MobileChatClient`, `ChatRepository`, and the message views from iOS. |
| Inbox, calendar, library, audience | 2 | Native. The iOS surfaces and `/api/mobile/v1/*` already exist. |
| Menu-bar presence and notifications | 2 | Native (`MenuBarExtra`, `UNUserNotificationCenter`) |
| Admin/settings long tail, billing, onboarding edge cases | 2 to 3 | **Bridge** (WKWebView with the bearer session). Exit by Phase 4 or an explicit keep-on-web decision. |
| Operator launch (Mercury, Linear, `gem` SSH), founder walks | 3 | Native (`NSWorkspace`, `Process`) |

## 4. Auth

- **Primary: platform passkeys.** Better Auth `@better-auth/passkey`
  (#18574, `passkey({ rpName: 'Jovie' })`). The ceremony is
  `GET /api/auth/passkey/generate-authenticate-options`, then
  `ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier:)`,
  then `POST /api/auth/passkey/verify-authentication` with
  `Origin: https://<rpId>` and the WebAuthn JSON. The challenge lives in the
  signed `better-auth-passkey` cookie, so both calls share one cookie jar.
  Better Auth creates a session. The bearer plugin's `set-auth-token` header
  (or `session.token`) goes into the Keychain through the same
  `NativeSessionTokenStore` iOS uses. Every later API call is
  `Authorization: Bearer`.
- **Requirements:** the app is signed with the `com.apple.developer.associated-domains`
  entitlement `webcredentials:jov.ie` (plus `webcredentials:staging.jov.ie` for
  staging), and each domain serves an AASA whose `webcredentials.apps`
  contains `G24T327LXT.ie.jov.Jovie`. rpId is the base URL host (`jov.ie` in
  production, `staging.jov.ie` in staging).
- **Fallback: PKCE in the system browser.** This reuses the iOS
  `ASWebAuthenticationSession` flow (`/auth/start?client=…&code_challenge=…`,
  then `/api/auth/native/exchange`). It covers users without a passkey and
  first-time enrollment. Before shipping, the exchange needs a `client=macos`
  value.
- **Admin step-up:** passkey sign-in mints the JOV-4806 12-hour step-up
  receipt through `adminPasskeyStepUp`. That is the same factor the Electron
  Touch ID work targets, with no Electron-specific code.

## 5. Distribution and updates

**Recommended: Developer ID + Sparkle 2 + notarization.** Mac App Store stays
an option after parity.

| | Developer ID + Sparkle | Mac App Store |
| --- | --- | --- |
| Release cadence | Ours. Matches today's nightly/staging channels. | App Review on every release |
| Operator features (SSH launch, screen recording, local tooling) | Allowed | Sandbox and review friction |
| Update path from Electron | Final Electron release installs the native app (same team ID) | Separate install |
| Needs | Developer ID Application cert (present on Tim's Mac), Developer ID provisioning profile with Associated Domains, notarytool credentials, Sparkle EdDSA key | App Store distribution profile, App Store Connect record |

Sparkle keeps the channel model `apps/desktop` already has (stable, staging,
nightly) through separate appcast feeds. Notarization reuses the notarytool
credentials `desktop-release.yml` uses today.

## 6. Parity checklist vs Electron

A native release replaces Electron only when every row is native or has a
registered bridge.

| Electron capability (`apps/desktop/src`) | Native owner |
| --- | --- |
| Browser/PKCE auth handoff, `jovie://` deep links (`desktop-auth-browser-route.ts`, `open-url`) | Passkey + `ASWebAuthenticationSession`; `onOpenURL` |
| Touch ID / passkey admin step-up (in flight, mac-auth) | Platform passkey (section 4) |
| Auto-update + nightly channel (`desktop-auto-update.ts`, `nightly-update-launch-agent.ts`) | Sparkle feeds |
| What's-new (in flight) | Native sheet fed by the same changelog source |
| Ovie door `/hud?ovie=mac`, talk `/app/ov/chat` (`ovie-door.ts`) | Native Ovie home + chat |
| Customer entry `/app/chat` | Native chat |
| Tray: chat, unread, error (`tray.ts`) | `MenuBarExtra` + dock badge |
| Notifications | `UNUserNotificationCenter` |
| Window state restore (`window-state*.ts`) | SwiftUI scene restoration |
| Renderer recovery and liveness watchdogs | Not needed (no renderer). Keep an offline/stale state instead. |
| CSP watchdog, remote-debugging guard | Not needed (no web content outside registered bridges) |
| Mic + screen capture for product walks (`voice-session.ts`, `desktopCapturer`) | AVFoundation + ScreenCaptureKit |
| Operator launch web/SSH (`operator-launch.ts`) | `NSWorkspace` / `Process` with the same allowlist |
| Local/staging/production variants and build identity (`build-identity.ts`) | Xcode configurations + `JOVIE_MAC_BASE_URL` |
| Signing, fuses, notarization (`apply-electron-fuses.cjs`, `notarize-release-dmg.cjs`) | Xcode archive + notarytool |
| Summer runtime bridge (retired, `retired-awaiting-eve`) | None. Summer talks to Eve server-side. |

## 7. Phased migration

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0. Spike** (this PR) | `JovieMac` target builds and launches, platform passkey code path, fixture Ovie home, `webcredentials` in AASA, CI build + unit tests | Target builds and tests in CI. The passkey request reaches ASAuthorization. The portal items in section 8 are recorded. |
| **1. Foundations** | Signed dev build with Associated Domains. Real passkey sign-in on staging and production, with 1Password. Extract `JovieKit` package; rename `apps/ios` to `apps/apple`. PKCE fallback with `client=macos`. Native Ovie home on live metrics. | Tim signs in on production with a 1Password passkey. iOS and Mac both consume `JovieKit`; no duplicated shared file. |
| **2. Daily surfaces** | Native chat (streaming, tool cards, voice), inbox, calendar, library, audience. `MenuBarExtra`, notifications, App Intents. Registered bridges for the long tail. | Tim runs the native app side by side with Electron for a week, and every bridged route is in the register with an exit issue. |
| **3. Parity + distribution** | Sparkle channels (stable, staging, nightly), notarized releases, operator launch, capture, what's-new, window restore. | Every section 6 row is green. 7 consecutive days of daily use on Tim's Mac without falling back to Electron. |
| **4. Cutover + retire** | The final Electron release installs the native app and migrates the session through passkey re-sign-in. Delete `apps/desktop`, `desktop-release.yml`, and the Electron invariants. | Zero active Electron installs on the stable channel for 14 days, then `apps/desktop` is removed. |

## 8. Apple portal items (for the team lead with Tim)

1. **App ID `ie.jov.Jovie`:** enable the **Associated Domains** capability.
   macOS apps share the iOS App ID.
2. **Register Tim's Mac** as a device (Provisioning UDID from
   `system_profiler SPHardwareDataType`) for a **Mac Development** profile.
3. **Profiles:** create "Mac Development" for `ie.jov.Jovie` with Associated
   Domains, and later "Developer ID" for `ie.jov.Jovie` with Associated
   Domains. The Developer ID profile is the same kind mac-auth is blocked on
   for `app.jov.ie`, so request both in one portal session.
4. **Certificates:** Apple Development (present, `VRDHG4M7VN`) and Developer ID
   Application (present, `G24T327LXT`). None missing.
5. **AASA:** `webcredentials.apps: ["G24T327LXT.ie.jov.Jovie"]` ships in this
   PR (`apps/web/lib/ios/apple-app-site-association.ts`). Before this PR,
   jov.ie and staging.jov.ie served `applinks` only. Apple's CDN caches the
   file, so a development build can use `webcredentials:jov.ie?mode=developer`
   to skip the cache.
6. **Entitlements** (`apps/ios/JovieMac/JovieMac.entitlements`):
   `com.apple.developer.associated-domains = [webcredentials:jov.ie,
   webcredentials:staging.jov.ie]`, `com.apple.security.app-sandbox`,
   `com.apple.security.network.client`.

## 9. In-flight Electron work

Keep it and finish it. Electron is still the shipped Mac app.

- **mac-auth (Touch ID/passkey return code):** finish it. It unblocks admin
  step-up today, and its server contract (Better Auth passkeys) is the one the
  native app uses. The Developer ID provisioning profile it needs goes in the
  same portal session as section 8.
- **Auto-update, what's-new:** finish them. They keep Electron users current
  until cutover. In Phase 4 they carry the final "install native Jovie"
  release.
- **Independent Ovie (JOV-6026, `JovieInc/ovie`):** the 2026-09-23 decision
  to extract Ovie from the Electron product still stands as the bridge. Its
  end state is the native app: Ovie is a surface (window or `MenuBarExtra`) of
  the Swift Mac app, not a second native product.
- **New Electron features:** only bug fixes, security fixes, and work that
  unblocks the native plan. New product surfaces land native.

Bridge register (WKWebView, time-boxed): *empty*. Add rows as
`route | reason | Linear issue | exit date`.

## 10. Spike evidence (2026-09-27, local)

- `xcodebuild build` and `test` for `JovieMac` on macOS 26 / Xcode 26.6:
  **build succeeded, 10/10 unit tests passed**. The iOS `Jovie` scheme still
  builds after the shared-theme refactor.
- Fixture launch (`-jovie-mac-fixture-home`): native Ovie home rendered with
  `JovieTheme` tokens and Inter. This is labeled fixture evidence, not
  authenticated.
- Staging launch (`JOVIE_MAC_BASE_URL=https://staging.jov.ie`): the options
  request succeeded against live staging (`rpId: staging.jov.ie`). macOS then
  refused the assertion with `ASAuthorizationError 1004`: "The calling process
  does not have an application identifier." The unsigned build has no
  application identifier or Associated Domains entitlement. **A real passkey
  sign-in, with or without 1Password, is not proven yet.** It is blocked on
  section 8 items 1 to 3 plus the AASA deploy.
- Production `/api/auth/passkey/*` returned 404 at spike time (#18574 merged
  but not yet deployed to production). Staging serves it.

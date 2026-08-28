# Mac stack and Swift-control invariants (JOV-5359)

Investigate-only receipt. This is not a Swift rewrite, not a second HUD, and
not an adoption of executable invariants.

- **Current bottleneck:** Agents treat Mac as a Swift rewrite candidate and
  remock atoms, invent a second HUD, or demand full native suites to land UI.
- **Evidence:** source below; gbrain Mac-stack search/recall returned no pages
  (`gbrain-unavailable`).
- **Success metric:** the next Mac/iOS Swift change follows the four proposed
  slugs instead of starting a parallel product shell.
- **Expected improvement:** stop duplicate Swift HUD/atom work without changing
  the shipped Mac stack.

## Current Mac stack

There is no Swift or WKWebView Mac product app in this checkout.

| Role | Stack | Path | Renderer |
| --- | --- | --- | --- |
| Packaged Mac product / Ovie door | Electron `BrowserWindow` loading hosted Jovie | `apps/desktop` | Chromium, not WKWebView |
| Packaged Mac Ops HUD | One `/hud?ovie=mac` presentation of the web Ops screen | `apps/desktop/src/ovie-door.ts`; `apps/web/lib/ovie/ops-entrypoint.ts` | Web HUD inside Electron |
| Electron menu-bar tray | Electron `Tray` (chat/unread/error) | `apps/desktop/src/tray.ts` | Native Electron tray |
| macOS Swift target | Menu-bar shipping accessory only | `apps/macos/MenuMonitor` | SwiftUI `MenuBarExtra`, no webview |
| iOS product app | Native SwiftUI | `apps/ios` | Native views |
| iOS WKWebView | Public-profile browser only | `apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift` | Host-allowlisted `WKWebView` |
| iOS auth | System browser session | `ASWebAuthenticationSession` in `MobileAuthCoordinator.swift` | Not a product webview shell |

UI ownership already names the Mac product platform `macos-electron`
(`apps/web/data/designSystem/uiOwnershipRegistry.ts`). Combined-head CI treats
MenuMonitor as a path-selected SwiftPM job, not as the Mac product suite.

## Transition plan

**None.** Standalone Swift Ovie is deprecated, not mid-migration.

- Founder direction (2026-07) retired `JovieInc/ovie` as the Mac product: the
  Swift repo is a launcher-only archive, and `/hud` is the canonical Ops
  surface. Receipts: [`docs/OVIE.md`](../OVIE.md), GitHub
  [#12894](https://github.com/JovieInc/Jovie/issues/12894),
  [JOV-3854](https://linear.app/jovie/issue/JOV-3854).
- The current program (`docs/OVIE_PROGRAM.md`, JOV-5214) is packaged Electron
  Ovie plus the web HUD. M1 is dogfood of that door, not a Swift rewrite.
- `apps/macos/MenuMonitor` is a later operator shipping monitor (JOV-3593). It
  is not the successor to `JovieInc/ovie` and is not an iOS-parity Mac app.

Do not revive `JovieInc/ovie`, add a Mac WKWebView shell, or treat MenuMonitor
as the Mac product.

## Reliability holes

1. **Swift-rewrite default.** Agents see `apps/macos/` and iOS SwiftUI and
   start a Mac product rewrite even though the shipped Mac shell is Electron.
2. **Inventory wording drift.** The native UI registry called MenuMonitor the
   “one macOS product target,” which hides `apps/desktop`.
3. **Two menu bars.** Electron has a product tray; MenuMonitor is a separate
   operator accessory. Merging them into one Swift HUD is a second product.
4. **WKWebView precedent.** iOS uses WKWebView only for public-profile
   browsing. That is not permission to host `/hud` or chat in a Mac webview.
5. **Atom remocking.** iOS owns tokens in `JovieTheme.swift`; MenuMonitor uses
   system menu chrome and has no Jovie token layer. Copying iOS atoms onto Mac
   recreates the drift JOV-3854 killed.
6. **Full-suite tax.** Merge-group iOS Xcode and MenuMonitor SwiftPM jobs are
   path-selected. Requiring device, TestFlight, or full E2E suites to land a
   Swift UI change is not the current gate.

## Proposed reviewed invariants

These slugs are **proposed**, not adopted. They are not in
`canon/invariants.jsonl`. Adoption still needs founder approval plus a
production consumer and a deliberate-red test
([JOV-INV-004](../../canon/invariants.jsonl)). Candidate follow-up:
[JOV-5361](https://linear.app/jovie/issue/JOV-5361).

| Slug | Title | One-sentence rule |
| --- | --- | --- |
| `JOV-INV-012` | Mac product shell is Electron, not Swift | Packaged Mac Ovie is `apps/desktop` Chromium `BrowserWindow` loading hosted `/hud?ovie=mac`; do not start a Swift or WKWebView Mac product shell or revive `JovieInc/ovie`. |
| `JOV-INV-013` | MenuMonitor is operator-only, not a second HUD | `apps/macos/MenuMonitor` stays a menu-bar shipping accessory; do not expand it into product UI, Ovie HUD, or iOS-parity SwiftUI. |
| `JOV-INV-014` | Swift extends existing owners; do not remock atoms | iOS Swift extends `JovieTheme` and existing organisms; Mac Swift stays inside MenuMonitor presentation owners; do not invent a parallel token or atom family. |
| `JOV-INV-015` | Path-selected native suites land Swift UI | iOS and Mac Swift UI land with the existing path-selected lint/unit/MenuMonitor gates; do not require full Xcode, device, or E2E suites as a merge condition for a UI change. |

Agent-facing copy: [`.claude/rules/macos.md`](../../.claude/rules/macos.md).
Stack assertions: `scripts/invariants/macos-swift-control.test.mjs`.

# Mac (Electron product + Swift MenuMonitor)

Read this before touching `apps/desktop`, `apps/macos`, or any proposed Mac
Swift/WKWebView shell. Detail and evidence:
[`docs/macos/swift-control-invariants.md`](../../docs/macos/swift-control-invariants.md).

The Mac product is **Electron**, not Swift. iOS SwiftUI is not a Mac rewrite
template. Standalone Swift Ovie (`JovieInc/ovie`) is deprecated (JOV-3854).

## Current stack

| Surface | Owner | Not |
| --- | --- | --- |
| Packaged Mac / Ovie door | `apps/desktop` Electron `BrowserWindow` | Swift app, WKWebView product shell |
| Ops HUD | hosted `/hud?ovie=mac` | A second native HUD |
| Operator shipping menu | `apps/macos/MenuMonitor` SwiftUI `MenuBarExtra` | Product UI, iOS-parity SwiftUI |
| iOS WKWebView | public-profile browser only | Precedent for a Mac webview shell |

## Proposed Swift-control invariants (JOV-5359)

Proposed slugs, not adopted into `canon/invariants.jsonl`:

| Slug | Rule |
| --- | --- |
| `JOV-INV-012` | Packaged Mac Ovie is `apps/desktop` Chromium `BrowserWindow` loading hosted `/hud?ovie=mac`; do not start a Swift or WKWebView Mac product shell or revive `JovieInc/ovie`. |
| `JOV-INV-013` | `apps/macos/MenuMonitor` stays a menu-bar shipping accessory; do not expand it into product UI, Ovie HUD, or iOS-parity SwiftUI. |
| `JOV-INV-014` | iOS Swift extends `JovieTheme` and existing organisms; Mac Swift stays inside MenuMonitor presentation owners; do not invent a parallel token or atom family. |
| `JOV-INV-015` | iOS and Mac Swift UI land with the existing path-selected lint/unit/MenuMonitor gates; do not require full Xcode, device, or E2E suites as a merge condition for a UI change. |

## Do not

- Rewrite Mac Ovie or the artist app in Swift.
- Host `/hud`, `/app/ov/chat`, or `/app/chat` in WKWebView.
- Add a second macOS Swift target or Xcode Mac app.
- Copy iOS atoms, themes, or shells onto MenuMonitor.
- Treat MenuMonitor CI as a reason to run full iOS device or E2E suites.

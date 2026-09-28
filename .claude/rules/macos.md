---
paths: ["apps/desktop/**", "apps/macos/**", "apps/ios/JovieMac/**", "docs/macos/**"]
---

# Mac (Swift-native target, Electron until parity, MenuMonitor)

Read this before touching `apps/desktop`, `apps/macos`, `apps/ios/JovieMac`, or
any Mac Swift/WKWebView code. Direction and phases:
[`docs/macos/ADR-swift-native-mac.md`](../../docs/macos/ADR-swift-native-mac.md)
(EVENT 2026-09-27, supersedes the Electron-only ADR). Control slugs:
[`docs/macos/swift-control-invariants.md`](../../docs/macos/swift-control-invariants.md).

The Mac app is going **Swift-native**, and it shares one SwiftUI codebase with
iOS. Electron (`apps/desktop`) stays the shipped Mac app until the native app
passes the ADR parity checklist.

## Current stack

| Surface | Owner | Not |
| --- | --- | --- |
| Native Mac app (spike, pre-parity) | `apps/ios/JovieMac` target in `apps/ios/JovieMac.xcodeproj`, sharing iOS sources | A separate repo, Catalyst, or a second Mac Swift app |
| Shipped Mac app / Ovie door | `apps/desktop` Electron, until Phase 4 cutover | Target for new product surfaces |
| Operator shipping menu | `apps/macos/MenuMonitor` `MenuBarExtra` | Product UI |
| WKWebView | Registered, time-boxed bridges only (ADR bridge register) | A permanent product shell |

## Do

- Build new Mac product surfaces native in `JovieMac`, reusing iOS shared code
  (`JovieTheme`, `APIClient`, models, `NativeSessionTokenStore`).
- Keep shared files Foundation/SwiftUI-only. Put UIKit/AppKit in platform
  shells. Add a shared file to `apps/ios/scripts/generate-mac-project.rb` and
  regenerate. Do not hand-edit `JovieMac.xcodeproj`.
- Authenticate with platform passkeys (`ASAuthorizationPlatformPublicKeyCredentialProvider`)
  against Better Auth, with the PKCE browser flow as fallback.
- Finish in-flight Electron auth, update, and what's-new work. After that,
  Electron takes bug and security fixes only.

## Do not

- Add a parallel Mac token, atom, or font family. `JovieTheme` is the one
  source for both platforms.
- Host a product surface in WKWebView without a bridge-register row and an
  exit issue.
- Start another Mac Swift app, revive `JovieInc/ovie` as Swift, or grow
  MenuMonitor into product UI.
- Require device or full E2E suites to land Swift UI. The path-selected lint
  and unit gates apply (`JOV-INV-016`).

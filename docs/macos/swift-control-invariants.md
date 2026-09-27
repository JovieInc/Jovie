# Mac stack and Swift-control invariants

Routing receipt for Mac/iOS Swift work. The direction is
[`ADR-swift-native-mac.md`](ADR-swift-native-mac.md) (EVENT: Tim, 2026-09-27):
the Mac app goes Swift-native and shares one SwiftUI codebase with iOS. That
ADR supersedes the 2026-08-28 Electron-only investigation (JOV-5359,
[`docs/MACOS_SWIFT_CONTROL_ADR.md`](../MACOS_SWIFT_CONTROL_ADR.md)).

## Current Mac stack

| Role | Stack | Path |
| --- | --- | --- |
| Native Mac app (spike, pre-parity) | SwiftUI `JovieMac` target sharing iOS sources | `apps/ios/JovieMac`, `apps/ios/JovieMac.xcodeproj` |
| Shipped Mac app / Ovie door, until cutover | Electron `BrowserWindow` loading hosted `/hud?ovie=mac` | `apps/desktop` |
| Operator shipping menu | SwiftUI `MenuBarExtra` | `apps/macos/MenuMonitor` |
| iOS product app | Native SwiftUI | `apps/ios/Jovie` |
| iOS WKWebView | Public-profile browser only | `apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift` |

## Transition plan

**Swift-native, phased.** Phase 0 is the spike, Phase 1 foundations
(passkeys, `JovieKit`), Phase 2 daily surfaces, Phase 3 parity and
distribution, and Phase 4 cutover and Electron retirement. Exit criteria are
in the ADR. Electron keeps shipping until Phase 4.

## Proposed reviewed invariants

These slugs are **proposed**, not adopted, and are not in
`canon/invariants.jsonl`. Adoption still needs a production consumer and a
deliberate-red test ([JOV-INV-004](../../canon/invariants.jsonl)).

| Slug | Status | One-sentence rule |
| --- | --- | --- |
| `JOV-INV-013` | **Superseded** 2026-09-27 by the ADR | Formerly "the Mac product shell is Electron, not Swift". Replacement rule: there is one native Mac app, the `JovieMac` target sharing iOS source, and WKWebView appears only as a registered, time-boxed bridge. |
| `JOV-INV-014` | Proposed | `apps/macos/MenuMonitor` stays an operator shipping accessory. It does not become product UI or a second Ovie HUD. Product menu-bar presence belongs to `JovieMac`. |
| `JOV-INV-015` | Proposed (amended) | iOS and Mac Swift extend the one `JovieTheme` and shared organisms. There is no parallel Mac token, font, or atom family. |
| `JOV-INV-016` | Proposed | iOS and Mac Swift UI land with the path-selected lint/unit gates (including the `JovieMac` build + unit job). Full Xcode device or E2E suites are not a merge condition for a UI change. |

Agent-facing copy: [`.claude/rules/macos.md`](../../.claude/rules/macos.md).
Stack assertions: `scripts/invariants/macos-swift-control.test.mjs`.

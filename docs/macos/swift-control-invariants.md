# Mac stack and Swift-control invariants

Routing receipt for Mac/iOS work. The accepted direction is the
[native Mac ADR](ADR-swift-native-mac.md), extracted from
[#18958](https://github.com/JovieInc/Jovie/pull/18958) and refined by the
2026-10-02 Mac audit. The [2026-08-28 investigation](../MACOS_SWIFT_CONTROL_ADR.md)
remains historical evidence; its Electron-only prohibition is superseded.

## Current Mac stack

| Role | Current source owner | Evidence limit |
| --- | --- | --- |
| Shipped Mac product / Ovie door | `apps/desktop` Electron `BrowserWindow`; hosted `/app/chat` and `/hud?ovie=mac` | Source ownership, not a packaged runtime receipt. |
| Product menu-bar tray | `apps/desktop/src/tray.ts` | Electron tray, separate from MenuMonitor. |
| Operator shipping menu | `apps/macos/MenuMonitor` SwiftUI `MenuBarExtra` | Accessory, not the native product app. |
| iOS product and reusable client behavior | `apps/ios/Jovie` | Existing native implementation; desktop feature parity is unproven. |
| iOS web preview | `PublicProfileBrowserView.swift` | Existing host-allowlisted WKWebView; not a hosted-chat precedent. |

The native development target is `apps/ios/JovieMac.xcodeproj`, using the existing
`JovieKit` package and canonical `JovieTheme`. Its distinct Development identity
defaults to unavailable; only Debug accepts `--jovie-development-fixture` for
immutable, read-only content. Release excludes that fixture. Required unsigned
Mac Debug/Release tests cover this boundary and bundled Inter font resolution;
they do not establish authentication, distribution or installed performance.
The scaffold is a bounded extraction from Tim White's #18958 (`3dde45bbe4d5`,
co-authored with Claude Opus 5.5). JOV-7528 owns this source slice; JOV-6750,
JOV-6754, JOV-6748 and JOV-6759 retain shared-client, parity and release acceptance.
The deprecated standalone Swift Ovie implementation
stays read-only by policy. Do not grow MenuMonitor into a second product shell.

## Transition plan

**Swift-native, phased.** Ship the targeted Electron fixes first, extract shared
iOS client behavior, then prove the complete native chat path. Use on-demand web
bridges only with registered owners and exits. Keep Electron shipped until native
parity, signing/notarization, updates, migration, and rollback are demonstrated.
The ADR owns the sequence and acceptance; this receipt does not claim runtime
speed, native authentication, or release readiness.

## Proposed reviewed invariants

These slugs are **proposed**, not adopted into `canon/invariants.jsonl`.
Registry adoption still needs a production consumer and a deliberate-red test
under `JOV-INV-004`; broader adoption remains [JOV-6760](https://linear.app/jovie/issue/JOV-6760).

| Slug | Status | Boundary |
| --- | --- | --- |
| `JOV-INV-013` | **Superseded** Electron-only prohibition | Replacement direction: one native Mac product on shared iOS foundations; Electron remains shipped until accepted cutover. |
| `JOV-INV-014` | Proposed | MenuMonitor remains an operator shipping accessory, not product UI. |
| `JOV-INV-015` | Proposed, amended | iOS and Mac reuse existing Swift client/design owners, including `JovieTheme`; no parallel Mac token/atom family. |
| `JOV-INV-016` | Proposed, clarified | Source changes use path-selected lint/unit/build gates. Runtime/parity/signing claims require separate release evidence. |

Agent routing: [macOS rule](../../.claude/rules/macos.md).
Current-source assertions: `scripts/invariants/macos-swift-control.test.mjs`.
They guard shipped ownership and accessory boundaries; they do not build or
certify native runtime acceptance; the required native CI job tests the development target.

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
immutable, read-only content or `--jovie-development-composer` for local editing.
Release excludes both development modes. Required unsigned
Mac Debug/Release tests cover this boundary and bundled Inter font resolution;
they do not establish authentication, distribution or installed performance.
The scaffold is a bounded extraction from Tim White's #18958 (`3dde45bbe4d5`,
co-authored with Claude Opus 5.5). JOV-7528 owns this source slice; JOV-6750,
JOV-6754, JOV-6748 and JOV-6759 retain shared-client, parity and release acceptance.
The deprecated standalone Swift Ovie implementation
stays read-only by policy. Do not grow MenuMonitor into a second product shell.

### Local editor boundary (JOV-7571)

The explicit composer exercise contains one persistent AppKit plain-text editor.
Its draft lives only in that mounted view: it is not saved or sent. Typing, Enter
for a newline, selection, paste and undo/redo use native text-system behavior.
There is no authentication, transport, assistant response or conversation owner.
The existing read-only fixture is unchanged. If both Debug arguments are supplied,
the local composer takes precedence; neither argument enables a Release surface.

The editor reserves the same frame for empty, typed and marked text, and for
focused/unfocused states. Pointer/keyboard editing and the visible **Focus draft**
button are the direct actions; the native text accessibility role exposes the
draft. No custom global shortcut or motion is added.

Unrelated host updates keep the native view, selection, scroll, undo and focus.
An explicit focus request is consumed once after successful window attachment;
later renders do not steal focus from another control. Equal text is never
written back into the native text storage. A genuine external replacement outside
composition clamps selection in UTF-16 coordinates and clears only this editor's
undo stack. During marked-text composition, AppKit wins: conflicting external
replacement is discarded, not queued. Commit or unmark reconciles the current
binding, so an old replacement cannot reappear after composition.

Native Debug/Release tests exercise local editing contracts. Physical input
methods, VoiceOver and installed-Mac performance remain separate acceptance;
source or app-hosted tests do not establish live native chat parity.

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

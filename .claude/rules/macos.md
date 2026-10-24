---
paths: ["apps/desktop/**", "apps/macos/**", "apps/ios/JovieMac/**", "apps/ios/JovieMac.xcodeproj/**", "apps/ios/Packages/JovieKit/**", "docs/macos/**"]
---

# Mac (native direction, Electron shipped until parity)

Read this before Mac or shared Swift work. The accepted direction and exit
criteria are in [the native Mac ADR](../../docs/macos/ADR-swift-native-mac.md).
The [stack receipt](../../docs/macos/swift-control-invariants.md) distinguishes
current owners from planned targets. The [earlier Electron-only ADR](../../docs/MACOS_SWIFT_CONTROL_ADR.md)
is historical; its rewrite prohibition is superseded.

## Mac app platform

All Mac app work defaults to SwiftUI. Do not add new Electron, AppKit-only, or other non-SwiftUI Mac surfaces unless Tim explicitly overrides this for that task. The long-term goal is a fully SwiftUI Mac app.

- New native Mac surfaces go in `apps/macos` (for example `apps/macos/MenuMonitor`). MenuMonitor stays an operator accessory: do not fold product UI into it.
- `apps/desktop` (Electron) is maintenance-only: fixes and migrations out, not new surfaces.
- Production runs full screen on an ultrawide monitor. That view, Ovie, is where Tim works, and anything that needs his attention lands there. Design and test Mac layouts at ultrawide full screen first.
- The IA of that full-screen surface is a perpetual work item: keep improving it and keep refining the components inside it.
- A perpetual design loop, not a one-time audit, covers the Ovie surface. It reviews the production surface's IA, components and visual design and proposes improvements. It runs on a deterministic gem schedule, not on Grok Bot usage, and has a dead-man check. Findings go to `pipeline-bottleneck/v1`, and design debt is tracked as Linear work items.

The stack table below is the current-owner receipt. It does not authorize a new Electron or AppKit-only surface, and this loop does not revive the deprecated standalone Swift Ovie implementation. Native parity is still uncertified; the accepted ADR owns cutover.

## Current stack and target

| Surface | Current owner | Direction |
| --- | --- | --- |
| Shipped Mac app / Ovie door | `apps/desktop` Electron `BrowserWindow` | Maintenance only until a tested native cutover: fixes and migrations out, not new surfaces. |
| Native Mac development | `apps/ios/JovieMac` sibling target with explicit Debug fixtures; default and Release unavailable | Live SwiftUI/AppKit product and native chat remain planned on shared iOS client behavior. |
| Shared Swift core | Existing iOS clients/models/repositories | Extract into `apps/ios/Packages/JovieKit` in consumed, tested slices. |
| Operator shipping menu | `apps/macos/MenuMonitor` `MenuBarExtra` | Accessory only; no second product HUD. |
| Occasional complex web screens | Existing web surfaces | Isolated, registered, on-demand WebKit bridges. |

## Delivery rules

- Ship the high-value Electron navigation, streaming, lifecycle, and measurement
  fixes first. Keep auth, security, and update work shipping during migration.
- Reuse iOS transport, models, cache, and conversation state. Build one native
  Mac chat path: cached launch, type, send, stream, cancel/retry, switch, sleep/wake.
  A native sidebar around hosted chat does not satisfy that path.
- Share client contracts and `JovieTheme`; platform shells may differ. Keep
  UIKit/AppKit behind platform interfaces. Do not invent a second backend,
  action-policy implementation, token family, or product app repository.
- Session work outlives views. Hidden UI may pause visual activity without
  interrupting streams, uploads, or pending actions; reconcile on return.
- Preserve native auth flow binding, PKCE, cancellation, replay protection,
  secure session storage, and recovery. A fixture or unsigned prototype does
  not establish authenticated behavior.
- Register each on-demand WebKit surface with route, owner, boundary, exit issue,
  and review date. Do not host the entire daily chat workflow in a webview.
- Retire Electron only after native parity, production signing/notarization,
  updates, session migration, and rollback are demonstrated. Follow path-selected
  tests for source changes; native release acceptance still requires real Mac
  evidence. Never report source checks as installed-app proof.

## Proposed control slugs

These remain proposed, not adopted into `canon/invariants.jsonl`:

| Slug | Status and boundary |
| --- | --- |
| `JOV-INV-013` | The former Electron-only prohibition is superseded. Target one native Mac product on shared iOS foundations; keep Electron shipped until cutover. |
| `JOV-INV-014` | MenuMonitor stays an operator accessory, not a second product HUD. |
| `JOV-INV-015` | Shared Swift extends existing design-system and client owners; no parallel Mac token/atom family. |
| `JOV-INV-016` | Source changes use path-selected lint/unit/build gates; signing, parity, and runtime claims require their own release evidence. |

Do not revive the deprecated standalone Swift Ovie implementation, fold product UI
into MenuMonitor, or treat the development target as a qualified live product.

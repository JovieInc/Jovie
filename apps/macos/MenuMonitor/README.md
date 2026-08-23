# MenuMonitor

macOS menu bar app for live shipping counts + Hermes gateway controls (JOV-3593).

## Behavior

- Menu bar icon (shipping box SF Symbol) with badge = in-progress kanban cards
- Menu bar label distinguishes initial refresh, fresh counts, action progress, and unavailable/stale status for VoiceOver; it uses `…` for a running action and `!` when the latest refresh failed
- Polls every 30s via `hermes kanban --board jovie-product list --json`
- Fails closed with an explicit stale/error state if Linear-backed Symphony status is unavailable; GitHub Issues never supply backlog counts
- Menu actions: restart gateway, restart daemons, status check, open Linear, refresh, quit
- Native action progress/completion feedback and command output remain visible in the menu; running action feedback also reaches the status item after the menu closes

## Build

Requires macOS 14+ and Xcode / Swift 5.10+.

```bash
cd apps/macos/MenuMonitor
swift build -c release
# binary: .build/release/MenuMonitor
open .build/release/MenuMonitor   # or copy to /Applications
```

## Test and coverage

Run from the repository root:

```bash
swift test --package-path apps/macos/MenuMonitor --enable-code-coverage
swift build --package-path apps/macos/MenuMonitor -c release
```

The same commands run on path-selected merge-group heads before admission.

## Run at login (optional)

```bash
# After release build:
cp .build/release/MenuMonitor /Applications/MenuMonitor.app/Contents/MacOS/  # if wrapped
# Or: use a simple LaunchAgent pointing at the binary
```

## Notes

- Pure SwiftUI `MenuBarExtra` — no Electron, no webview
- Idle footprint should stay well under 50MB
- Sleep/wake: `Task.sleep` loop resumes after wake and re-polls

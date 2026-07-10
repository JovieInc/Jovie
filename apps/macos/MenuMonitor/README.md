# MenuMonitor

macOS menu bar app for live shipping counts + Hermes gateway controls (JOV-3593).

## Behavior

- Menu bar icon (shipping box SF Symbol) with badge = in-progress kanban cards
- Polls every 30s via `hermes kanban --board jovie-product list --json`
- Falls back to `gh issue list … --label status:in-progress` if kanban fails
- Menu actions: restart gateway, restart daemons, status check, open Linear, quit

## Build

Requires macOS 14+ and Xcode / Swift 5.10+.

```bash
cd apps/macos/MenuMonitor
swift build -c release
# binary: .build/release/MenuMonitor
open .build/release/MenuMonitor   # or copy to /Applications
```

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

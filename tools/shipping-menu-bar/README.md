# Shipping Menu Bar

A lightweight macOS menu bar app that shows the status of the Jovie autonomous issue shipper and lets you control it.

## What it shows

- **Status dot** (green/yellow/red/gray) — running, paused, erroring, or idle
- **Dispatchable issues** count
- **Issues in progress**
- **Capacity** — allowed agents, free memory, load/cpu
- **Last run** time + result (empty queue / throttled / dry run / etc.)
- **Current agents** — branch names and issue numbers
- **Last error** (if any)

## Controls

- **Pause shipping** — writes `~/.hermes/shipping-paused` sentinel file (the shipper checks this and exits early)
- **Resume shipping** — removes the sentinel
- **Restart now** — `launchctl kickstart -k` the shipper LaunchAgent
- **Refresh** — re-read the log immediately

## Build & run

Requires macOS 13+ and Xcode command-line tools.

```bash
cd tools/shipping-menu-bar
swift build
swift run
```

Or build a release binary:

```bash
swift build -c release
cp .build/release/ShippingMenuBar ~/bin/
```

The app polls `~/.hermes/logs/jobs.jsonl` every 15 seconds and checks `launchctl print` for the shipper's active state.

## Shipper integration

The shipper (`scripts/hermes/jobs/codex-issue-shipper.ts`) checks for the pause sentinel at the top of each run. If `~/.hermes/shipping-paused` exists, it logs a `paused_skip` event and exits cleanly without scanning or dispatching.

## Menu layout

```
● Shipper: Running
──────────────────
  Dispatchable issues    5
  In progress            2
  Capacity               3/10
  Free memory            519 MB
  Load/cpu               0.89
──────────────────
  Last run               12:47:22 PM
  Result                 Dry run planned
──────────────────
  Current agents
    #12342 → codex/gh-12342-typeerror-...
    #12340 → codex/gh-12340-anonymous-...
──────────────────
  [Pause shipping]
  [Restart now]
  [Refresh]
──────────────────
  [Quit]
```

---
paths: ["docs/HERMES_AIR.md"]
---

# Mac lane

The MacBook Air (`tims-macbook-air`) is the fleet's Mac lane. Hermes was retired as Summer's runtime on 2026-09-05. The gateway stays unloaded. This file is the contract. `docs/HERMES_AIR.md` is a pointer, not a runbook.

## What it does

- Self-hosted Actions runner `tims-macbook-air` (labels `self-hosted, macOS, ARM64, jovie-mac, jovie-mac-tims-macbook-air`). It runs only `mac-lane.yml` child runs: the iOS fast gate and the Mac build that merge groups and main pushes try on an idle Mac first. A Mac that does not pick one up within 45s, or dies mid-run, hands the lane to hosted macOS. `JOVIE_MAC_RUNNER=off` forces hosted. Release regressions never run here. See `.claude/rules/infra.md`.
- Nightly Mac dogfood verifier: a local launchd job running a headless Claude Code session on a clean `origin/main` worktree. It exercises the iOS simulator build, the macOS apps, and read-only production web. It files at most three `mac-dogfood` Linear issues per night and never edits, commits, pushes, or merges.
- gbrain client only. The Air uses the ops Mac server over Tailscale with its own bearer token. It runs no gbrain server against the shared database.

## What it does not do

- It does not author code from an unattended job.
- It does not dispatch GitHub issues. The GitHub AI dispatcher and the Pro Codex issue shipper are retired.
- It does not orchestrate JOV work. Symphony lanes claim that work (`scripts/lanes/README.md`).
- It does not start the retired Hermes gateway, voice watcher, or learning sweep. Those steps are git history. Do not restore them.
- The Hermes config directory may still hold credentials and a gbrain worker that was left running on 2026-09-02. That directory is not a runtime to start.

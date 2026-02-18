---
description: Start autopilot lead orchestration by applying the canonical Agent Teams skill.
tags: [autopilot, agent-teams, linear, orchestration]
---

# /autopilot

Apply the canonical skill:

- `.claude/skills/autopilot.md`

## Command Intent

Use this command to start or resume Agent Teams lead orchestration for Jovie.

## What this command should do

1. Load and follow `.claude/skills/autopilot.md` as the source of truth.
2. Run the orchestration loop exactly as defined in that skill.
3. Keep Linear, task queue, and PR state synchronized until stopped.

## Stop controls

Honor operator control commands:

- `pause orchestration`
- `resume orchestration`
- `drain and stop`
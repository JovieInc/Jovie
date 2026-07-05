# Fable 5 + Haiku Pipeline

## Problem
Code-review and PR-creation tasks required expensive model usage (~$15/task on Opus 4.8, 10+ min per PR). Need cheaper, faster mechanical PR creation for well-specified tasks.

## Solution
Use hyperagent.com Developer agent with Fable 5 (main model) orchestrating Haiku 4.5 (subagent model). Fable 5 plans and delegates; Haiku executes mechanically.

**Pipeline cost: ~$0.50-1.00/task, ~2-4 min per PR** (30× cheaper than Opus)

## Architecture
- **Zoe (OpenClaw)**: Outer loop — reads issues, specs implementations, dispatches to hyperagent threads
- **Fable 5 (Orchestrator)**: Plans approach, updates thread context doc, dispatches Haiku subagent
- **Haiku 4.5 (Subagent)**: Clones repo, modifies files, uses GitHub MCP for push/PR

## Seed message pattern
- Narrow scope: Include exact file changes, components to create, and PR title
- Wider scope: Provide issue number + codebase context; Fable 5 researches then dispatches
- Always include "clone the repo first" — sandbox starts empty
- Always mention GitHub MCP fallback for git push

## Key lessons
- Sandbox isolation: Each thread gets a clean container. Must clone.
- Git/gh CLI may be unavailable — use GitHub MCP tools as fallback
- Haiku executes spec as-given — no research, no questions, no taste decisions

---
type: tool
title: Compound Engineering
source_uri: 'https://x.com/mvanhorn/status/2061877533885473181'
description: >-
  Claude Code plugin by Every (Dan Shipper's company). Core commands: /ce-plan
  (creates structured plan.md after researching codebase + best practices) and
  /ce-work (executes plan, optionally via Codex). Agentic planning workflow.
  Matt Van Horn is a top contributor.
source_kind: 'mcp:put_page'
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-03T04:27:12.743Z'
tags:
  - agentic
  - claude-code
  - dan-shipper
  - every
  - open-source
  - plan-first
---

# Compound Engineering

**Creator**: Every (every.to) — Dan Shipper's company
**Type**: Claude Code plugin
**Users**: Matt Van Horn (top contributor), AI-native builders

## Core Commands
- **`/ce-plan`** — Spins up research agents, studies codebase + past solutions + best practices, outputs structured `plan.md` with approach, files to change, acceptance criteria
- **`/ce-work`** — Executes the plan, optionally delegating to Codex via `--codex` flag
- **`/ce-review`** — Reviews work against plan

## Key Ideas
- Plan-first workflow: flip traditional 80% coding / 20% planning ratio
- Plans are for the **agent**, not the human. Write it, hand it off.
- Can be used for non-code work: strategy, specs, competitive analysis, docs
- Feed it PDFs, transcripts, screenshots for deeper context

## Connection to Tim/Jovie
- Exactly maps to Summer's Planner → Coder pipeline
- Dan Shipper (childhood friend) created the company behind it
- Could replace/augment Summer's planning phase
- Tim could use `/ce-plan` directly for Jovie ideas

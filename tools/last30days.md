---
type: tool
title: last30days
source_uri: 'https://x.com/mvanhorn/status/2061877533885473181'
description: >-
  OSS research tool by Matt Van Horn (26k+ stars). Scrapes Reddit, X, HN,
  YouTube for fresh community knowledge. Used to avoid stale training data when
  planning with AI agents.
source_kind: 'mcp:put_page'
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-03T04:18:36.366Z'
tags:
  - ai-agents
  - claude-code
  - mvanhorn
  - open-source
  - research
---

# last30days

**Creator**: Matt Van Horn (@mvanhorn)
**Stars**: 26k+
**Type**: Open-source research tool

## What It Does
Scrapes Reddit, X (Twitter), Hacker News, YouTube for fresh community knowledge from the last 30 days. Designed to be run before planning with AI agents to avoid stale training data.

## How Matt Uses It
Run `last30days` before `/ce-plan` to feed agents fresh, current community discussions rather than relying on training data that may be months out of date.

## Relevance to Jovie/Tim
- Could replace/augment web_search for Jovie feature ideation
- Useful for Summer's research workflows — pull fresh signals before planning
- Could feed into GBrain as a research source

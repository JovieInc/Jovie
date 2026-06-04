---
type: note
title: JovieInc Repository Map
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-29T18:34:58.424Z'
source_kind: 'mcp:put_page'
tags:
  - github
  - ops
  - repos
---

# JovieInc Repository Map

## Core Repos

| Repo | Visibility | Purpose | Notes |
|------|-----------|---------|-------|
| **JovieInc/Jovie** | Public | Core product (jovie-app) | Main repo, PR-only workflow |
| **JovieInc/Ops** | Private | Operations / agent configs | Summer's ops repos |

## Product Repos

| Repo | Visibility | Purpose |
|------|-----------|---------|
| **JovieInc/LogYourBody** | Public | LogYourBody product |

## Infrastructure Repos

| Repo | Visibility | Purpose |
|------|-----------|---------|
| **JovieInc/ios-certificates** | Private | iOS signing certificates (fastlane match) |
| **JovieInc/retouching** | Private | Batch image retouching workflow |

## Other

| Repo | Visibility | Purpose |
|------|-----------|---------|
| **itstimwhite/Jovie** | Public | Tim's personal fork |

## Key Rules
- NEVER push to main — always branch + PR
- gbrain brain data: JovieInc/gbrain (private, Postgres-backed)
- Default branch: main
- All changes via PR with conventional commit messages

---
type: note
title: PR Auto-Fix Pipeline
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-29T18:07:37.801Z'
source_kind: 'mcp:put_page'
tags:
  - automation
  - ci
  - ops
  - pr
---

# PR Auto-Fix Pipeline

## Rules
- JovieInc/Jovie = canonical repo (never push to main)
- Always branch + PR
- Stale PRs (>1 day inactive) get auto-fixed and merged
- Bot + human review comments must be addressed before merge

## Stale PRs (2026-05-29)

### #9787 - Cache tag sanitization (fix/sentry-7506404179)
- Status: DIRTY (merge conflict)
- Missing: unit tests for sanitizeCacheTag/sanitizeCacheTags, docstring coverage 80%
- Fix: rebase main, add tests, add docstrings

### #9782 - Back navigation + titlebar (feature/back-navigation-desktop-titlebar)
- Status: BLOCKED (merge conflict)
- Critical: forward button in -webkit-app-region:drag (non-clickable), BackNavigationContext never provided
- Missing: tests for context + titlebar
- Fix: rebase, add no-drag style, integrate context into layout, add tests

### #9723 - Promptfoo eval contracts (codex/jov-2597-chat-confirm-route)
- Status: DIRTY (merge conflict)
- Minor: commit message format, production import side-effect audit
- Fix: rebase, rename commit, audit imports

## Cron
- P0 Watch checks for stale PRs every 2h
- Auto-rebase, fix conflicts, address comments, re-run CI
- Merge on green + no blocking reviews

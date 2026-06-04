---
type: note
title: Kanban Pipeline Audit & Action Plan — 2026-05-29
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-29T03:01:29.274Z'
source_kind: 'mcp:put_page'
tags:
  - audit
  - kanban
  - linear
  - ops
  - planning
---

# Kanban Pipeline Audit & Action Plan — 2026-05-29

## Audit Findings

### 1. Model/Profile Routing (NEEDS TWEAK)
**Current:**
- Summer (default): openrouter/owl-alpha ✅ (changed from deepseek-v4-flash)
- Planner: deepseek/deepseek-v4-pro ✅ (20x cheaper than Opus)
- Coder: deepseek/deepseek-v4-flash ⚠️ (should be v4-pro for complex coding)
- Reviewer: deepseek/deepseek-v4-pro ✅
- Fundraising: deepseek/deepseek-v4-pro ✅
- Inbox-ops: google/gemini-2.5-flash-lite ✅
- Designer: google/gemini-3.1-pro-preview ✅
- Social-media-poster: anthropic/claude-sonnet-4 ⚠️ (overkill, use owl-alpha)

**Issues:**
- Coder profile uses v4-flash — complex coding tasks (auth, UI components) need v4-pro reasoning
- No "easy coder" profile for trivial tasks (v4-flash is fine for simple changes)
- social-media-poster burning claude-sonnet-4 on simple social posts
- No use of Minions (gbrain job queue) for durable parallel work

**Recommendation:**
- Split coder into `coder` (v4-pro) for complex tasks and `coder-flash` (v4-flash) for easy tasks
- Switch social-media-poster to owl-alpha
- Use delegate_task with role=leaf for simple parallel subagents (no Minions needed yet)
- Reserve Minions for long-running (>5min) or parallel (>3) tasks

### 2. Gbrain Usage (NEEDS IMPROVEMENT)
**Issues:**
- Sub-agents don't consistently query gbrain before burning tokens
- No "brain-first" enforcement in coder/planner profiles
- Planner agent didn't query gbrain before creating plan for test issue (burned ~470K tokens)

**Recommendation:**
- Add "brain-first" rule to ALL profile SOUL.md files
- Always query gbrain before web search or external API calls
- Write plan summaries back to gbrain after creation

### 3. Gstack Skills & QA (NOT BEING USED ENOUGH)
**Issues:**
- Test coverage on recent PRs is inconsistent — some PRs have 0 new tests
- No QA automation pipeline for UI changes
- Gstack browser testing skill exists but isn't integrated into PR workflow
- E2E tests exist (Playwright) but aren't required for UI PRs

**Recommendation:**
- Mandate: Every non-trivial PR must include tests covering the changed code paths
- Target: 80%+ test coverage for new code (unit + integration)
- UI PRs must include visual regression tests (gstack browser skill) or screenshots
- Auth PRs MUST include E2E tests (critical path)
- Create a "QA checklist" template for PRs

### 4. Test Coverage (BELOW TARGET)
**Recent merged PRs:**
- #9778 fix(auth): harden iOS auth test flow (+60/-5) — ✅ good test addition
- #9776 fix(ci): skip missing unit coverage uploads — ⚠️ coverage infrastructure issue
- #9769 JOV-2617: Printful merch (+1594/-108) — ❌ no test file in PR
- #9765 test(promptfoo): playlist generation (+647/-0) — ✅ pure test PR
- #9762 test(promptfoo): interview summarization (+344/-0) — ✅ pure test PR

**Issues:**
- Large PRs (1500+ lines) are being merged without tests
- Coverage infrastructure is fragile (upload failures)
- No coverage gating in CI

### 5. Linear Issues (NEEDS TRIAGE)
**Open Auth Issues (6):**
- JOV-2652 P1: Fix iOS auth configuration with Clerk — **READY TO SHIP**
- JOV-2653 P2: Automate Clerk config access (epic) — **NEEDS SCOPING**
- JOV-2651 P2: Fix Electron auth Open in Browser — **READY TO SHIP**
- JOV-2063 Duplicate: Clerk proxy errors — **CLOSE** (duplicate of 2061)
- JOV-2061 Canceled: Clerk proxy errors — **ALREADY CANCELED**
- JOV-2552 In Progress: Central auth routing — **CHECK STATUS**

**Open UI Issues (8):**
- JOV-2647 P3: Library grid spacing — **SMALL, SHIP**
- JOV-2646 P3: Task board overflow — **SMALL, SHIP**
- JOV-2645 P2: Keyboard nav for search — **MEDIUM, PLAN**
- JOV-2644 P2: Standardize search entry — **MEDIUM, PLAN**
- JOV-2643 P2: Library right rail card — **MEDIUM, PLAN**
- JOV-2639 P2: Shell scrolling sticky rail — **MEDIUM, PLAN**
- JOV-2638 P2: Shared AppShell right rail — **MEDIUM, FOUNDATION**

**Stale Issues to Close:**
- JOV-2063 (duplicate of JOV-2061 which is Canceled) → CLOSE
- JOV-2637 "Blocked 'connect' from 'vercel.com'" → INVESTIGATE (might be done)

**Suggested Reorder (working top → bottom):**
1. JOV-2638: Shared AppShell right rail (foundation for others)
2. JOV-2639: Shell scrolling sticky rail (depends on 2638)
3. JOV-2643: Library right rail card (depends on 2638)
4. JOV-2652: iOS auth fix (P1, independent)
5. JOV-2644: Standardize search entry
6. JOV-2645: Keyboard nav for search
7. JOV-2647/2646: Polish items (can batch)

## Action Plan

### Immediate (Today)
1. ✅ Fix Telegram gateway (done)
2. Create coder-flash profile (v4-flash for easy tasks)
3. Split coder into two profiles
4. Close JOV-2063 in Linear
5. Ship auth tasks: JOV-2652, JOV-2651
6. Ship UI tasks: JOV-2638 (foundation), then 2639, 2643

### This Week
7. Mandate test coverage for all PRs
8. Integrate gstack QA into PR workflow
9. Create PR QA checklist template
10. Start auto-closing stale Linear issues after Tim approval

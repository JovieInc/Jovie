---
type: concept
title: Hyperagent Orchestration Migration
created: '2026-06-03T00:00:00.000Z'
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-04T00:07:09.105Z'
source_kind: 'mcp:put_page'
tags:
  - hyperagent
  - june-2026
  - linear
  - migration
  - orchestration
  - plan
  - product-management
---

# HyperAgent Orchestration Migration Plan

## Vision

Replace Summer's code orchestration role with HyperAgent as the central Product Manager / Orchestrator. Summer becomes a router — dumping context into HyperAgent via Telegram, and HyperAgent owns the full lifecycle of Linear issues, sensory issues, test flight errors, and product feedback.

## Architecture

```
Tim White
    │
    ▼
Summer (Telegram ops channel)
    │
    ├──► HyperAgent (Telegram chat) ◄─── ALL orchestration
    │       │
    │       ├── Linear Issues (create, triage, assign)
    │       ├── Sensory Issues (bug reports, UX feedback)
    │       ├── TestFlight Errors (crash logs, beta feedback)
    │       ├── Product Feedback (user input, feature requests)
    │       └── Code Execution (via GitHub integration)
    │
    ├──► Ops Agent (infrastructure, crons, health)
    ├──► Madison (content universe)
    └──► Other agents as needed
```

## What Moves to HyperAgent

### Currently Summer-owned → HyperAgent-owned

| Function | Current (Summer) | Future (HyperAgent) |
|---|---|---|
| Linear issue creation & triage | Summer delegates to sub-agents | HyperAgent creates, triages, assigns issues |
| Sensory issue routing | Manual / ad-hoc | HyperAgent ingests from Telegram, creates Linear issues |
| TestFlight error triage | Not automated | HyperAgent monitors, creates issues, assigns priority |
| Product feedback synthesis | Manual | HyperAgent aggregates, synthesizes, creates action items |
| Code orchestration (plan → PR) | Summer → Planner → Coder → Reviewer | HyperAgent owns full loop via GitHub integration |
| Status reporting | Summer briefs Tim | HyperAgent reports to Tim via Telegram |

### What Summer Keeps

| Function | Reason |
|---|---|
| High-level priority decisions | Tim → Summer, not HyperAgent |
| Approval of outbound messages | Auth, billing, investor comms stay with Summer |
| Escalation for high-risk items | Human judgment calls |
| Agent spawning for non-code work | Ops, Madison, etc. remain under Summer |
| GBrain knowledge management | Summer owns institutional memory |

## HyperAgent Configuration

### Agent Identity
- **Name**: HyperAgent (or name TBD by Tim)
- **Model**: Claude Sonnet (routine) / Opus (complex triage)
- **Effort level**: Medium default, High for complex issues
- **Budget cap**: Set immediately (critical with $20K credits)

### Integrations Needed
1. **Telegram** — Primary input channel (Summer dumps context here)
2. **Linear** — Issue creation, triage, assignment
3. **GitHub** — PR creation, code review, CI status
4. **TestFlight** — Error/crash monitoring (via webhook or API)
5. **Google Sheets** — CRM / pipeline tracking
6. **Slack** — Team notifications (if applicable)

### Skills to Build
1. **Linear Triage Skill** — How to categorize, prioritize, and assign issues
2. **Sensory Issue Skill** — How to process UX/bug reports from Telegram
3. **TestFlight Monitor Skill** — How to parse crash logs and create actionable issues
4. **Product Feedback Skill** — How to synthesize user feedback into feature requests
5. **Code Orchestration Skill** — How to go from issue → plan → PR → review

### Memory / Knowledge
- Jovie repo structure and conventions
- Team roles and assignments
- Priority framework (P0/P1/P2)
- Definition of done for each issue type

## Trigger-Based Flow

### Flow 1: Sensory Issue / Bug Report
```
Tim or team sends bug report to HyperAgent Telegram
    → HyperAgent parses and categorizes
    → Creates Linear issue with priority
    → Assigns to appropriate engineer
    → Notifies via Telegram
    → Tracks to resolution
```

### Flow 2: TestFlight Error
```
TestFlight webhook → HyperAgent
    → HyperAgent parses crash log
    → Checks for duplicates in Linear
    → Creates or updates issue
    → Assigns priority based on frequency/severity
    → Notifies team
```

### Flow 3: Product Feedback
```
Feedback submitted (Telegram, email, form)
    → HyperAgent aggregates and synthesizes
    → Identifies patterns
    → Creates feature request issues in Linear
    → Weekly summary to Tim
```

### Flow 4: Code Orchestration
```
Linear issue created (by HyperAgent or human)
    → HyperAgent reads issue
    → Creates implementation plan
    → Opens GitHub PR via integration
    → Monitors CI
    → Requests review
    → Merges or iterates
```

## Migration Phases

### Phase 1: Setup (Week 1)
- [ ] Configure HyperAgent identity, model, budget caps
- [ ] Set up Telegram integration (dedicated chat)
- [ ] Set up Linear integration
- [ ] Set up GitHub integration
- [ ] Build Linear Triage Skill
- [ ] Build Sensory Issue Skill
- [ ] Test end-to-end with sample issues

### Phase 2: Sensory + TestFlight (Week 2)
- [ ] Route sensory issues through HyperAgent
- [ ] Set up TestFlight monitoring
- [ ] Build TestFlight Monitor Skill
- [ ] Validate issue creation quality
- [ ] Tune priority assignment

### Phase 3: Code Orchestration (Week 3-4)
- [ ] Build Code Orchestration Skill
- [ ] Test issue → PR pipeline
- [ ] Set up CI monitoring
- [ ] Validate PR quality
- [ ] Iterate on plan generation

### Phase 4: Full Handoff (Week 4+)
- [ ] Summer stops direct code orchestration
- [ ] All orchestration flows through HyperAgent
- [ ] Summer monitors HyperAgent performance
- [ ] Weekly review of HyperAgent decisions
- [ ] Adjust skills and rubrics based on feedback

## Cost Management

- **Budget caps**: Set per-agent and per-thread limits
- **Model selection**: Sonnet for routine triage, Opus for complex issues
- **Effort levels**: Medium default, High only for P0 issues
- **Weekly cost review**: Summer monitors burn rate
- **Alert threshold**: Notify Tim at 25%, 50%, 75% of $20K credits

## Success Metrics

| Metric | Target |
|---|---|
| Issue triage time | < 1 hour from report to Linear |
| TestFlight error → issue | < 4 hours |
| PR creation time | < 24 hours from issue assignment |
| Issue resolution time | Measurable improvement over baseline |
| Cost per issue | Track and optimize |
| False positive rate | < 10% (issues that get closed as invalid) |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| HyperAgent mis-prioritizes issues | Weekly review + rubric tuning |
| Cost overrun | Budget caps + weekly monitoring |
| Integration failures | Fallback to Summer manual orchestration |
| Quality degradation | Feedback loop — Tim reviews and corrects |
| Single point of failure | Summer can take over any function manually |

## Open Questions for Tim

1. **Name**: Keep "HyperAgent" or rename?
2. **Linear workspace**: Which workspace/project?
3. **TestFlight access**: How to connect (webhook, API, manual)?
4. **Feedback channels**: Where does product feedback currently live?
5. **Escalation path**: When should HyperAgent escalate to Summer vs. Tim?
6. **Code review**: Does HyperAgent merge autonomously or require human approval?

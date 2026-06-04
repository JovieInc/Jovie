---
type: process
title: Micro Saas Evaluation Pipeline
status: active
created: '2026-06-03T00:00:00.000Z'
process_id: PROCESS-001
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-04T05:55:38.806Z'
source_kind: 'mcp:put_page'
tags:
  - evaluation
  - metrics
  - micro-saas
  - pipeline
---

# Micro-SaaS Evaluation Pipeline

## Stage Gates

### Stage 0: Idea Capture
- **Input**: Any idea from Tim, Madison, or Idea Generation agent
- **Action**: Create GBrain page under `ideas/` with type=micro_saas_idea
- **Required fields**: pitch, how_it_works, business_model, metrics, estimated_ship_time
- **Auto-pass**: If it meets criteria (no app needed, <24h to ship, clear value prop, Stripe-payable)

### Stage 1: Ship
- **Goal**: Landing page live + agent workflow + Stripe payment + email delivery
- **Max time**: 24 hours from idea approval
- **Design**: Use existing Jovie design system, Jovie subdomain
- **Success criteria**: Page accepts payment and triggers agent

### Stage 2: Traction (Day 1-14)
- **Metric 1**: >2% landing page → paid trial conversion
- **Metric 2**: $500 MRR within 14 days
- **Metric 3**: >60% trial → repeat/referral
- **Daily check**: Revenue, conversion rate, agent success rate

### Stage 3: Decide (Day 14)
- **PROMOTE**: Hits all 3 metrics → becomes Jovie feature, onboard customers
- **KILL**: Misses any metric → archive idea, learn, move on
- **PIVOT**: Close but not quite → modify and re-ship (one pivot allowed)

## Kill Criteria (Hard)
- <$100 revenue by Day 7 → early kill
- <1% conversion by Day 7 → early kill
- Agent failure rate >20% → fix or kill
- Any manual step that can't be automated → fix TODAY or kill

## Promotion Criteria
- All 3 metrics hit → promote to Jovie feature
- Create Linear issue for feature integration
- Onboard existing customers to Jovie
- Archive micro-SaaS landing page (redirect to Jovie feature)

## Evaluation Cadence
- **Daily 9am**: Cron checks all active ideas, reports metrics to Tim
- **Day 7**: Mid-point evaluation — Summer recommends continue/pivot/kill
- **Day 14**: Final decision — Tim approves promote/kill
- **Weekly Sunday**: Retrospective on killed/promoted ideas

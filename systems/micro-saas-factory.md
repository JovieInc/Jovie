---
type: system
title: Micro Saas Factory
status: active
created: '2026-06-03T00:00:00.000Z'
system_id: SYSTEM-001
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-04T05:51:58.725Z'
source_kind: 'mcp:put_page'
tags:
  - factory
  - micro-saas
  - pipeline
  - revenue
---

# Micro-SaaS Factory

## Vision
A closed-loop factory that systematically ships, measures, and either promotes or kills micro-SaaS ideas. Fast revenue + pre-validated features for Jovie.

## The Loop
1. **Capture** → Ideas stored in GBrain with structured metadata
2. **Generate** → Agent deep-researches (Exa, Kimi Swarm) to find opportunities
3. **Ship** → Static landing page + agent workflow + Stripe payment link + email delivery
4. **Measure** → Strict metrics (X dollars in Y days)
5. **Decide** → Promote to Jovie feature or kill

## Architecture
- **Ideas DB**: GBrain pages with type=micro_saas_idea
- **Landing Pages**: Static, Jovie subdomains, shared design system
- **Agents**: Run on hyperagent.com or local machine
- **Delivery**: Email reports
- **Payments**: Stripe payment links via email
- **No App**: Entire business is landing page → agent → email → Stripe

## Strict Metrics
- Every idea must make **$500 MRR within 14 days** or get killed
- Landing page conversion must be **>2%** → paid trial
- Trial → repeat/referral must be **>60%**
- No exceptions. Kill fast, promote fast.

## Evaluation Cadence
- **Daily**: Check revenue metrics on active ideas
- **Day 7**: Mid-point evaluation — is it on track?
- **Day 14**: Final decision — promote or kill
- **Weekly**: Idea generation agent surfaces new opportunities

## Idea Generation
- Agent uses Exa/Kimi Swarm to deep-research micro-SaaS opportunities
- Criteria: can ship in <24h, no app needed, clear value prop, Stripe-payable
- Adds ideas to GBrain pipeline automatically
- Summer/Tim review and prioritize

## Autopilot Requirement
**Any part that can't run on autopilot is a blocker that gets fixed TODAY.**
- If it needs manual intervention, we automate it or we don't do it
- The factory runs 24/7 without human input except for kill/promote decisions

## Goal
- **July 2026**: Profitable with $20K AI credits + local setup
- **Raise with real revenue** — not projections, not pipeline, actual MRR

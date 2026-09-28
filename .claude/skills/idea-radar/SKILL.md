---
name: idea-radar
description: |
  Event-driven external opportunity-signal producer. Normalizes public,
  product, founder, and customer observations into the JOV-5916 canonical
  evidence lifecycle and routes bounded validation to JOV-2966.
argument-hint: "[signal or pending decision] [--dry-run]"
author: jovie-agentos
metadata:
  owner: JOV-2905
  canonical-lifecycle: JOV-5916
  benchmark-owner: JOV-2966
  cost-cap: 1.00
---

# Idea Radar — Opportunity Signal Producer

Idea Radar observes and normalizes. It does not own a company ledger, strategy
cadence, approval channel, capacity allocation, or automatic build queue.

## Trigger

Run for a new or materially changed source item, `/last30days` or other research
invoked for a pending decision, founder/customer input, a material internal
capability/workload/outcome change, or accumulated observations crossing the
configured semantic relevance or expected-information threshold.

Never run a full sweep merely because a clock fired. A bounded catch-up may run
only with evidence that events were missed; it is not the primary discovery path.

## Normalize into JOV-5916

Use `scripts/idea-radar/idea-radar.mjs`. Every adapter supplies:

- problem/opportunity, affected user, and affected capability;
- source URL/type/item ID, observed timestamp, access/terms constraints, and a
  stable dedupe key;
- freshness, engagement quality, evidence quality, and corroborating sources;
- novelty versus existing ideas, competitors, experiments, and rejected themes;
- initial demand/economic evidence, uncertainty, and cheapest validation action;
- capacity class, current-revenue-path conflict, stable identity, and explicit
  supersession when replacing prior evidence.

A headline, star count, reaction, or viral post is an observation, not proof of
demand or superiority. Duplicate events converge on the existing evidence ID.
Do not create a second GBrain, Slack, or Linear store.

`/last30days` remains an on-demand evidence adapter. Keep each call under $0.20
and the complete run under the metadata `cost-cap`. Preserve its source links,
dates, access constraints, and warnings in the normalized evidence object.

## Route; do not decide

- Routine evidence stays in JOV-5916. Low-value observations accumulate by
  semantic signature until the threshold is crossed.
- Capability comparisons go to JOV-2966 for a bounded benchmark/validation
  decision. Routine work within existing authority proceeds autonomously and
  writes an outcome receipt.
- Founder-judgment decisions go to the Unified Ovi Certification Inbox.
- Create a Linear issue only when the normalized object has an executable next
  action. Never create one issue per observation.
- Slack may notify or collect input, but is never source truth or the only action
  path. A founder up/down reaction changes hypothesis weight only; it cannot
  authorize a build or bypass cheapest-validation and capacity policy.

## Learning

Write accepted, rejected, modified, expired, and validated outcomes as versioned
preference/prior evidence with reasons. Keep founder taste distinct from customer
demand and paid behavior. Link later revenue/usage outcomes back to the original
stable evidence identity so GO/MAYBE/SKIP predictions can be calibrated.

## Legacy migration and retirement

The mapping in `scripts/idea-radar/idea-radar-registry.json` moves legacy GBrain
pages/preferences, `/last30days` output, Linear ledger links, and Slack reactions
into JOV-5916 without data loss. Historical source links remain provenance.

Hermes is retired and has no Idea Radar schedule or authority. The former Monday
sweep and Slack-only go/no-go semantics are explicitly disabled. Do not restore
Hermes, Trigger, or automatic `go build` behavior.

## Verify

```bash
node --test scripts/idea-radar/idea-radar.test.mjs
node scripts/idea-radar/idea-radar.mjs
```

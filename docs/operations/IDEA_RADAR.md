# Idea Radar signal producer

Issues: JOV-2905, JOV-5916, JOV-2966

Executable contract: `scripts/idea-radar/idea-radar.mjs`

Migration registry: `scripts/idea-radar/idea-radar-registry.json`

Idea Radar is an external opportunity-signal producer for the canonical evidence
lifecycle (JOV-5916). It is event-driven and may prioritize investigation, but it
does not decide what to build. JOV-2966 owns capability benchmarks and the company
capacity allocator owns admission.

## Flow

1. A source adapter emits a new/changed item, pending-decision research result,
   founder/customer observation, material internal change, or accumulated
   low-value cluster crossing the expected-information threshold.
2. The normalizer records provenance, time, access constraints, freshness,
   quality, uncertainty, novelty, cheapest validation, and capacity impact.
3. Stable source identity converges duplicate deliveries on one JOV-5916 evidence
   object. Replacements use explicit supersession.
4. Routine observations remain evidence. A benchmark routes to JOV-2966; founder
   judgment routes to the Unified Ovi Certification Inbox; Linear is used only
   after an executable next action exists.
5. Outcome receipts link later usage, revenue, rejection, modification, or expiry
   to the original evidence identity and calibrate prior judgments.

## Legacy mapping

The registry maps the legacy GBrain pages/preferences, `/last30days` research,
Linear ledger issues, and Slack cards/reactions into JOV-5916 without discarding
source content or links. Those legacy records are migration inputs, not a second
active store. Founder reactions are founder-taste evidence; they do not establish
customer demand, paid behavior, benchmark superiority, or build authorization.

Hermes is retired. No weekly Idea Radar cron is authoritative or configured in
the current runtime. A periodic catch-up is permitted only as a bounded missed-
event safety net with explicit missed-event evidence.

## Decision record

**Ship now:** enforce the producer boundary, deterministic convergence, routing,
and calibration contract in source and tests.

**Re-evaluate when:** JOV-5916 exposes its durable adapter API or a migration run
is admitted by that owner.

**Then:** bind these normalized objects and migration mappings to that canonical
API without changing identity or creating a second store.

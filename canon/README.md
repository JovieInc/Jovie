# Jovie Canon

This directory is the root of Jovie's decision-making hierarchy.

Read in this order:

1. [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md) — company constitution; highest authority.
2. [`FLEET.md`](./FLEET.md) — closed-loop agent org, admission, founder day, default-alive scoreboard.
3. [`PRODUCT.md`](./PRODUCT.md) — customer value and product bottlenecks.
4. [`ENGINEERING.md`](./ENGINEERING.md) — engineering priorities and technology posture.
5. [`DESIGN.md`](./DESIGN.md) — UX, trust, clarity, and design bottlenecks.
6. [`MARKETING.md`](./MARKETING.md) — qualified demand and funnel bottlenecks.
7. [`POSITIONING.md`](./POSITIONING.md) — founder-locked customer positioning and
   message roles; read for product, marketing, partnership, and brand work.
8. [`VOICE.md`](./VOICE.md) — messaging, tone, and agent communication.
9. [`OWNERSHIP.md`](./OWNERSHIP.md) — owner registry, agent identity registry,
   and the CI check that fails on anything unowned.
10. [`RELEASE_CHANNELS.md`](./RELEASE_CHANNELS.md) — canonical release-channel
   vocabulary (Stable / Beta / Nightly), platform mappings, and Settings IA;
   machine-readable contract in `packages/release-channel-contracts`.
11. [`CAPACITY.md`](./CAPACITY.md) — generated agent capacity: plan, price, remaining
   quota or credits, policy and delegation cost per provider. Source of truth is
   `ops/registry/capacity.json`; every agent reads it before routing or delegating.
12. [`COMPLIANCE.md`](./COMPLIANCE.md) — legal and compliance register: requirement, evidence,
   gap, fix and owner per item; Summer gates launches against it. Not legal advice.

13. [`SOURCES_OF_TRUTH.md`](./SOURCES_OF_TRUTH.md) — every fact domain, its one owner and
   its derived surfaces; generated from `sources-of-truth.json`. Find the owner before
   adding a fact; derive, never copy.

Operational files (`CLAUDE.md`, `.claude/rules/*`, `docs/*`, skills, scripts, workflows) implement this canon. If they conflict, update the lower-level file or escalate to Tim.

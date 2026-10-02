---
thesis_id: STRAT-2026-10-02-01
status: active
effective: 2026-10-02
confidence: founder-direction
source: Linear document "Strategy thesis — Sell outcomes, eliminate creator side quests, keep execution substrate replaceable" (JOV-7521)
supersedes: []
---

# Sell outcomes, eliminate creator side quests, keep the execution substrate replaceable

Distilled from the October 2, 2026 founder strategy discussion.

## Decision

Jovie sells **outcomes**, not tools and not a temporary middle-layer product.
The product is the delivered result for the creator; the software, models,
and orchestration underneath are a replaceable execution substrate.

## Doctrine

- **Outcome-selling over middle layers.** Do not build product surface whose
  value is a transient intermediary step. Price and promise the outcome the
  creator delegates, not the mechanism that produces it.
- **No creator side quests.** Anything that routes the creator into
  auxiliary workflows (managing agents, tuning configs, supervising swarms)
  is a side quest and a trust leak. Eliminate or absorb it into the
  delivered outcome.
- **One accountable agent, not exposed swarms.** The user delegates to one
  accountable agent. Internal swarms, orchestration, and model routing are
  implementation detail and must not surface as UX.
- **Trust through delegation.** The service → managed outcome → autonomy
  continuum is the product ladder: earn delegation incrementally, deepen
  autonomy as trust is proven.
- **Replaceable substrate.** Model, harness, sandbox, and execution
  providers (e.g. Codex Cloud, Vercel) are swappable cost/quality
  components. Never let a substrate choice become product identity or an
  irreversible commitment.
- **Bounded subsidy economics.** Free plans and promotions are bounded
  subsidies, not entitlements. No lifetime deals, no irreversible
  marginal-cost obligations (e.g. AppSumo-style lifetime pricing).
- **Productize observed delegation.** New product surface comes from
  observed delegation behavior — what creators actually hand off — not from
  speculative platform building.

## Invariants

- Pricing, packaging, and free-tier decisions must name the bounded subsidy
  and its exit, or they are rejected.
- Any UI that exposes orchestration internals (agent swarms, model routers,
  substrate vendors) violates the one-accountable-agent doctrine.
- Substrate integrations must keep a replaceability path; no architectural
  lock-in without explicit founder sign-off.

## Applies to

Product strategy, pricing, packaging, free tiers, business model, creator
workflow, autonomy/delegation UX, model routing, agent UX, orchestration,
execution substrate, company-level architecture.

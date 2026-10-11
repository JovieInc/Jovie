// Rank registry models for a review role by expected cost per successful
// result. Ported from the retired Symphony router (JOV-6637) and kept local to
// the review kernel: agent lanes route through scripts/lanes, not this file.
//
// Expected cost = one attempt (tokens at the effective price, plus valued
// minutes) + (1 - p) x failure cost for one-shot work such as review, or
// attempt / p for retry-until-done work. p is a Beta-smoothed blend of
// observed replay outcomes (model-outcomes/v1 ledger) and the registry's
// benchmark quality prior for the capability.

import { readFileSync } from 'node:fs';

export const REGISTRY_URL = new URL(
  '../backlog-orchestrator/config/model-registry.json',
  import.meta.url
);
export const OUTCOMES_SCHEMA = 'model-outcomes/v1';

export function loadRegistry(url = REGISTRY_URL) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Outcome aggregates from a model-outcomes/v1 ledger; {} when absent or invalid. */
export function loadOutcomes(path) {
  if (!path) return {};
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (data?.schema !== OUTCOMES_SCHEMA) return {};
    return data.outcomes && typeof data.outcomes === 'object'
      ? data.outcomes
      : {};
  } catch {
    return {};
  }
}

const num = value =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function timestamp(value) {
  if (num(value) !== null) return value * 1000;
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Per-1M-token prices after an active promo and any credit multiplier. */
export function effectivePrices(model, now = Date.now()) {
  let priceIn = num(model.list_price_in) ?? 0;
  let priceOut = num(model.list_price_out) ?? 0;
  let basis = 'list';
  const promo = model.promo;
  if (promo && (timestamp(promo.until) ?? 0) > now) {
    priceIn = num(promo.price_in) ?? 0;
    priceOut = num(promo.price_out) ?? 0;
    basis = 'promo';
  }
  const multiplier = num(model.effective_price_multiplier) ?? 1;
  if (multiplier !== 1) {
    priceIn *= multiplier;
    priceOut *= multiplier;
    basis += '+credits';
  }
  return { priceIn, priceOut, basis };
}

/** Benchmark-backed quality for this capability, else the global quality. */
export function capabilityQuality(model, capability) {
  return (
    num(model.quality_by_capability?.[capability]) ?? num(model.quality) ?? 0
  );
}

function jobTokens(policy, capability) {
  const estimates = policy.job_token_estimates ?? {};
  const estimate = estimates[capability] ??
    estimates.code ?? { input: 80_000, output: 40_000 };
  return [num(estimate.input) ?? 0, num(estimate.output) ?? 0];
}

export function expectedCostPerSuccess(
  registry,
  model,
  capability,
  { outcomes = {}, now = Date.now() } = {}
) {
  const policy = registry.routing_policy ?? {};
  const minSamples = num(policy.min_samples) ?? 5;
  const priorWeight = num(policy.prior_weight) ?? 2;
  const minuteValue = num(policy.minute_value_usd) ?? 0;
  const prior = Math.min(
    0.99,
    Math.max(0.01, capabilityQuality(model, capability) / 100)
  );
  const observed = outcomes[model.id]?.[capability] ?? {};
  const attempts = Math.max(0, Math.trunc(num(observed.attempts) ?? 0));
  const successes = Math.min(
    attempts,
    Math.max(0, Math.trunc(num(observed.successes) ?? 0))
  );
  const pSuccess = (successes + priorWeight * prior) / (attempts + priorWeight);

  let [tokensIn, tokensOut] = jobTokens(policy, capability);
  let minutes = 0;
  if (attempts >= minSamples) {
    tokensIn = (num(observed.tokens_in) ?? 0) / attempts;
    tokensOut = (num(observed.tokens_out) ?? 0) / attempts;
    minutes = (num(observed.minutes) ?? 0) / attempts;
  }

  let { priceIn, priceOut, basis } = effectivePrices(model, now);
  if (model.channel === 'subscription' || model.channel === 'local') {
    // Subsidy: a subscription buys a multiple of its price in list usage.
    const included = num(model.sub_included_multiplier) || 1;
    priceIn /= included;
    priceOut /= included;
    basis = 'subscription-included';
  }
  const tokenCost = (tokensIn * priceIn + tokensOut * priceOut) / 1_000_000;
  const attemptCost = tokenCost + minutes * minuteValue;
  const failureCost = num(policy.failure_cost_usd?.[capability]);
  const expected =
    failureCost !== null && failureCost >= 0
      ? attemptCost + (1 - pSuccess) * failureCost
      : attemptCost / pSuccess;
  return {
    expectedCostPerSuccess: expected,
    attemptTokenCost: tokenCost,
    pSuccess,
    samples: attempts,
    priceBasis: basis,
    priceIn,
    priceOut,
  };
}

/**
 * Score every registry model with the capability. Returns ranked candidates
 * (cheapest expected cost per success first) and the refused ones with a
 * reason. No executors, probes or pool state are involved.
 */
export function rank(
  registry,
  capability,
  {
    provider = null,
    excludeFamilies = [],
    outcomes = {},
    now = Date.now(),
  } = {}
) {
  const floor = num(registry.routing_policy?.min_quality?.[capability]);
  const ranked = [];
  const refused = [];
  for (const model of registry.models ?? []) {
    if (!model.capabilities?.includes(capability)) continue;
    if (provider && model.provider !== provider) continue;
    const quality = capabilityQuality(model, capability);
    let reason = null;
    if (excludeFamilies.includes(model.family)) reason = 'excluded_family';
    else if (floor !== null && quality < floor) reason = 'below_quality_floor';
    if (reason) {
      refused.push({ id: model.id, reason });
      continue;
    }
    const economics = expectedCostPerSuccess(registry, model, capability, {
      outcomes,
      now,
    });
    ranked.push({
      id: model.id,
      model: model.model,
      provider: model.provider,
      family: model.family,
      quality,
      ...economics,
    });
  }
  ranked.sort(
    (a, b) =>
      a.expectedCostPerSuccess - b.expectedCostPerSuccess ||
      b.quality - a.quality ||
      a.id.localeCompare(b.id)
  );
  return { capability, ranked, refused };
}

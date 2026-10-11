// Model selection and Gateway transport for the review kernel. Models are
// ranked by expected cost per successful review (./rank.mjs): effective price
// after promos and credits, weighed against the observed or benchmark-prior
// success rate. This module never picks a model the ranking did not return.

import { createGateway, generateText } from 'ai-evaluation';
import { loadOutcomes, loadRegistry, rank } from './rank.mjs';

export const REVIEW_CAPABILITIES = Object.freeze({
  discovery: 'review',
  verification: 'review-verify',
});
export const REVIEW_PROVIDER = 'vercel-ai-gateway';

/**
 * Both role rankings over Gateway models, each costed for its own job size.
 * `outcomesPath` is a model-outcomes/v1 ledger (PR_REVIEW_OUTCOMES); without
 * one the ranking runs on benchmark priors.
 */
export function rankReviewModels({
  registry = loadRegistry(),
  outcomesPath = process.env.PR_REVIEW_OUTCOMES,
  outcomes = loadOutcomes(outcomesPath),
  now = Date.now(),
} = {}) {
  const options = { provider: REVIEW_PROVIDER, outcomes, now };
  return {
    discovery: rank(registry, REVIEW_CAPABILITIES.discovery, options),
    verification: rank(registry, REVIEW_CAPABILITIES.verification, options),
  };
}

function pinnedRow(rows, env, key) {
  const model = env[key];
  if (!model) return null;
  const row = rows.find(candidate => candidate.model === model);
  if (!row) throw new Error(`${key} is not a ranked review model: ${model}`);
  return row;
}

/**
 * Choose the discovery/verification pair with the lowest combined expected
 * cost per success. The verifier must be a different family; the ranking has
 * already refused verifiers below the review-verify quality floor. Env
 * overrides must name ranked models.
 */
export function selectRoutes(rankings, env = {}) {
  const pinnedDiscovery = pinnedRow(
    rankings.discovery.ranked,
    env,
    'PR_REVIEW_DISCOVERY_MODEL'
  );
  const pinnedVerification = pinnedRow(
    rankings.verification.ranked,
    env,
    'PR_REVIEW_VERIFICATION_MODEL'
  );
  const discoveries = pinnedDiscovery
    ? [pinnedDiscovery]
    : rankings.discovery.ranked;
  const verifiers = pinnedVerification
    ? [pinnedVerification]
    : rankings.verification.ranked;

  let best = null;
  for (const discovery of discoveries) {
    for (const verification of verifiers) {
      if (verification.family === discovery.family) continue;
      const cost =
        discovery.expectedCostPerSuccess + verification.expectedCostPerSuccess;
      if (!best || cost < best.cost) best = { discovery, verification, cost };
    }
  }
  if (!best) {
    throw new Error(
      'no different-family review pair above the verification floor'
    );
  }
  const { discovery, verification } = best;
  /** @type {Record<string, {family: string, inPerMillion: number, outPerMillion: number}>} */
  const prices = {};
  for (const row of [discovery, verification]) {
    prices[row.model] = {
      family: row.family,
      inPerMillion: row.priceIn,
      outPerMillion: row.priceOut,
    };
  }
  const summarize = row => ({
    registryId: row.id,
    model: row.model,
    family: row.family,
    expectedCostPerSuccessUsd: row.expectedCostPerSuccess,
    pSuccess: row.pSuccess,
    priceBasis: row.priceBasis,
  });
  return {
    routes: Object.freeze({
      discovery: discovery.model,
      verification: verification.model,
    }),
    prices,
    routing: {
      discovery: summarize(discovery),
      verification: summarize(verification),
    },
  };
}

/** Validate that both routes are priced and come from different families. */
export function assertRoutes(prices, routes) {
  for (const model of Object.values(routes)) {
    if (
      !prices[model] ||
      ![prices[model].inPerMillion, prices[model].outPerMillion].every(
        value => Number.isFinite(value) && value >= 0
      )
    )
      throw new Error(`model not in registry: ${model}`);
  }
  if (prices[routes.discovery].family === prices[routes.verification].family) {
    throw new Error('discovery and verification must use different families');
  }
}

export function costUsd(prices, model, usage) {
  const price = prices[model];
  if (!price) return 0;
  const input = Number(usage?.inputTokens) || 0;
  const output = Number(usage?.outputTokens) || 0;
  return (
    (input * price.inPerMillion + output * price.outPerMillion) / 1_000_000
  );
}

/**
 * Default transport: one explicit Gateway instance, no retries, no global
 * provider. Raw provider errors are not persisted by callers.
 */
/** @param {{apiKey?: string, fetch?: typeof globalThis.fetch}} [options] */
export function createGatewayTransport({ apiKey, fetch } = {}) {
  if (!apiKey?.trim()) throw new Error('Gateway credential unavailable');
  const gateway = createGateway({ apiKey, fetch });
  return async ({ model, system, prompt, maxOutputTokens, signal }) => {
    const result = await generateText({
      model: gateway(model),
      system,
      prompt,
      maxOutputTokens,
      maxRetries: 0,
      abortSignal: signal,
    });
    return { text: result.text, usage: result.usage };
  };
}

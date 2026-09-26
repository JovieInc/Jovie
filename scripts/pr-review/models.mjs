// Model selection and Gateway transport for the review kernel. Models come
// from the canonical Symphony router (`model-router.py rank`), which ranks by
// expected cost per successful review: effective price after promos and
// credits, divided by observed or prior success rate. This module never picks
// a model the router did not rank.

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createGateway, generateText } from 'ai-evaluation';

const execFileAsync = promisify(execFile);
const ROUTER = fileURLToPath(
  new URL('../symphony/model-router.py', import.meta.url)
);

export const REVIEW_CAPABILITIES = Object.freeze({
  discovery: 'review',
  verification: 'review-verify',
});
export const REVIEW_PROVIDER = 'vercel-ai-gateway';

/** Ask the canonical router for Gateway models, cheapest per success first. */
export async function fetchRanking(capability, { run = execFileAsync } = {}) {
  const { stdout } = await run('python3', [
    ROUTER,
    'rank',
    '--capability',
    capability,
    '--provider',
    REVIEW_PROVIDER,
  ]);
  const ranking = JSON.parse(stdout);
  if (!Array.isArray(ranking?.ranked)) {
    throw new Error('router rank output invalid');
  }
  return ranking;
}

/** Both role rankings, each scored by the router for its own job size. */
export async function fetchRankings(options) {
  return {
    discovery: await fetchRanking(REVIEW_CAPABILITIES.discovery, options),
    verification: await fetchRanking(REVIEW_CAPABILITIES.verification, options),
  };
}

function pinnedRow(rows, env, key) {
  const model = env[key];
  if (!model) return null;
  const row = rows.find(candidate => candidate.model === model);
  if (!row) throw new Error(`${key} is not a router-ranked model: ${model}`);
  return row;
}

/**
 * Choose the discovery/verification pair with the lowest combined expected
 * cost per success. The verifier must be a different family; the router has
 * already refused verifiers below the review-verify quality floor. Env
 * overrides must name models the router ranked.
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
        discovery.expected_cost_per_success_usd +
        verification.expected_cost_per_success_usd;
      if (!best || cost < best.cost) best = { discovery, verification, cost };
    }
  }
  if (!best) {
    throw new Error(
      'no different-family review pair above the verification floor'
    );
  }
  const { discovery, verification } = best;
  const prices = {};
  for (const row of [discovery, verification]) {
    prices[row.model] = {
      family: row.family,
      inPerMillion: row.list_price_in,
      outPerMillion: row.list_price_out,
    };
  }
  const summarize = row => ({
    routerId: row.id,
    model: row.model,
    family: row.family,
    expectedCostPerSuccessUsd: row.expected_cost_per_success_usd,
    pSuccess: row.p_success,
    priceBasis: row.price_basis,
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

// Gateway transport for the review kernel. Models and prices come from the
// Symphony model registry; this module never picks a model outside it.

import { readFileSync } from 'node:fs';
import { createGateway, generateText } from 'ai-evaluation';

const REGISTRY_URL = new URL(
  '../symphony/config/model-registry.json',
  import.meta.url
);

/**
 * Discovery and verification use different model families so the verifier
 * does not share the discoverer's blind spots.
 */
export const REVIEW_ROUTES = Object.freeze({
  discovery: 'deepseek/deepseek-v4.1-flash',
  verification: 'z-ai/glm-5.3',
});

/**
 * Models the review may use that the Symphony registry does not list yet.
 * Kept here, not in the registry, so adding them cannot change Symphony
 * routing. Prices are the published peak rates (USD per 1M tokens) so the
 * budget errs high. Registry entries win when both exist.
 */
export const REVIEW_MODEL_OVERRIDES = Object.freeze({
  'deepseek/deepseek-v4.1-flash': {
    family: 'deepseek',
    inPerMillion: 0.3,
    outPerMillion: 1.2,
  },
});

/** Per-role allowlist; replay runs may swap within it via env. */
export const ROUTE_OPTIONS = Object.freeze({
  discovery: [
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-flash',
    'z-ai/glm-5.3-flash',
  ],
  verification: ['z-ai/glm-5.3', 'z-ai/glm-5.3-flash'],
});

/** Resolve routes from env overrides, refusing anything off the allowlist. */
export function resolveRoutes(env = {}) {
  const discovery = env.PR_REVIEW_DISCOVERY_MODEL || REVIEW_ROUTES.discovery;
  const verification =
    env.PR_REVIEW_VERIFICATION_MODEL || REVIEW_ROUTES.verification;
  if (!ROUTE_OPTIONS.discovery.includes(discovery)) {
    throw new Error(`discovery model not allowed: ${discovery}`);
  }
  if (!ROUTE_OPTIONS.verification.includes(verification)) {
    throw new Error(`verification model not allowed: ${verification}`);
  }
  return Object.freeze({ discovery, verification });
}

export function loadModelPrices(registry = null) {
  const source = registry ?? JSON.parse(readFileSync(REGISTRY_URL, 'utf8'));
  const prices = { ...REVIEW_MODEL_OVERRIDES };
  for (const model of Object.keys(prices)) {
    if (source.models?.some(entry => entry.model === model)) {
      delete prices[model];
    }
  }
  for (const entry of source.models ?? []) {
    if (
      typeof entry.model === 'string' &&
      Number.isFinite(entry.list_price_in) &&
      Number.isFinite(entry.list_price_out) &&
      !(entry.model in prices)
    ) {
      prices[entry.model] = {
        family: entry.family,
        inPerMillion: entry.list_price_in,
        outPerMillion: entry.list_price_out,
      };
    }
  }
  return prices;
}

/** Validate that both routes are priced and come from different families. */
export function assertRoutes(prices, routes = REVIEW_ROUTES) {
  for (const model of Object.values(routes)) {
    if (!prices[model]) throw new Error(`model not in registry: ${model}`);
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

#!/usr/bin/env node
// Samples the shared GITHUB_TOKEN installation REST budget (GET /rate_limit is
// free) and alarms below 15% remaining. 2026-10-24: the budget ran dry and
// PR Fleet Rules, Source Validation and PR Ready went red on a dozen PRs
// until someone re-ran them after the reset. The sample is a time series
// point (remaining, used, reset) so hourly consumption is a subtraction.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { providerSpec } from '../packages/api-client/contract.ts';
import { createGitHubClient } from '../packages/api-client/github.ts';
import { parseBudget } from '../packages/api-client/headers.ts';

export const LOW_BUDGET_FRACTION = 0.15;

/** @typedef {{ limit: number, remaining: number, reset: number }} RateLimitCore */

/** @param {Partial<RateLimitCore> | undefined} core */
export function evaluateBudget(core, nowMs = Date.now()) {
  const { limit, remaining, reset } = core ?? {};
  if (
    !Number.isFinite(limit) ||
    limit <= 0 ||
    !Number.isFinite(remaining) ||
    remaining < 0 ||
    !Number.isFinite(reset)
  )
    throw new Error('malformed rate_limit core resource');
  const fraction = remaining / limit;
  return {
    limit,
    remaining,
    used: limit - remaining,
    fraction,
    low: fraction < LOW_BUDGET_FRACTION,
    resetInSeconds: Math.max(0, Math.round(reset - nowMs / 1000)),
    resetIso: new Date(reset * 1000).toISOString(),
  };
}

export function render(sample, name = 'installation') {
  const pct = (sample.fraction * 100).toFixed(1);
  const line = `${name} REST budget ${sample.remaining}/${sample.limit} (${pct}% left, ${sample.used} used), resets in ${sample.resetInSeconds}s at ${sample.resetIso}`;
  return sample.low
    ? `::error title=GitHub ${name} budget low::${line}; gates that read on it defer instead of deciding until it resets.`
    : `::notice title=GitHub ${name} budget::${line}`;
}

// Each installation has its own bucket: the repo-wide GITHUB_TOKEN every
// workflow shares, and the dedicated CI App that fleet-rule evidence reads on.
export const INSTALLATIONS = [
  { name: 'shared-github-token', tokenEnv: 'GITHUB_TOKEN' },
  { name: 'ci-app', tokenEnv: 'CI_APP_TOKEN' },
];

async function sampleOne(name, token, { fetchImpl, now, store }) {
  const github = createGitHubClient({ token, fetch: fetchImpl, now, store });
  const response = await github.rest('GET', '/rate_limit', undefined, {
    priority: 'report',
    // GitHub exempts this endpoint from REST quota. It must still sample a
    // depleted ledger; ordinary report reads are shed below the reserve.
    costs: {},
    conditional: false,
    maxAttempts: 1,
    maxWaitMs: 0,
    timeoutMs: 15_000,
  });
  if (response.status !== 200)
    throw new Error(`${name} rate_limit read failed (${response.status})`);
  const at = now();
  const headerBudget = parseBudget(
    providerSpec('github'),
    response.headers,
    at,
    'core'
  ).find(observation => observation.resource === 'core');
  // GitHub's headers govern enforcement when the overview body disagrees.
  if (
    headerBudget &&
    headerBudget.limit !== null &&
    headerBudget.resetAt !== null
  ) {
    return evaluateBudget(
      {
        limit: headerBudget.limit,
        remaining: headerBudget.remaining,
        reset: headerBudget.resetAt / 1000,
      },
      at
    );
  }
  const body =
    /** @type {{ resources?: { core?: Partial<RateLimitCore> } }} */ (
      response.json()
    );
  return evaluateBudget(body?.resources?.core, at);
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   log?: (message: string) => void,
 *   now?: () => number,
 *   store?: import('../packages/api-client/store.ts').LedgerStore,
 * }} [options]
 */
export async function main({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  now = Date.now,
  store,
} = {}) {
  const samples = {};
  for (const { name, tokenEnv } of INSTALLATIONS) {
    if (!env[tokenEnv]) {
      log(`::warning::${name} budget not sampled (no ${tokenEnv})`);
      continue;
    }
    try {
      const sample = await sampleOne(name, env[tokenEnv], {
        fetchImpl,
        now,
        store,
      });
      samples[name] = sample;
      log(render(sample, name));
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          env.GITHUB_STEP_SUMMARY,
          `- ${name} budget: remaining=${sample.remaining} limit=${sample.limit} used=${sample.used} reset=${sample.resetIso} low=${sample.low}\n`
        );
      if (env.GITHUB_OUTPUT) {
        const key = name.replace(/-/g, '_');
        appendFileSync(
          env.GITHUB_OUTPUT,
          `${key}_low=${sample.low}\n${key}_remaining=${sample.remaining}\n${key}_limit=${sample.limit}\n${key}_reset_in_seconds=${sample.resetInSeconds}\n`
        );
      }
    } catch (error) {
      // A failed read is not an alarm: the next sample covers it.
      const status = error.status ? ` (HTTP ${error.status})` : '';
      log(`::warning::${name} budget sample unavailable${status}`);
    }
  }
  return samples;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();

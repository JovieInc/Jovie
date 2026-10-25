#!/usr/bin/env node
// Samples the shared GITHUB_TOKEN installation REST budget (GET /rate_limit is
// free) and alarms below 15% remaining. 2026-10-24: the budget ran dry and
// PR Fleet Rules, Source Validation and PR Ready went red on a dozen PRs
// until someone re-ran them after the reset. The sample is a time series
// point (remaining, used, reset) so hourly consumption is a subtraction.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LOW_BUDGET_FRACTION = 0.15;

/** @param {{ limit: number, remaining: number, reset: number }} core */
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

export function render(sample) {
  const pct = (sample.fraction * 100).toFixed(1);
  const line = `installation REST budget ${sample.remaining}/${sample.limit} (${pct}% left, ${sample.used} used), resets in ${sample.resetInSeconds}s at ${sample.resetIso}`;
  return sample.low
    ? `::error title=GitHub installation budget low::${line}; PR Fleet Rules, Source Validation and PR Ready defer instead of deciding until it resets.`
    : `::notice title=GitHub installation budget::${line}`;
}

export async function main({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  now = Date.now,
} = {}) {
  const response = await fetchImpl('https://api.github.com/rate_limit', {
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`rate_limit read failed (${response.status})`);
  const body = await response.json();
  const sample = evaluateBudget(body?.resources?.core, now());
  log(render(sample));
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `- installation budget: remaining=${sample.remaining} limit=${sample.limit} used=${sample.used} reset=${sample.resetIso} low=${sample.low}\n`
    );
  if (env.GITHUB_OUTPUT)
    appendFileSync(
      env.GITHUB_OUTPUT,
      `low=${sample.low}\nremaining=${sample.remaining}\nlimit=${sample.limit}\nreset_in_seconds=${sample.resetInSeconds}\n`
    );
  return sample;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => {
    // A failed read is not an alarm: the next sample covers it.
    console.log(
      `::warning::installation budget sample unavailable (${error.message})`
    );
  });

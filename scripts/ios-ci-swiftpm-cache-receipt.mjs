#!/usr/bin/env node
/**
 * Write the hosted Fast Unit SwiftPM cache/resolve receipt (JOV-14016).
 *
 * Inputs (env):
 *   SWIFTPM_CACHE_HIT — actions/cache restore cache-hit ("true" | "" | unset)
 *   SWIFTPM_RESOLVE_OUTCOME — resolve step outcome (success|failure|skipped|…)
 *   SWIFTPM_RESOLVE_DURATION_SECONDS — wall seconds when resolve ran
 *   SWIFTPM_CACHE_PRIMARY_KEY — primary cache key (optional)
 *   GITHUB_* / RUNNER_ENVIRONMENT — provenance for the artifact + summary
 *
 * Baseline (pre-skip warm resolve): ~46s on run 39542892987.
 * Post-#26277 cold miss: ~76s on run 44872396771 (main push of the skip).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** @param {Record<string, string | undefined>} env */
export function buildSwiftpmCacheReceipt(env = process.env) {
  const cacheHit = env.SWIFTPM_CACHE_HIT === 'true';
  const resolveOutcome = env.SWIFTPM_RESOLVE_OUTCOME || '';
  const resolveSkipped = resolveOutcome === 'skipped' || resolveOutcome === '';
  const parsedDuration = Number.parseInt(
    env.SWIFTPM_RESOLVE_DURATION_SECONDS || '',
    10
  );
  const resolveDurationSeconds = Number.isFinite(parsedDuration)
    ? parsedDuration
    : resolveSkipped
      ? 0
      : null;

  const server = (env.GITHUB_SERVER_URL || 'https://github.com').replace(
    /\/$/,
    ''
  );
  const repo = env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  const runId = env.GITHUB_RUN_ID || '';
  const runUrl = runId ? `${server}/${repo}/actions/runs/${runId}` : null;

  return {
    schema: 'jovie.ios-ci.swiftpm-cache-receipt/v1',
    issue: 'JOV-14016',
    observedAt: new Date().toISOString(),
    sha: env.GITHUB_SHA || null,
    runId: runId || null,
    runAttempt: env.GITHUB_RUN_ATTEMPT || null,
    runUrl,
    runnerEnvironment: env.RUNNER_ENVIRONMENT || null,
    cacheHit,
    cachePrimaryKey: env.SWIFTPM_CACHE_PRIMARY_KEY || null,
    resolveOutcome: resolveOutcome || null,
    resolveSkipped,
    resolveDurationSeconds,
    baselines: {
      preSkipWarmResolveSeconds: 46,
      preSkipWarmRunUrl:
        'https://github.com/JovieInc/Jovie/actions/runs/39542892987',
      postSkipColdMissResolveSeconds: 76,
      postSkipColdMissRunUrl:
        'https://github.com/JovieInc/Jovie/actions/runs/44872396771',
    },
    claimReady:
      cacheHit &&
      resolveSkipped &&
      typeof resolveDurationSeconds === 'number' &&
      resolveDurationSeconds === 0,
  };
}

/** @param {ReturnType<typeof buildSwiftpmCacheReceipt>} receipt */
export function formatSwiftpmCacheSummary(receipt) {
  const lines = [
    '### SwiftPM cache receipt (JOV-14016)',
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| cache_hit | \`${receipt.cacheHit}\` |`,
    `| resolve_skipped | \`${receipt.resolveSkipped}\` |`,
    `| resolve_outcome | \`${receipt.resolveOutcome ?? ''}\` |`,
    `| resolve_duration_seconds | \`${receipt.resolveDurationSeconds ?? 'n/a'}\` |`,
    `| claim_ready (hit + skip) | \`${receipt.claimReady}\` |`,
    `| baseline warm resolve | ${receipt.baselines.preSkipWarmResolveSeconds}s |`,
    `| baseline cold miss (post-skip) | ${receipt.baselines.postSkipColdMissResolveSeconds}s |`,
  ];
  if (receipt.runUrl) lines.push(`| run | ${receipt.runUrl} |`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const receipt = buildSwiftpmCacheReceipt(process.env);
  const outDir = path.join('artifacts', 'ios-ci');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'swiftpm-cache-receipt.json');
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`Wrote ${outPath}\n`);
  const summary = formatSwiftpmCacheSummary(receipt);
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

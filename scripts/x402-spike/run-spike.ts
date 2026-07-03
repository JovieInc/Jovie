/**
 * x402 payment-gated artist resources spike runner (GitHub #12750).
 *
 *   pnpm tsx scripts/x402-spike/run-spike.ts
 *   pnpm tsx scripts/x402-spike/run-spike.ts --check-keys
 */
import { compareX402Lanes } from '../../apps/web/lib/x402-spike/cost-model';
import {
  cookieAmortizedRequestP50Ms,
  totalFirstPaidRequestP50Ms,
  totalFirstPaidRequestP95Ms,
  X402_LATENCY_BUDGET,
} from '../../apps/web/lib/x402-spike/latency-budget';
import { buildWranglerVarsSnippet } from '../../apps/web/lib/x402-spike/protected-patterns';
import { X402_SPIKE_PRIMARY_ASSET } from '../../apps/web/lib/x402-spike/test-asset';
import {
  assertPinnedSpikeAssets,
  loadSpikeTestAssetJson,
} from './validate-test-asset';

function parseArgs(argv: string[]): { checkKeys: boolean } {
  return { checkKeys: argv.includes('--check-keys') };
}

function keyStatus(envName: string): 'set' | 'missing' {
  const value = process.env[envName];
  return value?.trim() ? 'set' : 'missing';
}

function printLatencyBudget(): void {
  console.log('\n## Latency budget (structural — live probe blocked)\n');
  console.log('| Phase | p50 (ms) | p95 (ms) | Notes |');
  console.log('| --- | ---: | ---: | --- |');
  for (const row of X402_LATENCY_BUDGET) {
    console.log(
      `| ${row.phase} | ${row.p50Ms} | ${row.p95Ms} | ${row.notes} |`
    );
  }
  console.log(
    `\nFirst paid request total: ~${totalFirstPaidRequestP50Ms()}ms p50 / ~${totalFirstPaidRequestP95Ms()}ms p95`
  );
  console.log(
    `Cookie-amortized retry: ~${cookieAmortizedRequestP50Ms()}ms p50`
  );
}

function printCostTable(): void {
  const lanes = compareX402Lanes();
  console.log('\n## Unit economics (per transaction)\n');
  console.log('| Lane | Rail cost (est.) | Min viable price |');
  console.log('| --- | ---: | ---: |');
  for (const lane of [
    lanes.workerTemplate,
    lanes.payPerCrawl,
    lanes.monetizationGateway,
  ]) {
    console.log(
      `| ${lane.label} | $${lane.fullyLoadedPerTx.toFixed(5)} | $${lane.minimumViablePriceUsd.toFixed(2)} |`
    );
  }
  console.log(
    `\nArtist net at $0.01/call: ~$${lanes.artistNetAtOneCent.toFixed(4)}`
  );
  console.log(
    `Artist net at $0.05/call: ~$${lanes.artistNetAtFiveCents.toFixed(4)}`
  );
}

function printWranglerSnippet(): void {
  const vars = buildWranglerVarsSnippet();
  console.log('\n## Suggested wrangler vars (staging origin)\n');
  console.log(JSON.stringify(vars, null, 2));
}

function main(): void {
  const { checkKeys } = parseArgs(process.argv.slice(2));
  const fixture = loadSpikeTestAssetJson();
  assertPinnedSpikeAssets(fixture);

  console.log(`# x402 spike runner — ${fixture.issue}\n`);
  console.log(`Primary test asset: ${X402_SPIKE_PRIMARY_ASSET.label}`);
  console.log(`Origin: ${fixture.originBaseUrl}${X402_SPIKE_PRIMARY_ASSET.originPathPattern}`);
  console.log(`Protected pattern: ${X402_SPIKE_PRIMARY_ASSET.proxyProtectedPattern}`);
  console.log(`Suggested price: ${X402_SPIKE_PRIMARY_ASSET.suggestedPriceUsd}`);

  printLatencyBudget();
  printCostTable();
  printWranglerSnippet();

  if (checkKeys) {
    console.log('\n## Live E2E key probe\n');
    for (const env of [
      'CLOUDFLARE_API_TOKEN',
      'X402_TEST_PRIVATE_KEY',
      'PAY_TO',
    ]) {
      console.log(`${env}: ${keyStatus(env)}`);
    }
    console.log('\nLive 402→pay→retry loop requires all three + wrangler deploy.');
  }

  console.log('\n## Live E2E blockers (human)\n');
  for (const blocker of fixture.liveE2eBlockers) {
    console.log(`- ${blocker}`);
  }
  console.log(
    '\nFull report: docs/product/x402-payment-gated-artist-resources-spike.md'
  );
}

main();
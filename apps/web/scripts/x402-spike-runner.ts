/**
 * x402 spike runner (GitHub #12750) — prints cost model + wrangler snippet.
 *
 *   pnpm --filter @jovie/web exec tsx apps/web/scripts/x402-spike-runner.ts
 */
import { compareX402Lanes } from '@/lib/x402-spike/cost-model';
import { totalFirstPaidRequestP50Ms } from '@/lib/x402-spike/latency-budget';
import { buildWranglerVarsSnippet } from '@/lib/x402-spike/protected-patterns';
import {
  X402_SPIKE_ISSUE,
  X402_SPIKE_PRIMARY_ASSET,
} from '@/lib/x402-spike/test-asset';

function main(): void {
  const lanes = compareX402Lanes();
  console.log(`# x402 spike — ${X402_SPIKE_ISSUE}\n`);
  console.log(`Primary asset: ${X402_SPIKE_PRIMARY_ASSET.label}`);
  console.log(`Pattern: ${X402_SPIKE_PRIMARY_ASSET.proxyProtectedPattern}`);
  console.log(`Price: ${X402_SPIKE_PRIMARY_ASSET.suggestedPriceUsd}`);
  console.log(`First-request latency (p50 est.): ${totalFirstPaidRequestP50Ms()}ms`);
  console.log(
    `Artist net @ $0.01: $${lanes.artistNetAtOneCent.toFixed(4)}`
  );
  console.log('\nWrangler vars:\n');
  console.log(JSON.stringify(buildWranglerVarsSnippet(), null, 2));
  console.log(
    '\nFull report: docs/product/x402-payment-gated-artist-resources-spike.md'
  );
}

main();
import { describe, expect, it } from 'vitest';
import {
  compareX402Lanes,
  estimateMonthlyVolume,
  getWorkerTemplateCostBreakdown,
  PAY_PER_CRAWL_ZONE_FLOOR_USD,
} from '@/lib/x402-spike/cost-model';
import {
  cookieAmortizedRequestP50Ms,
  totalFirstPaidRequestP50Ms,
} from '@/lib/x402-spike/latency-budget';
import {
  buildBotFilteredMcpPattern,
  buildJovieProtectedPatterns,
} from '@/lib/x402-spike/protected-patterns';
import {
  getTestAssetByKind,
  X402_SPIKE_DEMO_USERNAME,
  X402_SPIKE_ISSUE,
  X402_SPIKE_PRIMARY_ASSET,
  X402_SPIKE_TEST_ASSETS,
} from '@/lib/x402-spike/test-asset';

describe('x402 spike test assets (#12750)', () => {
  it('tracks the GitHub issue id', () => {
    expect(X402_SPIKE_ISSUE).toBe('JovieInc/Jovie#12750');
  });

  it('defines MCP + press-kit surfaces with distinct prices', () => {
    expect(X402_SPIKE_TEST_ASSETS).toHaveLength(2);
    const mcp = getTestAssetByKind('mcp-artist');
    const drop = getTestAssetByKind('press-kit-drop');
    expect(mcp?.suggestedPriceUsd).toBe('$0.01');
    expect(drop?.suggestedPriceUsd).toBe('$0.05');
  });

  it('pins lunawaves MCP as primary spike target', () => {
    expect(X402_SPIKE_PRIMARY_ASSET.kind).toBe('mcp-artist');
    expect(X402_SPIKE_DEMO_USERNAME).toBe('lunawaves');
    expect(X402_SPIKE_PRIMARY_ASSET.originPathPattern).toContain('lunawaves');
  });
});

describe('x402 protected patterns (#12750)', () => {
  it('maps each test asset to a wrangler pattern', () => {
    const patterns = buildJovieProtectedPatterns();
    expect(patterns).toHaveLength(X402_SPIKE_TEST_ASSETS.length);
    expect(patterns[0]?.pattern).toContain('lunawaves');
  });

  it('supports bot-filtered MCP pattern with detection ID exceptions', () => {
    const botPattern = buildBotFilteredMcpPattern();
    expect(botPattern.bot_score_threshold).toBe(30);
    expect(botPattern.except_detection_ids?.length).toBeGreaterThan(0);
  });
});

describe('x402 cost model (#12750)', () => {
  it('worker template minimum viable price is one cent', () => {
    const worker = getWorkerTemplateCostBreakdown();
    expect(worker.minimumViablePriceUsd).toBe(0.01);
    expect(worker.fullyLoadedPerTx).toBeLessThan(0.01);
  });

  it('pay-per-crawl zone floor exceeds per-tx rail cost alone', () => {
    const lanes = compareX402Lanes();
    expect(lanes.payPerCrawl.minimumViablePriceUsd).toBe(
      PAY_PER_CRAWL_ZONE_FLOOR_USD
    );
  });

  it('artist retains majority of revenue at five-cent MCP price', () => {
    const lanes = compareX402Lanes();
    expect(lanes.artistNetAtFiveCents).toBeGreaterThan(0.04);
  });

  it('estimates monthly volume with positive net at 100 calls/day', () => {
    const vol = estimateMonthlyVolume(100, 0.01);
    expect(vol.grossUsd).toBeCloseTo(30, 5);
    expect(vol.netUsd).toBeGreaterThan(0);
  });
});

describe('x402 latency budget (#12750)', () => {
  it('first paid request budget stays under 2s p50', () => {
    expect(totalFirstPaidRequestP50Ms()).toBeLessThan(2000);
  });

  it('cookie session amortizes to edge-only latency', () => {
    expect(cookieAmortizedRequestP50Ms()).toBeLessThan(100);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PRODUCT_CANON_RELATIVE_PATH =
  'docs/product/library-content-graph-and-artist-rules.md';
const ASSETS_IA_RELATIVE_PATH = 'docs/designs/library-assets-ia.md';
const BLOCKED_PLAN_RELATIVE_PATH =
  'docs/plans/library-content-graph-and-artist-rules.md';

function locateRepoFile(relativePath: string): string {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), '..', '..', relativePath),
    resolve(process.cwd(), '..', relativePath),
  ];
  const match = candidates.find(existsSync);
  if (!match) {
    throw new Error(`Unable to locate ${relativePath}`);
  }
  return match;
}

const productCanon = readFileSync(
  locateRepoFile(PRODUCT_CANON_RELATIVE_PATH),
  'utf8'
);
const assetsIa = readFileSync(locateRepoFile(ASSETS_IA_RELATIVE_PATH), 'utf8');

describe('Library product-first invariants', () => {
  it('locks Library as the visible post-release surface, not a license desk', () => {
    expect(productCanon).toContain(
      'The visible product name remains **Library**.'
    );
    expect(productCanon).toContain(
      'Library is the track-first post-release presence surface'
    );
    expect(productCanon).toContain(
      'Library never presents or promotes license sales.'
    );
    expect(productCanon).toContain(
      'Songview/MLC can observe composition claims only'
    );
  });

  it('satisfies JOV-INV-012 on existing telemetry surfaces', () => {
    expect(productCanon).toMatch(/^### Optimization contract$/m);
    expect(productCanon).toContain('kind: product');
    expect(productCanon).toContain('variantIdentity:');
    expect(productCanon).toContain('exposure:');
    expect(productCanon).toContain('outcome:');
    expect(productCanon).toContain('attribution:');
    expect(productCanon).toContain('contextDimensions:');
    expect(productCanon).toContain('hypothesis:');
    expect(productCanon).toContain('primaryMetric:');
    expect(productCanon).toContain('guardrails:');
    expect(productCanon).toContain('privacy:');
    expect(productCanon).toContain('optimizerOwner:');
    expect(productCanon).toContain('cadence:');
    expect(productCanon).toContain('decisionWriteback:');
    expect(productCanon).toContain('rollback:');
    expect(productCanon).toContain('apps/web/lib/analytics/metrics.ts');
    expect(productCanon).toContain(
      'apps/web/lib/db/schema/model-experiments.ts'
    );
    expect(productCanon).toContain(
      'apps/web/lib/audience/record-audience-event.ts'
    );
    expect(productCanon).toContain(
      'apps/web/lib/youtube-library/thumbnail-experiments.ts'
    );
    expect(productCanon).toContain(
      'apps/web/lib/release-to-revenue/gmv-attribution.ts'
    );
    expect(productCanon).toContain(
      'artist-business-outcome: paid conversion or attributed GMV'
    );
    expect(productCanon).not.toMatch(
      /primaryMetric:\s*(engagement|ctr|clicks?|impressions?|views?)/i
    );
  });

  it('marks the Assets IA as historical and does not reintroduce docs/plans', () => {
    expect(assetsIa).toContain('Status: superseded historical recommendation');
    expect(assetsIa).toContain('the visible product remains **Library**');
    expect(assetsIa).toContain(
      '../product/library-content-graph-and-artist-rules.md'
    );
    const blockedPlanCandidates = [
      resolve(process.cwd(), BLOCKED_PLAN_RELATIVE_PATH),
      resolve(process.cwd(), '..', '..', BLOCKED_PLAN_RELATIVE_PATH),
      resolve(process.cwd(), '..', BLOCKED_PLAN_RELATIVE_PATH),
    ];
    expect(blockedPlanCandidates.some(existsSync)).toBe(false);
  });
});

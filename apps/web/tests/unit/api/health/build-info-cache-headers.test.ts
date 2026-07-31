import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-1958: public production build-info must never inherit the general
 * `/api/*` s-maxage=300 rule. Health identity routes are declared after the
 * general API header block so no-store wins when sources merge.
 */
describe('build-info cache headers (JOV-1958)', () => {
  const nextConfigSource = readFileSync(
    resolve(process.cwd(), 'next.config.js'),
    'utf8'
  );

  it('declares health no-store headers after the general API cache rule', () => {
    const noStoreConstIndex = nextConfigSource.indexOf(
      'const healthNoStoreHeaders'
    );
    const apiCacheIndex = nextConfigSource.indexOf("source: '/api/(.*)'");
    const healthIndex = nextConfigSource.indexOf(
      "source: '/api/health/:path*'"
    );

    expect(noStoreConstIndex).toBeGreaterThanOrEqual(0);
    expect(apiCacheIndex).toBeGreaterThan(noStoreConstIndex);
    expect(healthIndex).toBeGreaterThan(apiCacheIndex);

    const noStoreBlock = nextConfigSource.slice(
      noStoreConstIndex,
      apiCacheIndex
    );
    expect(noStoreBlock).toContain('no-store');
    expect(noStoreBlock).toContain('CDN-Cache-Control');
    expect(noStoreBlock).toContain('Vercel-CDN-Cache-Control');
    expect(noStoreBlock).not.toMatch(/s-maxage=\d+/);

    const healthRuleBlock = nextConfigSource.slice(
      healthIndex,
      healthIndex + 200
    );
    expect(healthRuleBlock).toContain('headers: healthNoStoreHeaders');
  });

  it('does not pin build-info alone before the general API rule', () => {
    // Pre-fix order put /api/health/build-info first, so a merge/last-wins
    // Cache-Control could reintroduce public s-maxage on the identity receipt.
    const buildInfoOnlyIndex = nextConfigSource.indexOf(
      "source: '/api/health/build-info'"
    );
    expect(buildInfoOnlyIndex).toBe(-1);
  });
});

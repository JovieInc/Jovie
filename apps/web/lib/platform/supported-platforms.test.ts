import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getCoverage,
  getSupportedPlatform,
  LIFECYCLE_FAMILIES,
  SUPPORTED_PLATFORMS,
  SupportedPlatformSchema,
} from '@/lib/platform/supported-platforms';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

describe('supported platform/version matrix (JOV-6061)', () => {
  it('every entry conforms to the schema', () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      const result = SupportedPlatformSchema.safeParse(platform);
      expect(
        result.success,
        `${platform.id}: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      ).toBe(true);
    }
  });

  it('has unique platform ids', () => {
    const ids = SUPPORTED_PLATFORMS.map(platform => platform.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every declared platform class: web browsers, iOS, and desktop', () => {
    const ids = SUPPORTED_PLATFORMS.map(platform => platform.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'web-chromium',
        'web-webkit',
        'web-firefox',
        'ios-native',
        'desktop-electron',
      ])
    );
  });

  it('every platform declares every lifecycle family exactly once — no silent gaps', () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      const families = platform.lifecycleCoverage.map(c => c.family);
      expect([...families].sort()).toEqual([...LIFECYCLE_FAMILIES].sort());
      expect(new Set(families).size).toBe(LIFECYCLE_FAMILIES.length);
    }
  });

  it('every platform has an owned, explicit stale-client upgrade boundary', () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      expect(platform.owner.length).toBeGreaterThan(0);
      expect(platform.minSupported.length).toBeGreaterThan(0);
      expect(platform.upgradeBoundary.length).toBeGreaterThan(20);
      // The stale-client family must resolve to the declared boundary or a
      // real compatibility test — never left uncovered.
      const compat = getCoverage(platform.id, 'stale-client-compat');
      expect(compat?.status).toBe('covered');
      expect(compat?.evidence?.length).toBeGreaterThan(0);
    }
  });

  it('covered/partial families cite evidence; required families name the gap', () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      for (const coverage of platform.lifecycleCoverage) {
        if (coverage.status === 'required') {
          expect(
            coverage.gap?.length,
            `${platform.id}/${coverage.family} must name the gap`
          ).toBeGreaterThan(0);
        } else {
          expect(
            coverage.evidence?.length,
            `${platform.id}/${coverage.family} must cite evidence`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('deep links and auth callbacks are never silently uncovered on any platform', () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      const coverage = getCoverage(platform.id, 'deep-links-auth-callbacks');
      expect(coverage).toBeDefined();
      expect(
        (coverage?.evidence?.length ?? 0) + (coverage?.gap?.length ?? 0)
      ).toBeGreaterThan(0);
    }
  });

  it('repo-relative evidence pointers that look like paths actually exist', () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      for (const coverage of platform.lifecycleCoverage) {
        for (const evidence of coverage.evidence ?? []) {
          const [maybePath] = evidence.split(' ');
          if (
            /^(apps|docs|scripts)\//.test(maybePath) ||
            /\.md$/.test(maybePath)
          ) {
            expect(
              existsSync(join(REPO_ROOT, maybePath)),
              `${platform.id}/${coverage.family} cites missing file ${maybePath}`
            ).toBe(true);
          }
        }
      }
    }
  });

  it('getSupportedPlatform/getCoverage resolve known ids and return undefined for unknown', () => {
    expect(getSupportedPlatform('ios-native')?.title).toContain('iOS');
    expect(getCoverage('web-webkit', 'offline-reconnect')?.status).toBe(
      'required'
    );
    expect(getSupportedPlatform('nope')).toBeUndefined();
    expect(getCoverage('nope', 'offline-reconnect')).toBeUndefined();
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Screenshot tolerance guard (repo headroom audit, 2026-11-21).
 *
 * At threshold 0.2 a wrong page on a dark screen differs in very few pixels:
 * the retired Clerk "Configuration Error" card passed as /signin against the
 * real Better Auth form at 1.7% differing pixels, inside the old 8% allowance.
 * At threshold 0.1 the same swap differs in 8% of pixels. These limits keep
 * that swap failing with room to spare, in the shared configs and in every
 * spec that overrides them.
 */

const testDirectory = dirname(fileURLToPath(import.meta.url));
const webWorkspace = resolve(testDirectory, '../../..');
const e2eDirectory = resolve(webWorkspace, 'tests/e2e');

const SHARED_MAX_DIFF_PIXEL_RATIO = 0.02;
const SPEC_MAX_DIFF_PIXEL_RATIO = 0.05;
const MAX_THRESHOLD = 0.1;

function numbersAfter(source: string, key: string): number[] {
  const pattern = new RegExp(`\\b${key}:\\s*(\\d*\\.?\\d+)`, 'g');
  return [...source.matchAll(pattern)].map(match => Number(match[1]));
}

function read(relativePath: string): string {
  return readFileSync(resolve(webWorkspace, relativePath), 'utf8');
}

describe('visual screenshot tolerance', () => {
  it.each(['playwright.config.ts', 'playwright.config.storybook.ts'])(
    '%s keeps a wrong dark page failing',
    configPath => {
      const source = read(configPath);
      const ratios = numbersAfter(source, 'maxDiffPixelRatio');
      const thresholds = numbersAfter(source, 'threshold');

      expect(ratios.length).toBeGreaterThan(0);
      expect(thresholds.length).toBe(ratios.length);
      for (const ratio of ratios) {
        expect(ratio).toBeLessThanOrEqual(SHARED_MAX_DIFF_PIXEL_RATIO);
      }
      for (const threshold of thresholds) {
        expect(threshold).toBeLessThanOrEqual(MAX_THRESHOLD);
      }
    }
  );

  it('keeps per-spec overrides inside the wrong-page margin', () => {
    const specs = readdirSync(e2eDirectory).filter(name =>
      name.endsWith('.spec.ts')
    );
    const offenders: string[] = [];

    for (const spec of specs) {
      const source = readFileSync(resolve(e2eDirectory, spec), 'utf8');
      if (!/toHaveScreenshot|toMatchSnapshot/.test(source)) continue;
      for (const ratio of numbersAfter(source, 'maxDiffPixelRatio')) {
        if (ratio > SPEC_MAX_DIFF_PIXEL_RATIO) {
          offenders.push(`${spec}: maxDiffPixelRatio ${ratio}`);
        }
      }
      // Only fractional values: a per-pixel threshold is always below 1, and
      // integer `threshold:` keys in mocked API payloads are not tolerances.
      for (const threshold of numbersAfter(source, 'threshold')) {
        if (threshold < 1 && threshold > MAX_THRESHOLD) {
          offenders.push(`${spec}: threshold ${threshold}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

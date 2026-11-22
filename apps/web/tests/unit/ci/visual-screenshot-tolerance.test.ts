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
// A spec may keep a comparison above the per-spec limit only within a few lines
// under a `visual-tolerance-ratchet:` comment giving the reason, never looser
// than the old shared config (8% at threshold 0.2), and only this many times.
// The homepage holds the one entry until its stills get an approval receipt.
// All three numbers only go down.
const RATCHET_MARKER = 'visual-tolerance-ratchet:';
const RATCHET_WINDOW_LINES = 4;
const RATCHET_MAX_DIFF_PIXEL_RATIO = 0.08;
const RATCHET_MAX_THRESHOLD = 0.2;
const RATCHET_MAX_ENTRIES = 1;

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
    let ratchetEntries = 0;

    for (const spec of specs) {
      const source = readFileSync(resolve(e2eDirectory, spec), 'utf8');
      if (!/toHaveScreenshot|toMatchSnapshot/.test(source)) continue;
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        const marked = lines
          .slice(Math.max(0, index - RATCHET_WINDOW_LINES), index)
          .some(previous => previous.includes(RATCHET_MARKER));
        for (const ratio of numbersAfter(line, 'maxDiffPixelRatio')) {
          if (ratio <= SPEC_MAX_DIFF_PIXEL_RATIO) continue;
          if (marked && ratio <= RATCHET_MAX_DIFF_PIXEL_RATIO) {
            ratchetEntries += 1;
          } else {
            offenders.push(`${spec}:${index + 1}: maxDiffPixelRatio ${ratio}`);
          }
        }
        // Only fractional values: a per-pixel threshold is always below 1, and
        // integer `threshold:` keys in mocked API payloads are not tolerances.
        for (const threshold of numbersAfter(line, 'threshold')) {
          if (threshold >= 1 || threshold <= MAX_THRESHOLD) continue;
          if (!(marked && threshold <= RATCHET_MAX_THRESHOLD)) {
            offenders.push(`${spec}:${index + 1}: threshold ${threshold}`);
          }
        }
      });
    }

    expect(offenders).toEqual([]);
    expect(ratchetEntries).toBeLessThanOrEqual(RATCHET_MAX_ENTRIES);
  });
});

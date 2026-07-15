import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Design-system drift ratchet.
 *
 * Counts arbitrary Tailwind values (`w-[327px]`, `text-[#fff]`,
 * `data-[state=open]:…`) across the web surfaces. The count may only go
 * DOWN: every wave that converges screens onto the canonical Jovie Design
 * System tokens removes arbitrary values, never adds them.
 *
 * Why a ratchet and not zero-tolerance: there are ~6.6k existing arbitrary
 * values; banning them outright would block all work. The ratchet locks in
 * progress — regressions fail CI, improvements pass. When you reduce the
 * count, lower `count` in arbitrary-values.baseline.json in the same PR so
 * the floor follows the work down.
 *
 * Pattern mirrors apps/web/scripts/seo-ratchet-guard.mjs (baseline JSON +
 * source-text guard).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['components', 'app'].map(d => join(WEB_ROOT, d));
const BASELINE_PATH = join(__dirname, 'arbitrary-values.baseline.json');

// Tailwind arbitrary value: a utility/variant chain ending in `-[…]`.
// The `-[` signature avoids array-index false positives (`items[i]`).
const ARBITRARY = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]]+\]/gi;
const SOURCE_EXT = /\.(tsx|ts)$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
}

function countArbitraryValues(): number {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(dir, files);
  let total = 0;
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(ARBITRARY);
    if (matches) total += matches.length;
  }
  return total;
}

describe('design-system arbitrary-value ratchet', () => {
  it('arbitrary Tailwind values do not increase above the baseline', () => {
    const current = countArbitraryValues();

    // Self-seed on first run so the baseline and the count logic can never
    // diverge. Commit the seeded file; CI compares against it.
    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ count: current, note: 'Arbitrary Tailwind values in apps/web/{components,app}. Ratchet only goes down — lower this when a PR reduces the count.' }, null, 2)}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };

    expect(
      current,
      `Arbitrary Tailwind values rose to ${current} (baseline ${baseline.count}). ` +
        'Use design-system tokens instead of arbitrary values, or — if this is intentional — justify it in review.'
    ).toBeLessThanOrEqual(baseline.count);
  });
});

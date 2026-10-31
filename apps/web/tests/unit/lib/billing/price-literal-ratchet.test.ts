import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Hardcoded `$<digits>` price-literal ratchet (JOV-10183).
 *
 * Counts `$<digits>` price literals across the web UI surfaces
 * (`apps/web/app` and `apps/web/components`). The count may only go DOWN:
 * price copy must come from the canonical config (`lib/config/plan-prices.ts`,
 * surfaced through `lib/billing/offer-truth.ts` claims such as
 * `getPublicPriceClaim('pro')`), so a price change can never leave a stale
 * number baked into a surface.
 *
 * Why a ratchet and not zero-tolerance: existing surfaces (demo fixtures,
 * cron canaries, story args, regex replacement patterns) carry price-shaped
 * strings; banning them outright would block all work. The ratchet locks in
 * progress — regressions fail, conversions pass. When you remove literals,
 * lower `count` in price-literal.baseline.json in the SAME PR so the floor
 * follows the work down.
 *
 * Sibling of design-system raw-button-ratchet.test.ts — same
 * committed-baseline shape.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/lib/billing → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..', '..');
const SCAN_DIRS = ['components', 'app'].map(d => join(WEB_ROOT, d));
const BASELINE_PATH = join(__dirname, 'price-literal.baseline.json');

// A dollar sign immediately followed by digits: `$12`, `$12.99` (matches the
// `$12` head). Template-literal interpolation (`${...}`) is not matched — the
// `$` is followed by a brace, not a digit.
const PRICE_LITERAL = /\$\d+/g;
const SOURCE_EXT = /\.(tsx|ts)$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const s = entry.isSymbolicLink() ? statSync(full) : entry;
    if (s.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
    } else if (
      SOURCE_EXT.test(entry.name) &&
      !/\.test\.[tj]sx?$/.test(entry.name) &&
      !full.includes(`${sep}__tests__${sep}`)
    ) {
      out.push(full);
    }
  }
}

function countPriceLiterals(): number {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(dir, files);
  let total = 0;
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(PRICE_LITERAL);
    if (matches) total += matches.length;
  }
  return total;
}

describe('billing price-literal ratchet', () => {
  it('hardcoded $<digits> price literals do not increase above the baseline', () => {
    const current = countPriceLiterals();

    // Self-seed on first run so the baseline and the count logic can never
    // diverge. Commit the seeded file; CI compares against it.
    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ count: current, note: 'Hardcoded $<digits> price literals in apps/web/{components,app}. Ratchet only goes down — render price copy from lib/config/plan-prices.ts (via lib/billing/offer-truth) and lower this when a PR removes literals.' }, null, 2)}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };

    expect(
      current,
      `Hardcoded price literals rose to ${current} (baseline ${baseline.count}). ` +
        'Render price copy from lib/config/plan-prices.ts (for example via getPublicPriceClaim in lib/billing/offer-truth) ' +
        'so price changes cannot leave stale numbers on a surface.'
    ).toBeLessThanOrEqual(baseline.count);
  });
});

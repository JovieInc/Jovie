// Marketing plan prices come from offer truth only (2026-10-20).
//
// A hand-typed "$12/mo" in page copy can ship a price that billing does not
// sell (the $12 artist-profile pilot is approved but not yet published in
// lib/billing/offer-truth.ts, JOV-8368). Pages render plan prices through
// MarketingOfferSummary / getPublicPriceClaim instead. This guard scans the
// marketing source roots for recurring-price literals; the baseline only
// shrinks. Blog/editorial content (apps/web/content) may quote third-party
// prices and is out of scope.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '../../..');
const ROOTS = [
  'app/(home)',
  'app/(marketing)',
  'components/homepage',
  'components/marketing',
  'data',
] as const;
const SKIP = /\.(?:test|spec|stories)\.|\/__snapshots__\//;
const SOURCE = /\.(?:ts|tsx|md|mdx)$/;

/** "$12/mo", "$199 / month", "$12 per month", "$348/year", "$12 a month". */
const RECURRING_PRICE_LITERAL =
  /\$\s?\d[\d,.]*\s?(?:\/\s?(?:mo|month|yr|year)\b|per\s+(?:month|year)\b|a\s+(?:month|year)\b)/gi;

/** Files with grandfathered literals and their maximum count. Shrink only. */
const BASELINE: Readonly<Record<string, number>> = {
  // Copy-coverage fixtures that quote the current Pro claim verbatim.
  'data/marketing/renderedCopyCoverage.ts': 4,
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE.test(name) && !SKIP.test(path)) out.push(path);
  }
  return out;
}

function countPriceLiterals(source: string): number {
  return source.match(RECURRING_PRICE_LITERAL)?.length ?? 0;
}

function scan(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const root of ROOTS) {
    for (const file of walk(join(WEB_ROOT, root), [])) {
      const count = countPriceLiterals(readFileSync(file, 'utf8'));
      if (count > 0) counts[relative(WEB_ROOT, file)] = count;
    }
  }
  return counts;
}

describe('marketing offer price source guard', () => {
  it('detects recurring price literals (deliberate red)', () => {
    expect(countPriceLiterals('Claim yours for $12/mo.')).toBe(1);
    expect(countPriceLiterals('Pro is $199 / month or $348/year.')).toBe(2);
    expect(countPriceLiterals('Just $12 per month')).toBe(1);
    expect(countPriceLiterals('Turn a $10 busking tip into a fan.')).toBe(0);
    expect(countPriceLiterals('Free forever. No credit card.')).toBe(0);
  });

  it('keeps hand-typed plan prices out of marketing source', () => {
    const counts = scan();
    const grown = Object.entries(counts)
      .filter(([file, count]) => count > (BASELINE[file] ?? 0))
      .map(
        ([file, count]) =>
          `${file}: ${count} (baseline ${BASELINE[file] ?? 0}) — render prices with MarketingOfferSummary or getPublicPriceClaim from lib/billing/offer-truth.ts`
      );
    expect(grown).toEqual([]);
  });

  it('shrinks the baseline when a grandfathered literal is removed', () => {
    const counts = scan();
    const stale = Object.entries(BASELINE)
      .filter(([file, max]) => (counts[file] ?? 0) < max)
      .map(([file, max]) => `${file}: ${counts[file] ?? 0} < ${max}`);
    expect(stale).toEqual([]);
  });
});

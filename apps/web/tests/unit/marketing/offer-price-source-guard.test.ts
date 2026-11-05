// Plan prices come from offer truth only (2026-10-20, widened 2026-10-28).
//
// A hand-typed recurring price in page copy can drift from what billing
// sells. The $12 artist-profile offer is published in
// lib/billing/offer-truth.ts. Pages render plan prices through
// MarketingOfferSummary / getPublicPriceClaim instead. This guard scans the
// marketing source roots for recurring-price literals; the baseline only
// shrinks. Blog/editorial content (apps/web/content) may quote third-party
// prices and is out of scope.
//
// 2026-10-28 (Tim): a user shown a price on one page must be shown the same
// price everywhere. The scan now covers every customer-visible source root in
// the app and the docs site, not only marketing, strips code comments, and
// also flags the retired plan amounts ($39, $149, $199, $375, $1,430) so a
// stale price cannot reappear as a bare number.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '../../..');
const ROOTS = [
  'app',
  'components',
  'data',
  'constants',
  'lib/email',
  'lib/onboarding',
  'lib/billing',
  'lib/claim',
  'lib/auth',
  'lib/chat',
  '../docs/app',
  '../docs/components',
] as const;
const SKIP = /\.(?:test|spec|stories)\.|\/__snapshots__\//;
const SOURCE = /\.(?:ts|tsx|md|mdx)$/;

/** "$12/mo", "$199 / month", "$12 per month", "$348/year", "$12 a month". */
const RECURRING_PRICE_LITERAL =
  /\$\s?\d[\d,.]*\s?(?:\/\s?(?:mo|month|yr|year)\b|per\s+(?:month|year)\b|a\s+(?:month|year)\b|monthly\b|annually\b|yearly\b)|\$(?:39|149|199|375|1,?430)\b(?!\.)/gi;

/** Files with grandfathered literals and their maximum count. Shrink only. */
const BASELINE: Readonly<Record<string, number>> = {
  // Copy-coverage fixtures that quote the current Pro claim verbatim.
  'data/marketing/renderedCopyCoverage.ts': 4,
  // The forbidden-marker list that keeps $149 off /pricing names the amount.
  'lib/billing/offer-truth.ts': 1,
  // Demo fixture about fan-send spend, not a plan price.
  'components/organisms/home-loop/fixtures.ts': 1,
  // Internal rail decision record about the retired $199 offer.
  'lib/billing/commerce/RAIL_DECISIONS.md': 1,
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE.test(name) && !SKIP.test(path)) out.push(path);
  }
  return out;
}

/** Drops code comments: prose about a price in a comment is never displayed. */
function stripComments(source: string, file: string): string {
  if (!/\.(?:ts|tsx)$/.test(file)) return source;
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function countPriceLiterals(source: string, file = 'x.md'): number {
  return (
    stripComments(source, file).match(RECURRING_PRICE_LITERAL)?.length ?? 0
  );
}

function scan(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const root of ROOTS) {
    for (const file of walk(join(WEB_ROOT, root), [])) {
      const count = countPriceLiterals(readFileSync(file, 'utf8'), file);
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
    // A retired plan amount is red even without a cadence.
    expect(countPriceLiterals('Pro is $39 for growing artists.')).toBe(1);
    expect(countPriceLiterals('Max, $1,430 billed once.')).toBe(1);
    expect(countPriceLiterals('A $39.50 refund')).toBe(0);
    // Comments are not displayed, so they do not count.
    expect(countPriceLiterals('// was $12/month\nconst a = 1;', 'x.ts')).toBe(
      0
    );
    expect(countPriceLiterals('const a = "$12/month";', 'x.ts')).toBe(1);
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

import { describe, expect, it } from 'vitest';

import {
  countIn,
  scannable,
  tighten,
  violations,
} from '../../price-literal-guard.mjs';

describe('price-literal-guard', () => {
  it('counts $<digits> price literals in UI copy', () => {
    expect(countIn("const label = 'Start Pro ($12)';")).toBe(1);
    expect(countIn('<p>Pay $5, $10 or $20</p>')).toBe(3);
    expect(countIn("return '$0.00';")).toBe(1);
  });

  it('ignores template interpolation, identifiers, escapes and comments', () => {
    expect(countIn('const s = `${claim.priceLabel}${claim.cadence}`;')).toBe(0);
    expect(countIn('const x = a$2;')).toBe(0);
    expect(countIn("const re = '\\$5';")).toBe(0);
    expect(countIn('// was $199, now derived\nconst a = 1;')).toBe(0);
    expect(countIn('/** Entry of the $12/month claim. */')).toBe(0);
    expect(countIn("const u = 'https://jov.ie'; const p = '$12';")).toBe(1);
  });

  it('scans only apps/web app and components source, never tests', () => {
    expect(scannable('apps/web/components/x/Y.tsx')).toBe(true);
    expect(scannable('apps/web/app/waitlist/page.tsx')).toBe(true);
    expect(scannable('apps/web/lib/config/plan-prices.ts')).toBe(false);
    expect(scannable('apps/web/components/x/Y.test.tsx')).toBe(false);
    expect(scannable('apps/web/components/x/Y.stories.tsx')).toBe(false);
    expect(scannable('apps/web/app/x/tests/a.ts')).toBe(false);
  });

  it('flags growth and a new file, and only shrinks the ratchet', () => {
    expect(violations({ a: 2, b: 1 }, { a: 1 })).toEqual([
      { file: 'a', found: 2, allowed: 1 },
      { file: 'b', found: 1, allowed: 0 },
    ]);
    expect(tighten({ a: 1 }, { a: 3, b: 1 })).toEqual({ a: 1 });
  });
});

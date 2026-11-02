import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The pricing section rules are all zero-specificity :where() selectors, so
 * source order decides. The plans-section padding-top must come after every
 * section padding-block rule or it never applies (PR #23606 review).
 */
const css = readFileSync(
  resolve(
    process.cwd(),
    'components/marketing/artist-profile/ArtistProfileLandingPage.css'
  ),
  'utf8'
);

describe('pricing plans section padding', () => {
  it('declares the plans padding-top after the section padding-block rules', () => {
    const plansRule = css.lastIndexOf(
      ':where(.system-b-pricing-section--plans)'
    );
    const sectionRules = [
      ...css.matchAll(
        /:where\(\.system-b-pricing-section\),[^{]*\{[^}]*padding-block/g
      ),
    ].map(match => match.index ?? 0);

    expect(plansRule).toBeGreaterThan(-1);
    expect(sectionRules.length).toBeGreaterThan(0);
    expect(plansRule).toBeGreaterThan(Math.max(...sectionRules));
  });
});

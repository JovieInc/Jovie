import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DESIGN_SYSTEM = join(process.cwd(), 'styles', 'design-system.css');
const CLAIM_FOOTER = join(
  process.cwd(),
  'components/features/profile/ProfileClaimFooter.tsx'
);

/**
 * Walk 2026-11-09 (jov.ie/tim): the public profile stacked two brand footers,
 * "Made with Jovie" inside the card and "Jovie · Claim yours" under it. From
 * md up, where the claim footer renders, only the claim footer stays.
 */
describe('public profile brand footer', () => {
  it('hides the in-card Jovie mark from md up when the claim footer renders', () => {
    const css = readFileSync(DESIGN_SYSTEM, 'utf8');
    expect(css).toMatch(
      /@media \(min-width: 768px\)\s*\{\s*\.profile-viewport:has\(\[data-testid="profile-claim-footer"\]\)\s+\[data-testid="profile-jovie-branding"\]\s*\{\s*display:\s*none;/
    );
  });

  it('keeps the claim footer md+ only and branded with Jovie', () => {
    const source = readFileSync(CLAIM_FOOTER, 'utf8');
    expect(source).toContain("'hidden w-full justify-center pt-4 md:flex'");
    expect(source).toContain("data-testid='profile-claim-footer'");
    expect(source).toMatch(/<span className='text-on-media\/55'>Jovie<\/span>/);
  });
});

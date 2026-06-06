import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcePaths = {
  alternatives: 'app/(marketing)/alternatives/[slug]/page.tsx',
  checkout: 'app/onboarding/checkout/OnboardingCheckoutClient.tsx',
  compare: 'app/(marketing)/compare/[slug]/page.tsx',
} as const;

function readSource(sourcePath: string) {
  return readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
}

function expectCentralCtaUsesNeutralPrimary(
  sourcePath: string,
  source: string
) {
  expect(
    source,
    `${sourcePath} should not use accent-filled CTA classes`
  ).not.toMatch(/className='[^']*\bbg-accent-token\b[^']*\btext-white\b[^']*'/);
  expect(source, `${sourcePath} should use neutral primary CTA fill`).toContain(
    'bg-btn-primary'
  );
  expect(
    source,
    `${sourcePath} should use neutral primary CTA foreground`
  ).toContain('text-btn-primary-foreground');
}

describe('central conversion CTA neutral styling', () => {
  it('keeps static marketing CTAs on neutral primary button tokens', () => {
    for (const sourcePath of [
      sourcePaths.alternatives,
      sourcePaths.compare,
    ] as const) {
      expectCentralCtaUsesNeutralPrimary(sourcePath, readSource(sourcePath));
    }
  });

  it('keeps checkout upgrade CTA off accent button variants', () => {
    const checkoutSource = readSource(sourcePaths.checkout);

    expect(checkoutSource).not.toContain("variant='accent'");
    expect(checkoutSource).not.toContain('variant="accent"');
    expect(checkoutSource).toContain("variant='primary'");
  });
});

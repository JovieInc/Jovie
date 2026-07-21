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

function extractClassNameValues(source: string) {
  const values: string[] = [];
  const classNamePattern =
    /className\s*=\s*(?:"([^"]*)"|'([^']*)'|{\s*`([^`]*)`\s*}|{\s*(['"])([\s\S]*?)\4\s*}|{([\s\S]*?)})/g;

  for (const match of source.matchAll(classNamePattern)) {
    values.push(match[1] ?? match[2] ?? match[3] ?? match[5] ?? match[6] ?? '');
  }

  return values.join('\n');
}

function expectCentralCtaUsesNeutralPrimary(
  sourcePath: string,
  source: string
) {
  const classNames = extractClassNameValues(source);

  expect(
    classNames,
    `${sourcePath} should not use accent-filled CTA classes`
  ).not.toMatch(
    /\bbg-accent-token\b[\s\S]*\btext-white\b|\btext-white\b[\s\S]*\bbg-accent-token\b/
  );
  // The canonical CTA is the @jovie/ui Button primary variant (white-on-black
  // neutral fill via bg-btn-primary/text-btn-primary-foreground tokens).
  expect(
    source,
    `${sourcePath} should render the central CTA via the neutral primary Button variant`
  ).toContain("variant='primary'");
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

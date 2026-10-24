import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const marketingPlansPath =
  'components/features/pricing/MarketingPricingPlans.tsx';
const globalsPath = 'app/globals.css';

function readSource(sourcePath: string) {
  return readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
}

describe('pricing CTA neutral styling source contract', () => {
  it('keeps reusable marketing pricing cards neutral by default', () => {
    const source = readSource(marketingPlansPath);

    expect(source).not.toMatch(
      /marketing-pricing-plan-card--\$\{plan\.accent\}/
    );
  });

  it('keeps marketing pricing card CSS free of default plan-color glows', () => {
    const source = readSource(globalsPath);

    expect(source).not.toContain('--marketing-plan-accent');
    expect(source).not.toMatch(
      /marketing-pricing-plan-card--(?:blue|pink|violet)/
    );
    expect(source).not.toMatch(/#(?:00c8ff|1463ff|ff3b8a|7b2cff)/i);
  });
});

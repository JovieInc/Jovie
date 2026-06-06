import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readSource(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('onboarding conversion action System B styling', () => {
  const checkoutSource = readSource(
    'app/onboarding/checkout/OnboardingCheckoutClient.tsx'
  );
  const handleSource = readSource(
    'components/features/dashboard/organisms/onboarding/OnboardingHandleStep.tsx'
  );

  it('keeps the checkout upgrade CTA on neutral primary button tokens', () => {
    expect(checkoutSource).not.toContain("variant='accent'");
    expect(checkoutSource).not.toContain('variant="accent"');
    expect(checkoutSource).not.toContain('bg-accent text-accent-foreground');
    expect(checkoutSource).not.toContain('text-on-accent');

    expect(checkoutSource).toContain("variant='primary'");
  });

  it('keeps the handle claim submit button neutral and fixed-size', () => {
    expect(handleSource).not.toContain('bg-accent text-white');
    expect(handleSource).not.toContain('hover:bg-accent-hover');
    expect(handleSource).not.toContain('text-accent-foreground');

    expect(handleSource).toContain('h-10 w-10');
    expect(handleSource).toContain('bg-btn-primary');
    expect(handleSource).toContain('text-btn-primary-foreground');
    expect(handleSource).toContain('hover:bg-btn-primary-hover');
  });
});

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PayLanding } from '@/components/features/pay/PayLanding';

vi.mock('@/features/home/claim-handle', () => ({
  ClaimHandleForm: () => (
    <form aria-label='Claim handle'>
      <input aria-label='Choose your handle' type='text' />
      <button type='submit'>Claim</button>
    </form>
  ),
}));

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(appRoot, 'components/features/pay/PayLanding.tsx');

const inlineStylePattern = /style=\{\{/;
const rawAlphaColorPattern = /\brgba?\(/i;
const rawGradientPattern = /(?:linear|radial)-gradient/i;
const directPrimaryActionPattern = /public-action-primary|Claim Your Handle/;

describe('pay landing System B source contract', () => {
  it('keeps the claim handle surface on shared System B primitives', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(inlineStylePattern);
    expect(source).not.toMatch(rawAlphaColorPattern);
    expect(source).not.toMatch(rawGradientPattern);
    expect(source).not.toMatch(directPrimaryActionPattern);
    expect(source).not.toContain("from '@jovie/ui'");
    expect(source).not.toContain('@/constants/routes');
    expect(source).toContain('MarketingPageShell');
    expect(source).toContain('bg-base text-primary-token');
    expect(source.match(/<ClaimHandleForm/g) ?? []).toHaveLength(2);
  });

  it('keeps the final claim section to the handle form action path', () => {
    render(<PayLanding />);

    const finalHeading = screen.getByRole('heading', {
      name: /start turning payments into fans/i,
    });
    const finalSection = finalHeading.closest('section');

    expect(finalSection).not.toBeNull();

    const finalScope = within(finalSection as HTMLElement);
    expect(
      finalScope.getByRole('textbox', { name: /choose your handle/i })
    ).toBeInTheDocument();
    expect(
      finalScope.getByRole('button', { name: 'Claim' })
    ).toBeInTheDocument();
    expect(finalScope.queryByRole('link')).not.toBeInTheDocument();

    const finalControls = finalSection?.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="textbox"]'
    );
    expect(finalControls).toHaveLength(2);
  });
});

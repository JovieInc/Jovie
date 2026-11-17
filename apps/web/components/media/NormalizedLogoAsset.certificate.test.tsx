import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NormalizedLogoAsset } from './NormalizedLogoAsset';
import { getTrustLogoAsset } from './trustLogoAssets';

const umg = getTrustLogoAsset('umg');
const Logo = umg.component;

describe('NormalizedLogoAsset certificate', () => {
  it.each(['natural', 'contain'] as const)(
    'renders the %s frame with its logo axe-clean',
    async fit => {
      const { container } = render(
        <NormalizedLogoAsset asset={umg.normalization} fit={fit}>
          <Logo aria-label={umg.label} />
        </NormalizedLogoAsset>
      );

      const frame = container.querySelector(
        `[data-logo-asset="${umg.normalization.id}"]`
      );
      expect(frame).not.toBeNull();
      expect(screen.getByLabelText(umg.label)).toBeInTheDocument();
      if (fit === 'contain') expect(frame).toHaveClass('max-w-full');
      else expect(frame).not.toHaveClass('max-w-full');
      await expectNoA11yViolations(container);
    }
  );

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <NormalizedLogoAsset asset={umg.normalization} className='w-16'>
          <Logo aria-label={umg.label} />
        </NormalizedLogoAsset>
      </div>
    );

    expect(
      container.querySelector(`[data-logo-asset="${umg.normalization.id}"]`)
    ).toHaveClass('w-16');
    await expectNoA11yViolations(container);
  });
});

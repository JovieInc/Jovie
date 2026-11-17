import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NormalizedTrustLogo } from './NormalizedTrustLogo';
import { getTrustLogoAsset } from './trustLogoAssets';

describe('NormalizedTrustLogo certificate', () => {
  it.each(['umg', 'armada'] as const)(
    'renders the %s logo by its label axe-clean',
    async id => {
      const asset = getTrustLogoAsset(id);
      const { container } = render(
        <NormalizedTrustLogo id={id} className='w-32' />
      );

      expect(screen.getByLabelText(asset.label)).toBeInTheDocument();
      expect(
        container.querySelector(`[data-logo-asset="${asset.normalization.id}"]`)
      ).toHaveClass('w-32');
      await expectNoA11yViolations(container);
    }
  );

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <NormalizedTrustLogo id='umg' />
      </div>
    );

    expect(
      screen.getByLabelText(getTrustLogoAsset('umg').label)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

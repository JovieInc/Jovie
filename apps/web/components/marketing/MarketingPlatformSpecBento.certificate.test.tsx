import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PLATFORM_SPEC_TILES } from '@/data/marketingShowcaseSpecCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingPlatformSpecBento } from './MarketingPlatformSpecBento';

// Axe coverage for the fixed bento; its copy contract lives in
// MarketingPlatformSpecBento.test.tsx.
describe('MarketingPlatformSpecBento a11y', () => {
  it('gives every tile a heading and a named capture', async () => {
    const { container } = render(<MarketingPlatformSpecBento />);
    const tiles = screen.getAllByTestId('platform-spec-tile');
    tiles.forEach((tile, index) => {
      const spec = PLATFORM_SPEC_TILES[index];
      expect(
        within(tile).getByRole('heading', { level: 3, name: spec.title })
      ).toBeInTheDocument();
      expect(within(tile).getByRole('img', { name: spec.alt })).toBeVisible();
    });
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document with a custom test id', async () => {
    const { container } = render(
      <div dir='rtl'>
        <MarketingPlatformSpecBento testId='spec-bento-rtl' />
      </div>
    );
    expect(screen.getByTestId('spec-bento-rtl')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

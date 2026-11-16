import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  PROFILE_STATE_TILES,
  SHIPPED_SITES_SHOWCASE_COPY,
} from '@/data/marketingShowcaseSpecCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingShippedSitesShowcase } from './MarketingShippedSitesShowcase';

// Keyboard and axe coverage; the tile contract lives in
// MarketingShippedSitesShowcase.test.tsx.
describe('MarketingShippedSitesShowcase a11y', () => {
  it('reaches the live profile link by keyboard and names every tile', async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingShippedSitesShowcase />);
    const live = screen.getByRole('link', {
      name: SHIPPED_SITES_SHOWCASE_COPY.liveProfileLabel,
    });
    expect(live).toHaveAttribute(
      'href',
      SHIPPED_SITES_SHOWCASE_COPY.liveProfileHref
    );
    await user.tab();
    expect(live).toHaveFocus();

    const tiles = screen.getAllByTestId('shipped-site-tile');
    expect(tiles[0]).toHaveClass('m-shipped-sites__lead');
    tiles.forEach((tile, index) => {
      expect(
        within(tile).getByRole('heading', {
          level: 3,
          name: PROFILE_STATE_TILES[index].title,
        })
      ).toBeInTheDocument();
    });
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document with a custom test id', async () => {
    const { container } = render(
      <div dir='rtl'>
        <MarketingShippedSitesShowcase testId='gallery-rtl' />
      </div>
    );
    expect(screen.getByTestId('gallery-rtl')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

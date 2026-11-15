import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LibraryShareAssetLayouts } from './LibraryShareAssetLayouts';

const asset: LibraryShareDropAsset = {
  id: 'item-1',
  releaseId: 'release-1',
  title: 'Midnight Drive',
  artistName: 'Tim White',
  artworkUrl: 'https://example.com/art.jpg',
  previewUrl: null,
  lyrics: null,
  releaseType: 'single',
  releaseDate: '2026-01-15T00:00:00.000Z',
  smartLinkPath: '/timwhite/midnight-drive',
  includeArtwork: true,
  includePreview: false,
  includeLyrics: false,
};
const second = {
  ...asset,
  id: 'item-2',
  releaseId: 'release-2',
  title: 'Signals',
};

describe('LibraryShareAssetLayouts', () => {
  it('says the drop is empty when it has no assets', async () => {
    const { container } = render(
      <LibraryShareAssetLayouts assets={[]} layout='grid' downloadsEnabled />
    );

    expect(screen.getByTestId('library-share-empty')).toHaveTextContent(
      'No assets in this drop yet.'
    );
    await expectNoA11yViolations(container);
  });

  it.each([
    ['grid', 'library-share-layout-grid'],
    ['list', 'library-share-layout-list'],
    ['reel', 'library-share-layout-reel'],
  ] as const)(
    'renders every asset in the %s layout',
    async (layout, testId) => {
      const { container } = render(
        <LibraryShareAssetLayouts
          assets={[asset, second]}
          layout={layout}
          downloadsEnabled={false}
        />
      );

      const region = screen.getByTestId(testId);
      expect(within(region).getAllByRole('article')).toHaveLength(2);
      expect(within(region).getByText('Midnight Drive')).toBeInTheDocument();
      expect(within(region).getByText('Signals')).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('keeps long and Arabic titles axe-clean', async () => {
    const longTitle =
      'Midnight Drive (Extended Sunrise Mix featuring the Whole Band, Live from the Rooftop)';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LibraryShareAssetLayouts
          assets={[
            { ...asset, title: longTitle },
            { ...second, title: 'إشارات' },
          ]}
          layout='list'
          downloadsEnabled
        />
      </div>
    );

    expect(screen.getByText(longTitle)).toBeInTheDocument();
    expect(screen.getByText('إشارات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

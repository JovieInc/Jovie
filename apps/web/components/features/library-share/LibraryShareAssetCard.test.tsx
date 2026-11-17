import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LibraryShareAssetCard } from './LibraryShareAssetCard';

const asset: LibraryShareDropAsset = {
  id: 'item-1',
  releaseId: 'release-1',
  title: 'Midnight Drive',
  artistName: 'Tim White',
  artworkUrl: 'https://example.com/art.jpg',
  previewUrl: 'https://example.com/preview.mp3',
  lyrics: 'Lyrics',
  releaseType: 'ep',
  releaseDate: '2026-01-15T00:00:00.000Z',
  smartLinkPath: '/timwhite/midnight-drive',
  includeArtwork: true,
  includePreview: true,
  includeLyrics: true,
};

describe('LibraryShareAssetCard', () => {
  it('shows the type, title, date and every enabled action in tab order', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LibraryShareAssetCard asset={asset} downloadsEnabled layout='grid' />
    );

    const eyebrow = screen.getByText('EP');
    expect(eyebrow).not.toHaveClass('uppercase');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Midnight Drive' })
    ).toBeInTheDocument();
    expect(screen.getByText('Jan 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('Lyrics included')).toBeInTheDocument();

    const smartLink = screen.getByRole('link', { name: 'Open smart link' });
    const download = screen.getByRole('link', { name: 'Download preview' });
    expect(smartLink).toHaveAttribute('href', '/timwhite/midnight-drive');
    expect(download).toHaveAttribute('href', 'https://example.com/preview.mp3');
    expect(download).toHaveAttribute('download');

    await user.tab();
    expect(smartLink).toHaveFocus();
    await user.tab();
    expect(download).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('sentence-cases single and album and keeps unknown types readable', () => {
    const { rerender } = render(
      <LibraryShareAssetCard
        asset={{ ...asset, releaseType: 'single' }}
        downloadsEnabled={false}
        layout='list'
      />
    );
    expect(screen.getByText('Single')).toBeInTheDocument();

    rerender(
      <LibraryShareAssetCard
        asset={{ ...asset, releaseType: 'album' }}
        downloadsEnabled={false}
        layout='list'
      />
    );
    expect(screen.getByText('Album')).toBeInTheDocument();

    rerender(
      <LibraryShareAssetCard
        asset={{ ...asset, releaseType: 'mixtape' }}
        downloadsEnabled={false}
        layout='reel'
      />
    );
    expect(screen.getByText('Mixtape')).toBeInTheDocument();
  });

  it('hides the download and lyrics when downloads are off or the asset has none', async () => {
    const { container } = render(
      <LibraryShareAssetCard
        asset={{
          ...asset,
          artworkUrl: null,
          releaseDate: null,
          includeLyrics: false,
        }}
        downloadsEnabled={false}
        layout='list'
      />
    );

    expect(screen.getByText('No release date')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Download preview' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Lyrics included')).not.toBeInTheDocument();
    expect(container.querySelector('svg.lucide-audio-lines')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('truncates a long title and stays axe-clean right to left', async () => {
    const title = 'منتصف الليل على الطريق السريع، النسخة الموسعة مع كل المقاطع';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LibraryShareAssetCard
          asset={{ ...asset, title }}
          downloadsEnabled
          layout='grid'
        />
      </div>
    );

    expect(screen.getByRole('heading', { level: 2, name: title })).toHaveClass(
      'truncate'
    );
    await expectNoA11yViolations(container);
  });
});

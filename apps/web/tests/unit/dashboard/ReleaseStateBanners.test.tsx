import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReleaseStateBanners } from '@/features/dashboard/organisms/release-provider-matrix/ReleaseStateBanners';

describe('ReleaseStateBanners', () => {
  it('keeps the import banner slot mounted across import state changes', () => {
    const props = {
      rows: [],
      showReleasesTable: false,
      artistName: 'The 1975',
      importedCount: 0,
      totalCount: 10,
      isAppleMusicConnected: false,
      isImporting: false,
      isSpotifyConnected: true,
      isPro: true,
      canAccessFutureReleases: true,
      releasedCount: 0,
      unreleasedCount: 0,
      onAppleMusicMatchStatusChange: () => {},
    };

    const { rerender } = render(
      <ReleaseStateBanners {...props} showImportProgress={false} />
    );

    const slot = screen.getByTestId('release-import-progress-slot');
    expect(slot).toHaveClass('min-h-15');
    expect(
      screen.getByTestId('spotify-import-progress-banner')
    ).toHaveAttribute('aria-hidden', 'true');

    rerender(<ReleaseStateBanners {...props} showImportProgress />);

    expect(screen.getByTestId('release-import-progress-slot')).toBe(slot);
    expect(
      screen.getByTestId('spotify-import-progress-banner')
    ).toHaveAttribute('aria-hidden', 'false');
  });
});

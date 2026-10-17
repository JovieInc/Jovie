import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppleMusicSyncBanner } from '@/features/dashboard/organisms/release-provider-matrix/AppleMusicSyncBanner';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { DspMatch } from '@/lib/queries/useDspMatchesQuery';

const { useDspMatchesQuery } = vi.hoisted(() => ({
  useDspMatchesQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/lib/queries', () => ({
  useDspMatchesQuery,
  useConfirmDspMatchMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useRejectDspMatchMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

describe('AppleMusicSyncBanner', () => {
  it('does not enable its standalone eligibility query when the shell owns loading state', () => {
    render(
      <AppleMusicSyncBanner
        profileId='profile-1'
        spotifyConnected
        releases={[]}
        matches={[]}
        isLoading={false}
      />
    );

    expect(useDspMatchesQuery).toHaveBeenCalledWith({
      profileId: 'profile-1',
      enabled: false,
    });
  });

  it.each([true, false])(
    'keeps a discovered Apple profile awaiting an artist decision when confidence is unknown (compact %s)',
    compact => {
      const onMatchStatusChange = vi.fn();
      const match: DspMatch = {
        id: 'unknown',
        providerId: 'apple_music',
        externalArtistId: '123',
        externalArtistName: 'Uninspected Artist',
        externalArtistUrl: null,
        externalArtistImageUrl: null,
        confidenceScore: null,
        confidenceBreakdown: null,
        matchingIsrcCount: 0,
        matchingUpcCount: 0,
        totalTracksChecked: 0,
        status: 'suggested',
        createdAt: '2026-10-14T00:00:00Z',
        updatedAt: '2026-10-14T00:00:00Z',
      };
      render(
        <AppleMusicSyncBanner
          profileId='profile-1'
          spotifyConnected
          compact={compact}
          releases={[{ providers: [] } as unknown as ReleaseViewModel]}
          matches={[match]}
          isLoading={false}
          onMatchStatusChange={onMatchStatusChange}
        />
      );
      expect(
        screen.getByText(
          compact ? 'Match: Uninspected Artist' : 'Uninspected Artist'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Confirm' })
      ).toBeInTheDocument();
      expect(screen.queryByText('0%')).not.toBeInTheDocument();
      expect(onMatchStatusChange).not.toHaveBeenCalled();
    }
  );
});

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppleMusicSyncBanner } from '@/features/dashboard/organisms/release-provider-matrix/AppleMusicSyncBanner';

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
});

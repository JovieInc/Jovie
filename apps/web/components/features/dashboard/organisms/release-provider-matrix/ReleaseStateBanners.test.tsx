import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { DspMatch } from '@/lib/queries/useDspMatchesQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useDspMatchesQuery: () => ({ data: [], isLoading: false }),
  useConfirmDspMatchMutation: () => ({
    isPending: false,
    mutate: mocks.confirm,
  }),
  useRejectDspMatchMutation: () => ({ isPending: false, mutate: mocks.reject }),
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

vi.mock('@/lib/queries/usePlanGate', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/queries/usePlanGate')
  >('@/lib/queries/usePlanGate');
  return { ...actual, usePlanGate: () => ({ nudgeState: 'never_trialed' }) };
});

import { ReleaseStateBanners } from './ReleaseStateBanners';

type Props = ComponentProps<typeof ReleaseStateBanners>;

const row = {
  profileId: 'profile-1',
  providers: [],
} as unknown as ReleaseViewModel;

const match: DspMatch = {
  id: 'match-1',
  providerId: 'apple_music',
  externalArtistId: 'apple-artist-1',
  externalArtistName: 'Sasha Waves',
  externalArtistUrl: null,
  externalArtistImageUrl: null,
  confidenceScore: 0.92,
  confidenceBreakdown: null,
  matchingIsrcCount: 12,
  matchingUpcCount: 2,
  totalTracksChecked: 14,
  status: 'suggested',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function renderBanners(overrides: Partial<Props> = {}) {
  const onAppleMusicMatchStatusChange = vi.fn();
  const view = render(
    <ReleaseStateBanners
      rows={[row]}
      appleMusicMatches={[match]}
      isAppleMusicEligibilityLoading={false}
      showImportProgress={false}
      showReleasesTable
      artistName='Sasha Waves'
      importedCount={0}
      totalCount={0}
      isAppleMusicConnected={false}
      isImporting={false}
      isSpotifyConnected
      isPro={false}
      canAccessFutureReleases={false}
      releasedCount={104}
      unreleasedCount={2}
      onAppleMusicMatchStatusChange={onAppleMusicMatchStatusChange}
      {...overrides}
    />
  );
  return { ...view, onAppleMusicMatchStatusChange };
}

describe('ReleaseStateBanners certificate', () => {
  beforeEach(() => {
    mocks.confirm.mockClear();
    mocks.reject.mockClear();
  });

  it('stacks the Apple Music match and both free-plan notices, and confirms the match', async () => {
    const user = userEvent.setup();
    const { container } = renderBanners();

    expect(screen.getByText('Sasha Waves')).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Smart link limit notice' })
    ).toHaveTextContent('You have 104 smart links');
    expect(
      screen.getByRole('complementary', { name: 'Smart link upgrade prompt' })
    ).toHaveTextContent('You have 2 upcoming releases');
    expect(
      screen.getByTestId('spotify-import-progress-banner')
    ).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(mocks.confirm).toHaveBeenCalledWith({
      matchId: 'match-1',
      profileId: 'profile-1',
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mocks.reject).toHaveBeenCalledWith({
      matchId: 'match-1',
      profileId: 'profile-1',
    });
  });

  it('tells the parent when the Apple Music match is already confirmed', () => {
    const { onAppleMusicMatchStatusChange } = renderBanners({
      appleMusicMatches: [{ ...match, status: 'auto_confirmed' }],
    });

    expect(onAppleMusicMatchStatusChange).toHaveBeenCalledWith(
      true,
      'Sasha Waves'
    );
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('shows import progress and holds back the Apple Music banner while importing', async () => {
    const { container } = renderBanners({
      showImportProgress: true,
      isImporting: true,
      importedCount: 4,
      totalCount: 12,
    });

    expect(
      screen.getByTestId('spotify-import-progress-banner')
    ).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('4 of 12 imported')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it.each<[string, Partial<Props>]>([
    ['the table is hidden', { showReleasesTable: false }],
    [
      'the plan is paid and Apple Music is connected',
      { isPro: true, isAppleMusicConnected: true },
    ],
    [
      'there are no rows and the counts are under every cap',
      { rows: [], releasedCount: 100, unreleasedCount: 0 },
    ],
  ])(
    'renders only the reserved import slot when %s',
    async (_label, overrides) => {
      const { container } = renderBanners(overrides);

      expect(
        screen.getByTestId('release-import-progress-slot')
      ).toBeInTheDocument();
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );

  it('drops the unreleased prompt once future releases are unlocked', () => {
    renderBanners({ canAccessFutureReleases: true });

    expect(
      screen.getByRole('complementary', { name: 'Smart link limit notice' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Smart link upgrade prompt' })
    ).toBeNull();
  });
});

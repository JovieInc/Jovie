import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  matches: [] as unknown[],
  confirm: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useDspMatchesQuery: () => ({ data: mocks.matches, isLoading: false }),
  useConfirmDspMatchMutation: () => ({
    isPending: false,
    mutate: mocks.confirm,
  }),
  useRejectDspMatchMutation: () => ({ isPending: false, mutate: vi.fn() }),
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

vi.mock('./ReleasePlanWizard', () => ({
  ReleasePlanWizard: ({
    releaseTitle,
    isGateLoading,
    canGenerateReleasePlans,
    isGeneratingReleasePlan,
    onClose,
    onSubmit,
  }: {
    releaseTitle: string;
    isGateLoading: boolean;
    canGenerateReleasePlans: boolean;
    isGeneratingReleasePlan: boolean;
    onClose: () => void;
    onSubmit: () => Promise<void>;
  }) => (
    <div
      role='dialog'
      aria-label={`Plan ${releaseTitle}`}
      data-gate-loading={String(isGateLoading)}
      data-can-generate={String(canGenerateReleasePlans)}
      data-generating={String(isGeneratingReleasePlan)}
    >
      <button type='button' onClick={onClose}>
        Close
      </button>
      <button type='button' onClick={() => void onSubmit()}>
        Generate
      </button>
    </div>
  ),
}));

import {
  ConnectedReleaseEmptyState,
  ReleaseAppleMusicSyncNotice,
  ReleaseImportProgressNotice,
  ReleasePlanDialog,
  ReleaseSmartLinkNotices,
} from './ReleaseProviderMatrixNotices';

const release = {
  id: 'release-1',
  profileId: 'profile-1',
  title: 'Skyline Dreams',
  providers: [],
} as unknown as ReleaseViewModel;

describe('ReleaseProviderMatrixNotices certificate', () => {
  beforeEach(() => {
    mocks.matches = [];
    mocks.confirm.mockClear();
  });

  describe('ConnectedReleaseEmptyState', () => {
    it('syncs from Spotify or starts a manual release', async () => {
      const user = userEvent.setup();
      const onSync = vi.fn();
      const onCreateManual = vi.fn();
      const { container } = render(
        <ConnectedReleaseEmptyState
          visible
          canCreateManualReleases
          isSyncing={false}
          onSync={onSync}
          onCreateManual={onCreateManual}
        />
      );

      expect(
        screen.getByRole('heading', { name: 'No Releases Yet' })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Sync from Spotify or create one manually to start generating smart links.'
        )
      ).toBeInTheDocument();
      await expectNoA11yViolations(container);

      await user.click(
        screen.getByRole('button', { name: 'Sync from Spotify' })
      );
      expect(onSync).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Create Release' }));
      expect(onCreateManual).toHaveBeenCalledTimes(1);
    });

    it('disables sync while syncing and omits manual creation off-plan', async () => {
      const user = userEvent.setup();
      const onSync = vi.fn();
      const { container } = render(
        <ConnectedReleaseEmptyState
          visible
          canCreateManualReleases={false}
          isSyncing
          onSync={onSync}
          onCreateManual={vi.fn()}
        />
      );

      const sync = screen.getByRole('button', { name: 'Syncing...' });
      expect(sync).toBeDisabled();
      await user.click(sync);
      expect(onSync).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: 'Create Release' })
      ).toBeNull();
      expect(
        screen.getByText('Sync from Spotify to start generating smart links.')
      ).toBeInTheDocument();
      await expectNoA11yViolations(container);
    });
  });

  describe('ReleaseImportProgressNotice', () => {
    it('reserves its slot and shows progress once the banner loads', async () => {
      const { container } = render(
        <ReleaseImportProgressNotice
          visible
          artistName='Sasha Waves'
          importedCount={4}
          totalCount={12}
        />
      );

      expect(screen.getByTestId('release-import-progress-slot')).toHaveClass(
        'min-h-15'
      );
      expect(await screen.findByText('4 of 12 imported')).toBeInTheDocument();
      expect(
        screen.getByTestId('spotify-import-progress-banner')
      ).toHaveAttribute('aria-hidden', 'false');
      await expectNoA11yViolations(container);
    });

    it('keeps the banner mounted but hidden when not visible', async () => {
      render(
        <ReleaseImportProgressNotice
          visible={false}
          artistName={null}
          importedCount={0}
          totalCount={0}
        />
      );

      expect(
        await screen.findByTestId('spotify-import-progress-banner')
      ).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('ReleaseAppleMusicSyncNotice', () => {
    const base = {
      showReleasesTable: true,
      profileId: 'profile-1',
      isAppleMusicConnected: false,
      isImporting: false,
      spotifyConnected: true,
      releases: [release],
      onMatchStatusChange: vi.fn(),
    };

    it('offers a suggested Apple Music match and confirms it', async () => {
      const user = userEvent.setup();
      mocks.matches = [
        {
          id: 'match-1',
          providerId: 'apple_music',
          externalArtistName: 'Sasha Waves',
          externalArtistUrl: null,
          confidenceScore: 0.9,
          status: 'suggested',
        },
      ];
      const { container } = render(<ReleaseAppleMusicSyncNotice {...base} />);

      expect(await screen.findByText('Sasha Waves')).toBeInTheDocument();
      await expectNoA11yViolations(container);
      await user.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(mocks.confirm).toHaveBeenCalledWith({
        matchId: 'match-1',
        profileId: 'profile-1',
      });
    });

    it.each([
      ['the table is hidden', { showReleasesTable: false }],
      ['there is no profile', { profileId: null }],
      ['Apple Music is connected', { isAppleMusicConnected: true }],
      ['an import is running', { isImporting: true }],
    ])('renders nothing when %s', (_case, overrides) => {
      const { container } = render(
        <ReleaseAppleMusicSyncNotice {...base} {...overrides} />
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('ReleaseSmartLinkNotices', () => {
    const base = {
      showReleasesTable: true,
      isPro: false,
      releasedCount: 104,
      canAccessFutureReleases: false,
      unreleasedCount: 2,
    };

    it('shows the soft-cap notice and the pre-release upgrade prompt on a free plan', async () => {
      const { container } = render(<ReleaseSmartLinkNotices {...base} />);

      expect(
        await screen.findByRole('complementary', {
          name: 'Smart link limit notice',
        })
      ).toHaveTextContent('You have 104 smart links');
      expect(
        screen.getByRole('complementary', { name: 'Smart link upgrade prompt' })
      ).toHaveTextContent('You have 2 upcoming releases');
      await expectNoA11yViolations(container);
    });

    it('drops each notice when its condition clears', async () => {
      render(
        <ReleaseSmartLinkNotices
          {...base}
          releasedCount={100}
          canAccessFutureReleases
        />
      );
      expect(screen.queryByRole('complementary')).toBeNull();
    });

    it.each([
      ['a paid plan', { isPro: true }],
      ['a hidden table', { showReleasesTable: false }],
    ])('renders nothing for %s', (_case, overrides) => {
      const { container } = render(
        <ReleaseSmartLinkNotices {...base} {...overrides} />
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('ReleasePlanDialog', () => {
    const base = {
      isGateLoading: false,
      canGenerateReleasePlans: true,
      isGeneratingReleasePlan: false,
    };

    it('opens the wizard for the release and forwards close and submit', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const { container } = render(
        <ReleasePlanDialog
          {...base}
          open
          release={release}
          isGeneratingReleasePlan
          onClose={onClose}
          onSubmit={onSubmit}
        />
      );

      const dialog = await screen.findByRole('dialog', {
        name: 'Plan Skyline Dreams',
      });
      expect(dialog).toHaveAttribute('data-can-generate', 'true');
      expect(dialog).toHaveAttribute('data-generating', 'true');
      expect(dialog).toHaveAttribute('data-gate-loading', 'false');
      await expectNoA11yViolations(container);

      await user.click(screen.getByRole('button', { name: 'Generate' }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['closed', { open: false, release }],
      ['open without a release', { open: true, release: null }],
    ])('renders nothing when %s', (_case, overrides) => {
      const { container } = render(
        <ReleasePlanDialog
          {...base}
          {...overrides}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );
      expect(container).toBeEmptyDOMElement();
    });
  });
});

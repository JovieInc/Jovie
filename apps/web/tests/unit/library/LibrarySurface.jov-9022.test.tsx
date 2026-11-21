import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibrarySurface } from '@/app/app/(shell)/library/LibrarySurface';
import { LIBRARY_VIEW_MODE_STORAGE_KEY } from '@/app/app/(shell)/library/library-grid-preferences';
import { computeLibraryStatusHiddenNote } from '@/app/app/(shell)/library/library-status-bar';
import { resolveLibraryStatusGlyph } from '@/components/features/library/resolve-library-status-glyph';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { buildAsset } from './library-surface-fixtures';

Element.prototype.scrollIntoView = vi.fn();

const founderDoor = vi.hoisted(() => ({
  chatMode: undefined as 'ov' | undefined,
}));
vi.mock('@/contexts/FounderDoorContext', () => ({
  useFounderDoor: () => founderDoor,
}));

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: navigationMock.push,
    replace: navigationMock.replace,
    refresh: navigationMock.refresh,
  }),
  useSearchParams: () => navigationMock.searchParams,
}));

vi.mock('next/image', () => ({
  default: (
    props: ComponentProps<'img'> & { readonly unoptimized?: boolean }
  ) => {
    const { unoptimized: _unoptimized, ...imgProps } = props;
    return <img alt='' {...imgProps} />;
  },
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  archiveLibraryRelease: vi.fn().mockResolvedValue({ success: true }),
  restoreRelease: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/app/app/(shell)/library/actions', () => ({
  archiveLibraryMerchCard: vi.fn().mockResolvedValue({ success: true }),
  restoreLibraryMerchCard: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/queries/useReleaseMutations', () => ({
  useSyncReleasesFromSpotifyMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: {
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'idle',
      lastErrorReason: null,
      currentTime: 0,
      duration: 0,
      trackTitle: null,
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
      hasLyrics: false,
    },
    toggleTrack: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    stop: vi.fn(),
    onError: vi.fn(() => () => undefined),
  }),
}));

function RightPanelOutlet() {
  return useRightPanel();
}

function renderLibrary(assets: readonly ReturnType<typeof buildAsset>[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <RightPanelProvider>
          <LibrarySurface assets={assets} />
          <RightPanelOutlet />
        </RightPanelProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function clickGridView() {
  fireEvent.click(screen.getByRole('radio', { name: 'Grid View' }));
}

describe('LibrarySurface JOV-9022 footer and approval-archived glyph', () => {
  beforeEach(() => {
    founderDoor.chatMode = undefined;
    window.localStorage.clear();
    window.localStorage.setItem(LIBRARY_VIEW_MODE_STORAGE_KEY, 'list');
    navigationMock.searchParams = new URLSearchParams();
    navigationMock.replace.mockClear();
  });

  it('computeLibraryStatusHiddenNote names hidden lifecycle archives', () => {
    expect(
      computeLibraryStatusHiddenNote('all', [
        buildAsset(),
        buildAsset({ id: 'a', lifecycleStatus: 'archived' }),
      ])
    ).toBe('Hiding 1 archived');
    expect(
      computeLibraryStatusHiddenNote('archived', [
        buildAsset({ lifecycleStatus: 'archived' }),
      ])
    ).toBeNull();
    expect(computeLibraryStatusHiddenNote('all', [buildAsset()])).toBeNull();
  });

  it('marks lifecycle-archived work with the canceled glyph, and an archived approval axis never borrows it (#10384, JOV-9022)', () => {
    renderLibrary([
      buildAsset({
        status: 'released',
        approvalStatus: 'archived',
      }),
    ]);

    // An active item with an archived APPROVAL axis stays on the All tab, so
    // its glyph keeps the release-status shape and names both axes — the
    // circled-X would read as an unexplained failed status (JOV-9022).
    const glyph = () => screen.getByTestId('library-status-glyph-release-1');
    expect(glyph()).toHaveAccessibleName('Released · Approval archived');
    expect(glyph()).toHaveAttribute('data-status-glyph', 'done');

    clickGridView();

    expect(glyph()).toHaveAccessibleName('Released · Approval archived');
    expect(glyph()).toHaveAttribute('data-status-glyph', 'done');
  });

  it('marks genuinely archived work with the canceled glyph (#10384)', async () => {
    const user = userEvent.setup();
    renderLibrary([
      buildAsset({
        status: 'released',
        lifecycleStatus: 'archived',
      }),
    ]);

    // Archived work lives on the Archived tab, where the canceled glyph is
    // truthful and named. Preset filtering is deferred, so wait for the row.
    await user.click(screen.getByRole('button', { name: /^Show filters/i }));
    await user.click(
      within(screen.getByTestId('library-view-filter-chips')).getByRole(
        'button',
        { name: /Archived/u }
      )
    );
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        screen.getByTestId('library-status-glyph-release-1')
      ).toBeInTheDocument();
    });
    const glyph = () => screen.getByTestId('library-status-glyph-release-1');
    expect(glyph()).toHaveAccessibleName('Archived');
    expect(glyph()).toHaveAttribute('data-status-glyph', 'canceled');

    clickGridView();

    expect(glyph()).toHaveAccessibleName('Archived');
  });

  it('names the default-hidden archived set in the status bar (JOV-9022)', () => {
    renderLibrary([
      buildAsset(),
      buildAsset({ id: 'release-2', title: 'Second Track' }),
      buildAsset({ id: 'release-3', title: 'Third Track' }),
      buildAsset({
        id: 'release-4',
        title: 'Old Single',
        lifecycleStatus: 'archived',
      }),
      buildAsset({
        id: 'release-5',
        title: 'Older Single',
        lifecycleStatus: 'archived',
      }),
    ]);

    // All lists every active row; the footer names how many are hidden and
    // why instead of reading "3 of 5 Items" with no filter in sight.
    expect(
      screen.getByTestId('library-release-row-release-1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-release-row-release-2')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-release-row-release-3')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('library-release-row-release-4')).toBeNull();
    expect(screen.queryByTestId('library-release-row-release-5')).toBeNull();
    expect(screen.getByText(/^3 of 5 Items/u)).toBeInTheDocument();
    expect(screen.getByTestId('library-status-hidden-note')).toHaveTextContent(
      'Hiding 2 archived'
    );
  });

  it('shows every item on All when nothing is hidden (JOV-9022 dogfood guard)', () => {
    renderLibrary([
      buildAsset(),
      buildAsset({ id: 'release-2', title: 'Second Track' }),
      buildAsset({ id: 'release-3', title: 'Third Track' }),
    ]);

    expect(screen.getByText(/^3 of 3 Items/u)).toBeInTheDocument();
    expect(screen.queryByTestId('library-status-hidden-note')).toBeNull();
    expect(screen.queryByText(/Hiding \d+ archived/u)).toBeNull();
  });

  it('gives every status glyph an accessible name across both axes (JOV-9022)', () => {
    const statuses = ['draft', 'scheduled', 'released'] as const;
    const approvals = [
      'draft',
      'needs_review',
      'approved',
      'archived',
    ] as const;
    const assets = statuses.flatMap((status, statusIndex) =>
      approvals.map((approvalStatus, approvalIndex) =>
        buildAsset({
          id: `release-${statusIndex * approvals.length + approvalIndex + 1}`,
          title: `Item ${status}-${approvalStatus}`,
          status,
          approvalStatus,
        })
      )
    );
    renderLibrary(assets);

    // DS rule: a status icon that only speaks through its glyph still owes
    // the tree an accessible name.
    for (const asset of assets) {
      const expected = resolveLibraryStatusGlyph(asset);
      const glyph = screen.getByTestId(`library-status-glyph-${asset.id}`);
      expect(glyph).toHaveAccessibleName(expected.label);
      expect(glyph.getAttribute('aria-label')).toBe(expected.label);
    }
  });
});

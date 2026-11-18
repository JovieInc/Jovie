import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ProviderKey,
  ReleaseViewModel,
  TrackViewModel,
} from '@/lib/discography/types';
import { createMockRelease } from '@/tests/test-utils/factories';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { ProviderConfig } from './ReleaseTable.types';

const mocks = vi.hoisted(() => ({ isMobile: false }));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => mocks.isMobile,
}));

// Sorting state lives in the URL through nuqs; rows here keep their given order.
vi.mock('./hooks/useSortingManager', () => ({
  useSortingManager: () => ({
    sorting: [],
    onSortingChange: vi.fn(),
    isSorting: false,
    isLargeDataset: false,
  }),
}));

vi.mock('./MobileReleaseListLazy', () => ({
  MobileReleaseListLazy: ({
    releases,
    artistName,
    groupByYear,
    onEdit,
  }: {
    releases: ReleaseViewModel[];
    artistName?: string | null;
    groupByYear?: boolean;
    onEdit: (release: ReleaseViewModel) => void;
  }) => (
    <ul
      aria-label={`${artistName} releases`}
      data-grouped={String(groupByYear)}
    >
      {releases.map(release => (
        <li key={release.id}>
          <button type='button' onClick={() => onEdit(release)}>
            {release.title}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

import { ReleaseTableWithTracks } from './ReleaseTableWithTracks';

type Props = ComponentProps<typeof ReleaseTableWithTracks>;

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
} as Record<ProviderKey, ProviderConfig>;

const album: ReleaseViewModel = {
  ...createMockRelease({ id: 'release_1', title: 'Skyline Dreams' }),
  releaseType: 'album',
  totalTracks: 2,
};
const single = createMockRelease({ id: 'release_2', title: 'Low Tide' });
const releases = [album, single];

function track(id: string, title: string, trackNumber: number): TrackViewModel {
  return {
    id,
    releaseId: 'release_1',
    releaseSlug: 'skyline-dreams',
    title,
    slug: id,
    smartLinkPath: `/r/skyline-dreams/${id}`,
    trackNumber,
    discNumber: 1,
    durationMs: 185000,
    isrc: 'USRC17607839',
    isExplicit: false,
    previewUrl: null,
    audioUrl: null,
    audioFormat: null,
    providers: [],
  };
}

const tracksByReleaseId = {
  release_1: [
    track('track-1', 'First Light', 1),
    track('track-2', 'Afterglow', 2),
  ],
};

// Year grouping turns row virtualization off, so jsdom (no layout) renders
// every row.
function renderTable(overrides: Partial<Props> = {}) {
  const props: Props = {
    releases,
    providerConfig,
    artistName: 'Sasha Waves',
    onCopy: vi.fn().mockResolvedValue('copied'),
    onEdit: vi.fn(),
    groupByYear: true,
    tracksByReleaseId,
    ...overrides,
  };
  return {
    props,
    ...render(
      <TooltipProvider>
        <ReleaseTableWithTracks {...props} />
      </TooltipProvider>
    ),
  };
}

async function openRowMenu(title: string) {
  const row = screen
    .getByRole('button', { name: new RegExp(`^Open ${title}`) })
    .closest('tr') as HTMLElement;
  fireEvent.contextMenu(row);
  return screen.findByRole('menuitem', { name: 'Edit Release Links' });
}

// These render full tables and Radix menus; a loaded CI runner needs more than
// the default five seconds.
vi.setConfig({ testTimeout: 20_000 });

describe('ReleaseTableWithTracks certificate', () => {
  beforeEach(() => {
    mocks.isMobile = false;
  });

  it('lists releases under their year and opens one from its title', async () => {
    const user = userEvent.setup();
    const { container, props } = renderTable();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('2025')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByTestId('release-row')).toHaveTextContent(
      'Skyline Dreams'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /^Open Low Tide/ }));
    expect(props.onEdit).toHaveBeenCalledWith(single);
  });

  it('copies a smart link through onCopy from the context menu', async () => {
    const user = userEvent.setup();
    const { props } = renderTable();

    await openRowMenu('Skyline Dreams');
    await user.click(screen.getByRole('menuitem', { name: 'Copy Smart Link' }));
    expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onCopy).mock.calls[0][0]).toContain(
      '/r/skyline-dreams--release_1'
    );
  });

  it('withholds the smart link of a locked release', async () => {
    renderTable({
      isSmartLinkLocked: releaseId => releaseId === 'release_2',
      getSmartLinkLockReason: () => 'cap',
    });
    await screen.findByRole('table');

    expect(
      screen.getAllByRole('button', { name: 'Copy smart link' })
    ).toHaveLength(1);
    expect(screen.queryByText('/r/low-tide--release_2')).toBeNull();
    expect(screen.getByText('/r/skyline-dreams--release_1')).toBeVisible();
  });

  it('reports the focused release as arrow keys move through rows', async () => {
    const user = userEvent.setup();
    const onFocusedRowChange = vi.fn();
    renderTable({ onFocusedRowChange });
    await screen.findByRole('table');

    screen.getByTestId('release-row').focus();
    await user.keyboard('{ArrowDown}');
    expect(onFocusedRowChange).toHaveBeenLastCalledWith(single);
  });

  it('runs row actions from the context menu', async () => {
    const user = userEvent.setup();
    const onGeneratePitch = vi.fn();
    const { props } = renderTable({ onGeneratePitch, onChangeStatus: vi.fn() });

    await user.click(await openRowMenu('Skyline Dreams'));
    expect(props.onEdit).toHaveBeenCalledWith(album);
  });

  it('shows the empty state when there are no releases', async () => {
    const { container } = renderTable({ releases: [] });

    expect(
      await screen.findByRole('heading', { name: 'No Releases Found' })
    ).toBeVisible();
    expect(screen.queryByTestId('release-row')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('hands the releases to the mobile list on small screens', async () => {
    const user = userEvent.setup();
    mocks.isMobile = true;
    const { container, props } = renderTable();

    const list = await screen.findByRole('list', {
      name: 'Sasha Waves releases',
    });
    expect(list).toHaveAttribute('data-grouped', 'true');
    expect(screen.queryByRole('table')).toBeNull();
    await expectNoA11yViolations(container);
    await user.click(within(list).getByRole('button', { name: 'Low Tide' }));
    expect(props.onEdit).toHaveBeenCalledWith(single);
  });

  it('shows the empty state on small screens without the mobile list', async () => {
    mocks.isMobile = true;
    const { container } = renderTable({ releases: [] });

    expect(
      screen.getByRole('heading', { name: 'No Releases Found' })
    ).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('expands an album into its tracks and opens a track', async () => {
    const user = userEvent.setup();
    const onTrackClick = vi.fn();
    const { container } = renderTable({ onTrackClick });

    expect(
      screen.getAllByRole('button', { name: 'Expand tracks' })
    ).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Expand tracks' }));
    const stack = await screen.findByTestId('release-track-stack-release_1');
    const firstTrack = await within(stack).findByRole('button', {
      name: 'Open details for 1. First Light',
    });
    expect(
      within(stack).getByRole('button', {
        name: 'Open details for 2. Afterglow',
      })
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(firstTrack);
    expect(onTrackClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'track-1',
        title: 'First Light',
        releaseId: 'release_1',
        releaseTitle: 'Skyline Dreams',
      })
    );

    await user.click(screen.getByRole('button', { name: 'Collapse tracks' }));
    expect(screen.queryByTestId('release-track-stack-release_1')).toBeNull();
  });

  it('marks the selected track inside an expanded release', async () => {
    const user = userEvent.setup();
    renderTable({ selectedTrackId: 'track-2' });

    await user.click(screen.getByRole('button', { name: 'Expand tracks' }));
    expect(await screen.findByTestId('track-row-track-2')).toHaveAttribute(
      'data-state',
      'selected'
    );
    expect(screen.getByTestId('track-row-track-1')).toHaveAttribute(
      'data-state',
      'idle'
    );
  });
});

import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { ReleaseFilterCounts } from './hooks/useReleaseFilterCounts';
import type { ReleaseFilters } from './ReleaseTableSubheader';

const mocks = vi.hoisted(() => ({
  togglePreview: vi.fn(),
  download: vi.fn(),
  counts: null as unknown,
}));

vi.mock('@/contexts/TableMetaContext', () => ({
  useTableMeta: () => ({
    tableMeta: { rightPanelWidth: 0, toggle: mocks.togglePreview },
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/utils/download', () => ({
  downloadCSVBlob: mocks.download,
  generateTimestampedFilename: () => 'releases.csv',
}));

// The filter menu is certified on its own; here it only has to receive the
// filters and counts and report changes.
vi.mock('./ReleaseFilterDropdown', () => ({
  ReleaseFilterDropdown: ({
    filters,
    onFiltersChange,
    counts,
    iconOnly,
  }: {
    filters: ReleaseFilters;
    onFiltersChange: (filters: ReleaseFilters) => void;
    counts: ReleaseFilterCounts;
    iconOnly?: boolean;
  }) => {
    mocks.counts = counts;
    return (
      <button
        type='button'
        data-icon-only={String(iconOnly)}
        onClick={() => onFiltersChange({ ...filters, releaseTypes: ['album'] })}
      >
        Filter ({filters.releaseTypes.length})
      </button>
    );
  },
}));

import {
  DEFAULT_RELEASE_FILTERS,
  ReleaseTableSubheader,
} from './ReleaseTableSubheader';

type Props = ComponentProps<typeof ReleaseTableSubheader>;

function release(id: string, overrides: Record<string, unknown> = {}) {
  return {
    profileId: 'profile-1',
    id,
    title: `Release ${id}`,
    slug: id,
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-01-01',
    totalTracks: 1,
    providers: [],
    smartLinkPath: `/${id}`,
    spotifyPopularity: 80,
    label: 'Jovie Records',
    ...overrides,
  } as unknown as ReleaseViewModel;
}

const allReleases = [
  release('rel-1'),
  release('rel-2', { releaseType: 'album', spotifyPopularity: 10 }),
  release('rel-3', { releaseType: 'album', label: 'Low Tide' }),
];

function renderSubheader(overrides: Partial<Props> = {}) {
  const props: Props = {
    releases: allReleases,
    allReleases,
    selectedIds: new Set<string>(),
    filters: DEFAULT_RELEASE_FILTERS,
    onFiltersChange: vi.fn(),
    ...overrides,
  };
  return {
    props,
    ...render(
      <TooltipProvider>
        <ReleaseTableSubheader {...props} />
      </TooltipProvider>
    ),
  };
}

describe('ReleaseTableSubheader certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.counts = null;
  });

  it('shows disabled placeholders until the lazy filter and export load', async () => {
    renderSubheader();

    expect(
      screen.getByRole('button', { name: 'Loading Filters' })
    ).toBeDisabled();
    expect(
      await screen.findByRole('button', { name: 'Filter (0)' })
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Loading Filters' })
    ).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Export data to CSV file' })
    ).toBeEnabled();
  });

  it('switches the release view through the segment control', async () => {
    const user = userEvent.setup();
    const onReleaseViewChange = vi.fn();
    const { container } = renderSubheader({
      releaseView: 'releases',
      onReleaseViewChange,
    });
    await screen.findByRole('button', { name: 'Filter (0)' });
    await screen.findByRole('button', { name: 'Export data to CSV file' });

    expect(screen.getByLabelText('Choose Releases View')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByText('Tracks'));
    expect(onReleaseViewChange).toHaveBeenCalledWith('tracks');
  });

  it('omits the view switch when no view handler is passed', async () => {
    const { container } = renderSubheader({ releases: [], allReleases: [] });
    await screen.findByRole('button', { name: 'Filter (0)' });
    await screen.findByRole('button', { name: 'Export data to CSV file' });

    expect(screen.queryByLabelText('Choose Releases View')).toBeNull();
    expect(screen.queryByText('Tracks')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('passes counts from the unfiltered catalog and reports filter changes', async () => {
    const user = userEvent.setup();
    const filters: ReleaseFilters = {
      releaseTypes: ['single'],
      popularity: [],
      labels: [],
    };
    const { props } = renderSubheader({
      releases: [allReleases[0]],
      filters,
    });

    const filter = await screen.findByRole('button', { name: 'Filter (1)' });
    expect(filter).toHaveAttribute('data-icon-only', 'true');
    const counts = mocks.counts as ReleaseFilterCounts;
    expect(counts.byType.album).toBe(2);
    expect(counts.byType.single).toBe(1);
    expect(counts.byPopularity).toEqual({ low: 1, med: 0, high: 2 });
    expect(counts.byLabel).toEqual(
      expect.arrayContaining([
        { label: 'Jovie Records', count: 2 },
        { label: 'Low Tide', count: 1 },
      ])
    );

    await user.click(filter);
    expect(props.onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      releaseTypes: ['album'],
    });
  });

  it('exports only the filtered releases it was given', async () => {
    const user = userEvent.setup();
    renderSubheader({ releases: [allReleases[0], allReleases[1]] });

    await user.click(
      await screen.findByRole('button', { name: 'Export data to CSV file' })
    );
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Confirm CSV export',
    });
    expect(dialog).toHaveTextContent('Rows2');
  });

  it('toggles the release preview drawer', async () => {
    const user = userEvent.setup();
    renderSubheader();

    await user.click(
      screen.getByRole('button', { name: 'Toggle release preview' })
    );
    await waitFor(() => expect(mocks.togglePreview).toHaveBeenCalledTimes(1));
  });
});

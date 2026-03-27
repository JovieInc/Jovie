import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseTable } from '@/features/dashboard/organisms/release-provider-matrix/ReleaseTable';
import type { ProviderKey } from '@/lib/discography/types';
import { createMockRelease } from '@/tests/test-utils/factories';

const expandedTrackRows = [
  {
    id: 'track-1',
    releaseId: 'release_1',
    title: 'First Track',
  },
  {
    id: 'track-2',
    releaseId: 'release_1',
    title: 'Selected Track',
  },
];

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/hooks/useExpandedTracks',
  () => ({
    useExpandedTracks: () => ({
      expandedReleaseIds: new Set(['release_1']),
      isExpanded: (releaseId: string) => releaseId === 'release_1',
      isLoading: false,
      toggleExpansion: vi.fn(),
      getTracksForRelease: (releaseId: string) =>
        releaseId === 'release_1' ? expandedTrackRows : null,
    }),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/hooks/useSortingManager',
  () => ({
    useSortingManager: () => ({
      sorting: [],
      onSortingChange: vi.fn(),
      isSorting: false,
      isLargeDataset: false,
    }),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/utils/column-renderers',
  () => ({
    createExpandableReleaseCellRenderer: () => () => null,
    createReleaseCellRenderer: () => () => null,
    createRightMetaCellRenderer: () => () => null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/utils/release-context-actions',
  () => ({
    getReleaseContextMenuItems: () => [],
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/components',
  () => ({
    TrackRowsContainer: ({
      tracks,
      selectedTrackId,
    }: {
      tracks: Array<{ id: string; title: string }>;
      selectedTrackId?: string | null;
    }) => (
      <div data-testid='track-rows-container'>
        {tracks.map(track => (
          <div
            key={track.id}
            data-testid={`expanded-track-${track.id}`}
            data-state={selectedTrackId === track.id ? 'selected' : 'idle'}
          >
            {track.title}
          </div>
        ))}
      </div>
    ),
  })
);

vi.mock('@/components/organisms/table', () => ({
  TableEmptyState: () => <div data-testid='table-empty-state' />,
  UnifiedTable: ({
    data,
    columns,
    getRowId,
    getRowClassName,
    expandedRowIds,
    renderExpandedContent,
  }: {
    data: Array<{ id: string }>;
    columns: unknown[];
    getRowId: (row: { id: string }) => string;
    getRowClassName: (row: { id: string }) => string;
    expandedRowIds?: Set<string>;
    renderExpandedContent?: (
      row: { id: string },
      columnCount: number
    ) => ReactNode;
  }) => (
    <div data-testid='unified-table'>
      {data.map(row => {
        const rowId = getRowId(row);
        return (
          <div key={rowId}>
            <div
              data-testid={`release-row-${rowId}`}
              className={getRowClassName(row)}
            />
            {expandedRowIds?.has(rowId) ? (
              <div data-testid={`expanded-row-${rowId}`}>
                {renderExpandedContent?.(row, columns.length)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  ),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: () => <span data-testid='icon' />,
}));

describe('ReleaseTable', () => {
  const providerConfig = {
    spotify: { label: 'Spotify', accent: '#1DB954' },
  } as unknown as Record<ProviderKey, { label: string; accent: string }>;

  const releases = [
    createMockRelease({ id: 'release_1', title: 'Expanded Release' }),
    createMockRelease({ id: 'release_2', title: 'Selected Release' }),
  ];

  const commonProps = {
    releases,
    providerConfig,
    onCopy: vi.fn().mockResolvedValue('copied'),
    onEdit: vi.fn(),
  } satisfies Partial<ComponentProps<typeof ReleaseTable>>;

  it('keeps selected and expanded release rows visually distinct', () => {
    render(
      <ReleaseTable
        {...commonProps}
        showTracks={true}
        selectedReleaseId='release_2'
      />
    );

    const expandedRow = screen.getByTestId('release-row-release_1');
    const selectedRow = screen.getByTestId('release-row-release_2');

    expect(expandedRow).toBeInTheDocument();
    expect(selectedRow).toBeInTheDocument();
    expect(expandedRow).not.toBe(selectedRow);
  });

  it('gives idle release rows the same visible rounded hover silhouette', () => {
    render(<ReleaseTable {...commonProps} showTracks={false} />);

    const idleRow = screen.getByTestId('release-row-release_1');
    expect(idleRow).toBeInTheDocument();
  });

  it('passes the selected track state into expanded track rows', () => {
    render(
      <ReleaseTable
        {...commonProps}
        showTracks={true}
        selectedTrackId='track-2'
      />
    );

    expect(screen.getByTestId('expanded-row-release_1')).toBeInTheDocument();
    expect(screen.getByTestId('expanded-track-track-1')).toHaveAttribute(
      'data-state',
      'idle'
    );
    expect(screen.getByTestId('expanded-track-track-2')).toHaveAttribute(
      'data-state',
      'selected'
    );
  });
});

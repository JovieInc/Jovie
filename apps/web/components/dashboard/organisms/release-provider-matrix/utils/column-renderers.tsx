'use client';

import { Button } from '@jovie/ui';
import type { CellContext, HeaderContext, Table } from '@tanstack/react-table';
import type { RefObject } from 'react';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import { EmptyCell } from '@/components/atoms/EmptyCell';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import { ExpandButton } from '@/components/dashboard/organisms/release-provider-matrix/components/ExpandButton';
import {
  AvailabilityCell,
  PopularityCell,
  PopularityIcon,
  ReleaseCell,
  SmartLinkCell,
} from '@/components/dashboard/organisms/releases/cells';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  type HeaderBulkAction,
  HeaderBulkActions,
  TableCheckboxCell,
} from '@/components/organisms/table';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { formatDuration } from '@/lib/utils/formatDuration';

// ============================================================================
// Constants
// ============================================================================

/** Date format options for release date display */
export const DATE_FORMAT_OPTIONS = { year: 'numeric' } as const;
export const DATE_TOOLTIP_FORMAT_OPTIONS = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
} as const;

// Provider config type for availability cell
interface ProviderConfig {
  label: string;
  accent: string;
}

// ============================================================================
// Selection Column Renderers
// ============================================================================

/**
 * Creates a header renderer for the checkbox column.
 * Uses a ref for headerCheckboxState to read current value at render time,
 * preventing column recreation on every selection change.
 */
export function createSelectHeaderRenderer(
  headerCheckboxStateRef: RefObject<boolean | 'indeterminate'>,
  onToggleSelectAll: () => void
) {
  return function SelectHeader({
    table,
  }: HeaderContext<ReleaseViewModel, unknown>) {
    return (
      <TableCheckboxCell
        table={table as Table<ReleaseViewModel>}
        headerCheckboxState={headerCheckboxStateRef.current ?? false}
        onToggleSelectAll={onToggleSelectAll}
      />
    );
  };
}

/**
 * Creates a cell renderer for the checkbox column.
 * Uses a ref for selectedIds to read current value at render time,
 * preventing column recreation on every selection change.
 */
export function createSelectCellRenderer(
  selectedIdsRef: RefObject<Set<string>>,
  onToggleSelect: (id: string) => void
) {
  return function SelectCell({ row }: CellContext<ReleaseViewModel, unknown>) {
    const release = row.original;
    const isChecked = selectedIdsRef.current?.has(release.id) ?? false;
    const rowNumber = row.index + 1;

    return (
      <TableCheckboxCell
        row={row}
        rowNumber={rowNumber}
        isChecked={isChecked}
        onToggleSelect={() => onToggleSelect(release.id)}
      />
    );
  };
}

// ============================================================================
// Header Renderers
// ============================================================================

/**
 * Creates a header renderer for the release column with bulk actions.
 * Uses refs for selectedCount and bulkActions to read current values at render time.
 */
export function createReleaseHeaderRenderer(
  selectedCountRef: RefObject<number>,
  bulkActionsRef: RefObject<HeaderBulkAction[]>,
  onClearSelection: (() => void) | undefined
) {
  return function ReleaseHeader() {
    const selectedCount = selectedCountRef.current ?? 0;
    const bulkActions = bulkActionsRef.current ?? [];
    return (
      <div className='flex items-center gap-2'>
        {selectedCount === 0 && <span>Release</span>}
        <HeaderBulkActions
          selectedCount={selectedCount}
          bulkActions={bulkActions}
          onClearSelection={onClearSelection}
        />
      </div>
    );
  };
}

/**
 * Creates a header renderer for the actions column.
 * Uses a ref for selectedCount to read current value at render time.
 */
export function createActionsHeaderRenderer(
  selectedCountRef: RefObject<number>,
  onClearSelection: (() => void) | undefined
) {
  return function ActionsHeader() {
    const selectedCount = selectedCountRef.current ?? 0;

    // Show clear button only when items are selected
    if (selectedCount > 0 && onClearSelection) {
      return (
        <div className='flex items-center justify-end'>
          <Button
            variant='ghost'
            size='sm'
            onClick={onClearSelection}
            className='h-7 gap-1 text-xs'
          >
            <Icon name='X' className='h-3.5 w-3.5' />
            Clear
          </Button>
        </div>
      );
    }

    // Empty header when no selection
    return null;
  };
}

// ============================================================================
// Cell Factory Renderers
// ============================================================================

/** Creates a cell renderer for the release column */
export function createReleaseCellRenderer(artistName?: string | null) {
  return function ReleaseCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    return <ReleaseCell release={row.original} artistName={artistName} />;
  };
}

/** Creates a cell renderer for the release column with expand button */
export function createExpandableReleaseCellRenderer(
  artistName: string | null | undefined,
  isExpanded: (releaseId: string) => boolean,
  isLoading: (releaseId: string) => boolean,
  onToggleExpansion: (release: ReleaseViewModel) => void
) {
  return function ExpandableReleaseCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    const release = row.original;
    const expanded = isExpanded(release.id);
    const loading = isLoading(release.id);

    return (
      <div className='flex items-center gap-1'>
        <ExpandButton
          isExpanded={expanded}
          isLoading={loading}
          totalTracks={release.totalTracks}
          onClick={e => {
            e.stopPropagation();
            onToggleExpansion(release);
          }}
        />
        <ReleaseCell release={release} artistName={artistName} />
      </div>
    );
  };
}

/** Creates a cell renderer for the availability column */
export function createAvailabilityCellRenderer(
  allProviders: ProviderKey[],
  providerConfig: Record<ProviderKey, ProviderConfig>,
  onCopy: (path: string, label: string, testId: string) => Promise<string>,
  onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>,
  isAddingUrl?: boolean
) {
  return function AvailabilityCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    return (
      <AvailabilityCell
        release={row.original}
        allProviders={allProviders}
        providerConfig={providerConfig}
        onCopy={onCopy}
        onAddUrl={onAddUrl}
        isAddingUrl={isAddingUrl}
      />
    );
  };
}

/** Creates a cell renderer for the smart link column */
export function createSmartLinkCellRenderer() {
  return function SmartLinkCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    return <SmartLinkCell release={row.original} />;
  };
}

/** Combined right column: smart link + popularity + year (responsive) */
export function createRightMetaCellRenderer() {
  return function RightMetaCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    const release = row.original;
    const year = release.releaseDate
      ? new Date(release.releaseDate).getFullYear()
      : null;

    return (
      <div className='flex min-w-[180px] md:min-w-[300px] items-center justify-end gap-3 text-xs text-secondary-token'>
        <div className='min-w-0 flex-1'>
          <SmartLinkCell release={release} />
        </div>

        <div className='hidden sm:flex items-center gap-2 tabular-nums text-secondary-token shrink-0'>
          <div className='w-4 flex justify-center'>
            <PopularityIcon popularity={release.spotifyPopularity} />
          </div>
          <span className='w-10 text-right'>{year ?? '—'}</span>
        </div>
      </div>
    );
  };
}

/** Creates a cell renderer for the actions column */
export function createActionsCellRenderer(
  getContextMenuItems: (release: ReleaseViewModel) => ContextMenuItemType[]
) {
  return function ActionsCell({ row }: CellContext<ReleaseViewModel, unknown>) {
    const contextMenuItems = getContextMenuItems(row.original);
    const actionMenuItems = convertContextMenuItems(contextMenuItems);

    return (
      <div className='flex items-center justify-end'>
        <TableActionMenu items={actionMenuItems} align='end' />
      </div>
    );
  };
}

// ============================================================================
// Static Cell Renderers
// ============================================================================

/** Renders the release date cell */
export function renderReleaseDateCell({
  getValue,
}: CellContext<ReleaseViewModel, string | undefined>) {
  const date = getValue();
  return date ? (
    <DateCell
      date={new Date(date)}
      formatOptions={DATE_FORMAT_OPTIONS}
      tooltipFormatOptions={DATE_TOOLTIP_FORMAT_OPTIONS}
    />
  ) : (
    <EmptyCell tooltip='No release date' />
  );
}

/** Renders the popularity cell */
export function renderPopularityCell({
  getValue,
}: CellContext<ReleaseViewModel, number | null | undefined>) {
  return <PopularityCell popularity={getValue()} />;
}

/** Renders the release type badge cell */
export function renderReleaseTypeCell({
  getValue,
}: CellContext<ReleaseViewModel, string>) {
  const type = getValue();
  const style = getReleaseTypeStyle(type);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style.border} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

/** Renders the ISRC cell */
export function renderIsrcCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  return <CopyableMonospaceCell value={getValue()} label='ISRC' />;
}

/** Renders the UPC cell */
export function renderUpcCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  return <CopyableMonospaceCell value={getValue()} label='UPC' />;
}

/** Renders the label cell with truncation and tooltip */
export function renderLabelCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  const label = getValue();
  if (!label) return <EmptyCell />;

  return (
    <TruncatedText lines={1} className='text-xs text-secondary-token'>
      {label}
    </TruncatedText>
  );
}

/** Renders the total tracks cell */
export function renderTotalTracksCell({
  getValue,
}: CellContext<ReleaseViewModel, number>) {
  return (
    <span className='text-xs text-secondary-token tabular-nums'>
      {getValue()}
    </span>
  );
}

/** Renders the duration cell */
export function renderDurationCell({
  getValue,
}: CellContext<ReleaseViewModel, number | null | undefined>) {
  const durationMs = getValue();
  if (!durationMs) return <EmptyCell />;

  return (
    <span className='text-xs text-secondary-token tabular-nums'>
      {formatDuration(durationMs)}
    </span>
  );
}

/** Renders the genres cell with overflow indicator */
export function renderGenresCell({
  getValue,
}: CellContext<ReleaseViewModel, string[] | undefined>) {
  const genres = getValue();
  if (!genres || genres.length === 0) {
    return <EmptyCell />;
  }

  const firstGenre = genres[0];
  const remainingCount = genres.length - 1;

  return (
    <div className='flex items-center gap-1'>
      <TruncatedText lines={1} className='text-xs text-secondary-token'>
        {firstGenre}
      </TruncatedText>
      {remainingCount > 0 && (
        <span
          className='inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-tertiary-token'
          title={genres.slice(1).join(', ')}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Combined Metrics Cell (Linear-style compact layout)
// ============================================================================

/**
 * Combined metrics cell that displays multiple small data points in a
 * fixed-width layout to prevent layout shift. Includes: tracks, duration, label.
 */
export function renderMetricsCell({
  row,
}: CellContext<ReleaseViewModel, unknown>) {
  const release = row.original;
  const duration = release.totalDurationMs
    ? formatDuration(release.totalDurationMs)
    : null;

  return (
    <div className='flex items-center gap-3 text-xs text-secondary-token tabular-nums'>
      {/* Tracks count - fixed width */}
      <span className='w-8 text-right' title='Tracks'>
        {release.totalTracks}
      </span>

      {/* Duration - fixed width */}
      <span className='w-12 text-right' title='Duration'>
        {duration ?? '—'}
      </span>

      {/* Label - truncated */}
      {release.label && (
        <TruncatedText
          lines={1}
          className='max-w-24 text-tertiary-token'
          tooltipSide='top'
        >
          {release.label}
        </TruncatedText>
      )}
    </div>
  );
}

// ============================================================================
// Stats Cell (Compact: Year + Popularity Icon + Duration)
// ============================================================================

/**
 * Combined stats cell that displays year, popularity icon, and duration in a
 * compact fixed-width layout. Replaces separate releaseDate, popularity, and
 * metrics columns.
 */
export function renderStatsCell({
  row,
}: CellContext<ReleaseViewModel, unknown>) {
  const release = row.original;
  const year = release.releaseDate
    ? new Date(release.releaseDate).getFullYear()
    : null;

  return (
    <div className='flex items-center gap-2 text-xs text-secondary-token tabular-nums'>
      {/* Popularity icon first */}
      <div className='w-4 flex justify-center'>
        <PopularityIcon popularity={release.spotifyPopularity} />
      </div>

      {/* Year - fixed width, right aligned */}
      <span className='w-10 text-right'>{year ?? '—'}</span>
    </div>
  );
}

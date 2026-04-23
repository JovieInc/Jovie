'use client';

import { Badge, Button } from '@jovie/ui';
import type { CellContext, HeaderContext, Table } from '@tanstack/react-table';
import type { RefObject } from 'react';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import { EmptyCell } from '@/components/atoms/EmptyCell';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  type HeaderBulkAction,
  HeaderBulkActions,
  TableCheckboxCell,
} from '@/components/organisms/table';
import { ExpandButton } from '@/features/dashboard/organisms/release-provider-matrix/components/ExpandButton';
import {
  AvailabilityCell,
  PopularityCell,
  PopularityIcon,
  ReleaseCell,
  SmartLinkCell,
} from '@/features/dashboard/organisms/releases/cells';
import {
  formatReleaseDate,
  formatReleaseDateMonthYear,
} from '@/lib/discography/formatting';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { formatDuration } from '@/lib/utils/formatDuration';

// ============================================================================
// Constants
// ============================================================================

export const DATE_FORMAT_OPTIONS = {
  month: 'short',
  year: 'numeric',
} as const;

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
            className='h-7 gap-1 text-app'
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
export function createReleaseCellRenderer(
  artistName: string | null | undefined,
  onOpen?: (release: ReleaseViewModel) => void
) {
  return function ReleaseCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    return (
      <ReleaseCell
        release={row.original}
        artistName={artistName}
        onSelect={onOpen}
      />
    );
  };
}

/** Creates a cell renderer for the release column with expand button */
export function createExpandableReleaseCellRenderer(
  artistName: string | null | undefined,
  isExpanded: (releaseId: string) => boolean,
  isLoading: (releaseId: string) => boolean,
  onToggleExpansion: (release: ReleaseViewModel) => void,
  onOpen?: (release: ReleaseViewModel) => void
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
        <ReleaseCell
          release={release}
          artistName={artistName}
          onSelect={onOpen}
        />
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
export function createSmartLinkCellRenderer(
  isSmartLinkLocked?: (releaseId: string) => boolean,
  getSmartLinkLockReason?: (releaseId: string) => 'scheduled' | 'cap' | null
) {
  return function SmartLinkCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    return (
      <SmartLinkCell
        release={row.original}
        locked={isSmartLinkLocked?.(row.original.id)}
        lockReason={getSmartLinkLockReason?.(row.original.id)}
      />
    );
  };
}

/** Combined right column: smart link + popularity + date */
export function createRightMetaCellRenderer(
  isSmartLinkLocked?: (releaseId: string) => boolean,
  getSmartLinkLockReason?: (releaseId: string) => 'scheduled' | 'cap' | null
) {
  return function RightMetaCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    const release = row.original;
    const dateLabel = release.releaseDate
      ? formatReleaseDateMonthYear(release.releaseDate)
      : '—';
    const yearTitle = release.releaseDate
      ? formatReleaseDate(release.releaseDate)
      : 'Unknown release date';

    return (
      <div className='flex items-center gap-2.5'>
        <div className='max-lg:hidden min-w-0 flex-1'>
          <SmartLinkCell
            release={release}
            locked={isSmartLinkLocked?.(release.id)}
            lockReason={getSmartLinkLockReason?.(release.id)}
          />
        </div>

        <PopularityIcon popularity={release.spotifyPopularity} />

        <span
          className='inline-flex w-[64px] shrink-0 justify-end text-right tabular-nums text-2xs font-[400] text-secondary-token'
          title={yearTitle}
        >
          {dateLabel}
        </span>
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
    <Badge size='sm' className={`${style.border} ${style.bg} ${style.text}`}>
      {style.label}
    </Badge>
  );
}

/** Renders the ISRC cell */
export function renderIsrcCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  return <CopyableMonospaceCell value={getValue()} label='ISRC' size='sm' />;
}

/** Renders the UPC cell */
export function renderUpcCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  return <CopyableMonospaceCell value={getValue()} label='UPC' size='sm' />;
}

/** Renders the label cell with truncation and tooltip */
export function renderLabelCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  const label = getValue();
  if (!label) return <EmptyCell />;

  return (
    <TruncatedText lines={1} className='text-2xs text-secondary-token'>
      {label}
    </TruncatedText>
  );
}

/** Renders the total tracks cell */
export function renderTotalTracksCell({
  getValue,
}: CellContext<ReleaseViewModel, number>) {
  return (
    <span className='text-app tabular-nums text-secondary-token'>
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
    <span className='text-app tabular-nums text-secondary-token'>
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
      <TruncatedText
        lines={1}
        className='min-w-0 flex-1 text-app text-secondary-token'
      >
        {firstGenre}
      </TruncatedText>
      {remainingCount > 0 && (
        <span
          className='inline-flex min-w-6 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1 px-1.5 py-0.5 text-2xs text-tertiary-token'
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
    <div className='flex items-center gap-3 text-app tabular-nums text-secondary-token'>
      {/* Tracks count - fixed width */}
      <span className='w-8 text-right' title='Tracks'>
        {release.totalTracks}
      </span>

      {/* Duration - fixed width */}
      <span className='w-12 text-right' title='Duration'>
        {duration ?? '—'}
      </span>

      {/* Label */}
      {release.label && (
        <TruncatedText
          lines={1}
          className='max-w-48 text-tertiary-token'
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
  const dateStr = release.releaseDate
    ? formatReleaseDateMonthYear(release.releaseDate)
    : null;

  return (
    <div className='flex items-center gap-2 text-app tabular-nums text-secondary-token'>
      {/* Popularity icon first */}
      <div className='w-4 flex justify-center'>
        <PopularityIcon popularity={release.spotifyPopularity} />
      </div>

      {/* Date - fixed width, right aligned */}
      <span className='w-[60px] text-right text-2xs'>{dateStr ?? '—'}</span>
    </div>
  );
}

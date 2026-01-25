import { Button } from '@jovie/ui';
import type { CellContext, HeaderContext, Table } from '@tanstack/react-table';
import type { RefObject } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  AvailabilityCell,
  PopularityCell,
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
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

// Date format options (extracted to prevent inline object creation)
export const DATE_FORMAT_OPTIONS = { year: 'numeric' } as const;
export const DATE_TOOLTIP_FORMAT_OPTIONS = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
} as const;

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

/**
 * Creates a header renderer for the release column with bulk actions.
 * Uses refs for selectedCount and bulkActions to read current values at render time,
 * preventing column recreation on every selection change.
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
 * Renders the release date cell
 */
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
    <span className='text-xs text-tertiary-token'>TBD</span>
  );
}

/**
 * Creates a header renderer for the actions column
 */
export function createActionsHeaderRenderer(
  selectedCount: number,
  onClearSelection: (() => void) | undefined,
  onSync: () => void,
  isSyncing: boolean | undefined
) {
  return function ActionsHeader() {
    return (
      <div className='flex items-center justify-end gap-1'>
        {selectedCount > 0 ? (
          // Clear button when items selected
          onClearSelection && (
            <Button
              variant='ghost'
              size='sm'
              onClick={onClearSelection}
              className='h-7 gap-1 text-xs'
            >
              <Icon name='X' className='h-3.5 w-3.5' />
              Clear
            </Button>
          )
        ) : (
          // Sync button when nothing selected
          <Button
            variant='ghost'
            size='sm'
            onClick={onSync}
            disabled={isSyncing}
            className='h-7 gap-1 text-xs'
          >
            <Icon
              name={isSyncing ? 'Loader2' : 'RefreshCw'}
              className={isSyncing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
            />
            Sync
          </Button>
        )}
      </div>
    );
  };
}

/**
 * Creates a cell renderer for the actions column
 */
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

// Provider config type for availability cell
interface ProviderConfig {
  label: string;
  accent: string;
}

/**
 * Creates a cell renderer for the release column
 */
export function createReleaseCellRenderer(artistName?: string | null) {
  return function ReleaseCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    return <ReleaseCell release={row.original} artistName={artistName} />;
  };
}

/**
 * Creates a cell renderer for the availability column
 */
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

/**
 * Creates a cell renderer for the smart link column
 */
export function createSmartLinkCellRenderer(
  onCopy: (path: string, label: string, testId: string) => Promise<string>
) {
  return function SmartLinkCellRenderer({
    row,
  }: CellContext<ReleaseViewModel, unknown>) {
    return <SmartLinkCell release={row.original} onCopy={onCopy} />;
  };
}

/**
 * Renders the popularity cell
 */
export function renderPopularityCell({
  getValue,
}: CellContext<ReleaseViewModel, number | null | undefined>) {
  return <PopularityCell popularity={getValue()} />;
}

// ============================================================================
// New Column Renderers for Extended Fields
// ============================================================================

/** Release type badge styling */
const RELEASE_TYPE_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  single: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    label: 'Single',
  },
  ep: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
    label: 'EP',
  },
  album: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-300',
    label: 'Album',
  },
  compilation: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    label: 'Compilation',
  },
  live: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    label: 'Live',
  },
  mixtape: {
    bg: 'bg-pink-100 dark:bg-pink-900/30',
    text: 'text-pink-700 dark:text-pink-300',
    label: 'Mixtape',
  },
  other: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
    label: 'Other',
  },
};

/**
 * Renders the release type badge cell
 */
export function renderReleaseTypeCell({
  getValue,
}: CellContext<ReleaseViewModel, string>) {
  const type = getValue();
  const style = RELEASE_TYPE_STYLES[type] ?? RELEASE_TYPE_STYLES.other;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

/**
 * Renders a copyable monospace cell (for ISRC, UPC)
 */
function CopyableMonospaceCell({
  value,
  label,
}: {
  value: string | null | undefined;
  label: string;
}) {
  if (!value) {
    return <span className='text-tertiary-token'>—</span>;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
  };

  return (
    <button
      type='button'
      onClick={handleCopy}
      className='group/copy inline-flex items-center gap-1 font-mono text-xs text-secondary-token hover:text-primary-token'
      title={`Copy ${label}`}
    >
      <span className='truncate max-w-[100px]'>{value}</span>
      <Icon
        name='Copy'
        className='h-3 w-3 opacity-0 transition-opacity group-hover/copy:opacity-60'
      />
    </button>
  );
}

/**
 * Renders the ISRC cell
 */
export function renderIsrcCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  return <CopyableMonospaceCell value={getValue()} label='ISRC' />;
}

/**
 * Renders the UPC cell
 */
export function renderUpcCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  return <CopyableMonospaceCell value={getValue()} label='UPC' />;
}

/**
 * Renders the label cell with truncation
 */
export function renderLabelCell({
  getValue,
}: CellContext<ReleaseViewModel, string | null | undefined>) {
  const label = getValue();

  if (!label) {
    return <span className='text-tertiary-token'>—</span>;
  }

  return (
    <span className='truncate text-xs text-secondary-token' title={label}>
      {label}
    </span>
  );
}

/**
 * Renders the total tracks cell
 */
export function renderTotalTracksCell({
  getValue,
}: CellContext<ReleaseViewModel, number>) {
  const count = getValue();
  return (
    <span className='text-xs text-secondary-token tabular-nums'>{count}</span>
  );
}

/**
 * Format milliseconds as mm:ss or hh:mm:ss
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Renders the duration cell
 */
export function renderDurationCell({
  getValue,
}: CellContext<ReleaseViewModel, number | null | undefined>) {
  const durationMs = getValue();

  if (!durationMs) {
    return <span className='text-tertiary-token'>—</span>;
  }

  return (
    <span className='text-xs text-secondary-token tabular-nums'>
      {formatDuration(durationMs)}
    </span>
  );
}

/**
 * Renders the genres cell with overflow indicator
 */
export function renderGenresCell({
  getValue,
}: CellContext<ReleaseViewModel, string[] | undefined>) {
  const genres = getValue();

  if (!genres || genres.length === 0) {
    return <span className='text-tertiary-token'>—</span>;
  }

  const firstGenre = genres[0];
  const remainingCount = genres.length - 1;

  return (
    <div className='flex items-center gap-1'>
      <span
        className='truncate text-xs text-secondary-token'
        title={firstGenre}
      >
        {firstGenre}
      </span>
      {remainingCount > 0 && (
        <span
          className='inline-flex items-center rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-tertiary-token'
          title={genres.slice(1).join(', ')}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  );
}

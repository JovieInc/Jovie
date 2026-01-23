import { Button } from '@jovie/ui';
import type { CellContext, HeaderContext, Table } from '@tanstack/react-table';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  type HeaderBulkAction,
  HeaderBulkActions,
  TableCheckboxCell,
} from '@/components/organisms/table';
import type { ReleaseViewModel } from '@/lib/discography/types';

// Date format options (extracted to prevent inline object creation)
export const DATE_FORMAT_OPTIONS = { year: 'numeric' } as const;
export const DATE_TOOLTIP_FORMAT_OPTIONS = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
} as const;

/**
 * Creates a header renderer for the checkbox column
 */
export function createSelectHeaderRenderer(
  headerCheckboxState: boolean | 'indeterminate',
  onToggleSelectAll: () => void
) {
  return function SelectHeader({
    table,
  }: HeaderContext<ReleaseViewModel, unknown>) {
    return (
      <TableCheckboxCell
        table={table as Table<ReleaseViewModel>}
        headerCheckboxState={headerCheckboxState}
        onToggleSelectAll={onToggleSelectAll}
      />
    );
  };
}

/**
 * Creates a cell renderer for the checkbox column
 */
export function createSelectCellRenderer(
  selectedIds: Set<string>,
  onToggleSelect: (id: string) => void
) {
  return function SelectCell({ row }: CellContext<ReleaseViewModel, unknown>) {
    const release = row.original;
    const isChecked = selectedIds.has(release.id);
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
 * Creates a header renderer for the release column with bulk actions
 */
export function createReleaseHeaderRenderer(
  selectedCount: number,
  bulkActions: HeaderBulkAction[],
  onClearSelection: (() => void) | undefined
) {
  return function ReleaseHeader() {
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
}: CellContext<ReleaseViewModel, string | null>) {
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

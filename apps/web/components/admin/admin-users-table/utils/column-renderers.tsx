import { Badge } from '@jovie/ui';
import type { CellContext, HeaderContext, Table } from '@tanstack/react-table';
import type { RefObject } from 'react';
import { EmptyCell } from '@/components/atoms/EmptyCell';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  TableCheckboxCell,
} from '@/components/organisms/table';
import type { AdminUserRow } from '@/lib/admin/users';

/**
 * Renders the name cell with name and email (truncated with tooltip)
 */
export function renderNameCell({
  getValue,
  row,
}: CellContext<AdminUserRow, string | null>) {
  const user = row.original;
  const name = getValue();

  return (
    <div className='min-w-0'>
      {name ? (
        <TruncatedText lines={1} className='font-semibold text-primary-token'>
          {name}
        </TruncatedText>
      ) : (
        <span className='font-semibold text-primary-token'>User</span>
      )}
      {user.email ? (
        <TruncatedText lines={1} className='text-xs text-secondary-token'>
          {user.email}
        </TruncatedText>
      ) : (
        <EmptyCell />
      )}
    </div>
  );
}

/**
 * Renders the created date cell
 */
export function renderCreatedDateCell({
  getValue,
}: CellContext<AdminUserRow, Date | null>) {
  return <DateCell date={getValue()} />;
}

/**
 * Renders the plan badge cell
 */
export function renderPlanCell({
  getValue,
}: CellContext<AdminUserRow, string>) {
  const plan = getValue();
  return (
    <Badge size='sm' variant={plan === 'pro' ? 'primary' : 'secondary'}>
      {plan}
    </Badge>
  );
}

/**
 * Renders the status badge cell
 */
export function renderStatusCell({ row }: CellContext<AdminUserRow, unknown>) {
  const user = row.original;
  return user.deletedAt ? (
    <Badge size='sm' variant='warning'>
      Deleted
    </Badge>
  ) : (
    <Badge size='sm' variant='success'>
      <span className='flex items-center gap-1.5'>
        <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400' />{' '}
        Active
      </span>
    </Badge>
  );
}

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
  }: HeaderContext<AdminUserRow, unknown>) {
    return (
      <TableCheckboxCell
        table={table as Table<AdminUserRow>}
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
  page: number,
  pageSize: number,
  onToggleSelect: (id: string) => void
) {
  return function SelectCell({ row }: CellContext<AdminUserRow, unknown>) {
    const user = row.original;
    const isChecked = selectedIdsRef.current?.has(user.id) ?? false;
    const rowNumber = (page - 1) * pageSize + row.index + 1;

    return (
      <TableCheckboxCell
        row={row}
        rowNumber={rowNumber}
        isChecked={isChecked}
        onToggleSelect={() => onToggleSelect(user.id)}
      />
    );
  };
}

/**
 * Creates a cell renderer for the actions column
 */
export function createActionsCellRenderer(
  getContextMenuItems: (user: AdminUserRow) => ContextMenuItemType[]
) {
  return function ActionsCell({ row }: CellContext<AdminUserRow, unknown>) {
    const user = row.original;
    const contextMenuItems = getContextMenuItems(user);
    const actionMenuItems = convertContextMenuItems(contextMenuItems);

    return (
      <div className='flex items-center justify-end'>
        <TableActionMenu items={actionMenuItems} align='end' />
      </div>
    );
  };
}

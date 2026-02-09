import type { CellContext } from '@tanstack/react-table';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  AudienceActionsCell,
  AudienceDeviceCell,
  AudienceLastSeenCell,
  AudienceLocationCell,
  AudienceRowSelectionCell,
  AudienceTypeBadge,
  AudienceUserCell,
  AudienceVisitsCell,
} from '@/components/dashboard/audience/table/atoms';
import { convertContextMenuItems } from '@/components/organisms/table';
import type { AudienceMember } from '@/types';
import { useAudienceTableContext } from '../AudienceTableContext';

/**
 * Renders the user cell with display name, type, email, and phone
 */
export function renderUserCell({
  row,
}: CellContext<AudienceMember, string | null>) {
  return (
    <AudienceUserCell
      displayName={row.original.displayName}
      type={row.original.type}
      email={row.original.email}
      phone={row.original.phone}
    />
  );
}

/**
 * Renders the type badge cell
 */
export function renderTypeCell({
  getValue,
}: CellContext<AudienceMember, AudienceMember['type']>) {
  return <AudienceTypeBadge type={getValue()} />;
}

/**
 * Renders the location cell
 */
export function renderLocationCell({
  getValue,
}: CellContext<AudienceMember, string | null>) {
  return <AudienceLocationCell locationLabel={getValue()} />;
}

/**
 * Renders the device type cell
 */
export function renderDeviceCell({
  getValue,
}: CellContext<AudienceMember, AudienceMember['deviceType']>) {
  return <AudienceDeviceCell deviceType={getValue()} />;
}

/**
 * Renders the visits cell with intent level
 */
export function renderVisitsCell({ row }: CellContext<AudienceMember, number>) {
  return (
    <AudienceVisitsCell
      visits={row.original.visits}
      intentLevel={row.original.intentLevel}
    />
  );
}

/**
 * Renders the actions cell
 */
export function renderActionsCell({
  row,
}: CellContext<AudienceMember, AudienceMember['latestActions']>) {
  return (
    <AudienceActionsCell
      rowId={row.original.id}
      actions={row.original.latestActions}
    />
  );
}

/**
 * Renders the email cell for subscribers
 */
export function renderEmailCell({
  getValue,
}: CellContext<AudienceMember, string | null>) {
  return <span className='text-secondary-token'>{getValue() ?? '—'}</span>;
}

/**
 * Selection cell that reads dynamic state from context.
 * Avoids closing over selectedIds/page/pageSize which would destabilize column defs.
 */
export function SelectCell({ row }: CellContext<AudienceMember, unknown>) {
  const { selectedIds, toggleSelect, page, pageSize } =
    useAudienceTableContext();
  const rowNumber = (page - 1) * pageSize + row.index + 1;
  return (
    <AudienceRowSelectionCell
      rowNumber={rowNumber}
      isChecked={selectedIds.has(row.original.id)}
      displayName={row.original.displayName}
      onToggle={() => toggleSelect(row.original.id)}
    />
  );
}

/**
 * Last-seen cell that reads menu open state from context.
 * Avoids closing over openMenuRowId which would destabilize column defs.
 */
export function LastSeenCell({
  row,
}: CellContext<AudienceMember, string | null>) {
  const { openMenuRowId, setOpenMenuRowId } = useAudienceTableContext();
  return (
    <AudienceLastSeenCell
      row={row.original}
      lastSeenAt={row.original.lastSeenAt}
      isMenuOpen={openMenuRowId === row.original.id}
      onMenuOpenChange={open => setOpenMenuRowId(open ? row.original.id : null)}
    />
  );
}

/**
 * Menu cell that reads context menu items from context.
 * Avoids closing over getContextMenuItems which would destabilize column defs.
 */
export function MenuCell({ row }: CellContext<AudienceMember, unknown>) {
  const { getContextMenuItems } = useAudienceTableContext();
  const contextMenuItems = getContextMenuItems(row.original);
  const actionMenuItems = convertContextMenuItems(contextMenuItems);

  return (
    <div className='flex items-center justify-end'>
      <TableActionMenu items={actionMenuItems} align='end' />
    </div>
  );
}

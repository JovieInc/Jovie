'use client';

import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  type TableRowActionBarVisibility,
  TableRowOverflowTrigger,
} from '@/components/organisms/table';

/**
 * @deprecated Prefer `TableRowActionBar` / `TableRowOverflowTrigger` directly.
 * Kept as a thin adapter for Tasks until callsites pass ranked actions.
 */
export function TaskRowActionMenu({
  items,
  selected = false,
  visibility = 'always',
}: Readonly<{
  items: ContextMenuItemType[];
  selected?: boolean;
  visibility?: TableRowActionBarVisibility;
}>) {
  void selected;
  return (
    <TableActionMenu
      items={convertContextMenuItems(items)}
      trigger='custom'
      align='end'
    >
      <TableRowOverflowTrigger
        visibility={visibility}
        ariaLabel='Open Task Actions'
      />
    </TableActionMenu>
  );
}

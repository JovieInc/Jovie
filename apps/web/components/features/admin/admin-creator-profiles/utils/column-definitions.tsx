/**
 * Column Definitions Factory
 *
 * Creates TanStack Table column definitions for the admin creator profiles table.
 * Uses refs for selection state to prevent column recreation on every selection change.
 */

import { type RefObject, useState } from 'react';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import type { ContextMenuItemType } from '@/components/organisms/table';
import {
  convertContextMenuItems,
  TableCheckboxCell,
} from '@/components/organisms/table';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { ColumnDef, HeaderContext, Row } from '@/lib/tanstack-table';
import { createColumnHelper } from '@/lib/tanstack-table';
import {
  renderAvatarCell,
  renderCreatedDateCell,
  renderSocialLinksCell,
} from './column-renderers';

const columnHelper = createColumnHelper<AdminCreatorProfileRow>();

/**
 * Row action menu whose contextual slot carries the open state. The
 * system-b CSS contract keeps the affordance interactive while a row's menu
 * is open (`[data-menu-open='true']`); without it the modal dropdown's
 * portal steals the row's :hover and the trigger reverts to
 * pointer-events: none, so the menuitem interaction dies mid-flight.
 */
function CreatorRowActionMenu({
  profileId,
  items,
}: {
  readonly profileId: string;
  readonly items: TableActionMenuItem[];
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const open = openMenuId === profileId;
  return (
    <div
      className='system-b-table-contextual-action flex items-center justify-end'
      data-menu-open={open || undefined}
    >
      <TableActionMenu
        items={items}
        align='end'
        open={open}
        onOpenChange={next => setOpenMenuId(next ? profileId : null)}
      />
    </div>
  );
}

export interface ColumnFactoryParams {
  readonly page: number;
  readonly pageSize: number;
  /** Ref to current selected IDs - prevents column recreation on selection change */
  readonly selectedIdsRef: RefObject<Set<string>>;
  /** Ref to current header checkbox state - prevents column recreation on selection change */
  readonly headerCheckboxStateRef: RefObject<boolean | 'indeterminate'>;
  readonly toggleSelectAll: () => void;
  readonly toggleSelect: (id: string) => void;
  readonly getContextMenuItems: (
    profile: AdminCreatorProfileRow
  ) => ContextMenuItemType[];
}

/**
 * Creates column definitions for the admin creator profiles table.
 * Uses refs for selection state to read current values at render time,
 * preventing column recreation on every selection change.
 */
export function createCreatorProfileColumns({
  page,
  pageSize,
  selectedIdsRef,
  headerCheckboxStateRef,
  toggleSelectAll,
  toggleSelect,
  getContextMenuItems,
}: ColumnFactoryParams): ColumnDef<AdminCreatorProfileRow, unknown>[] {
  // Cast to unknown[] to satisfy TypeScript - TanStack Table columns have varying value types
  return [
    // Checkbox column
    columnHelper.display({
      id: 'select',
      header: ({ table }: HeaderContext<AdminCreatorProfileRow, unknown>) => (
        <TableCheckboxCell
          table={table}
          headerCheckboxState={headerCheckboxStateRef.current ?? false}
          onToggleSelectAll={toggleSelectAll}
        />
      ),
      cell: ({ row }: { row: Row<AdminCreatorProfileRow> }) => {
        const profile = row.original;
        const isChecked = selectedIdsRef.current?.has(profile.id) ?? false;
        const rowNumber = (page - 1) * pageSize + row.index + 1;

        return (
          <TableCheckboxCell
            row={row}
            rowNumber={rowNumber}
            isChecked={isChecked}
            onToggleSelect={() => toggleSelect(profile.id)}
          />
        );
      },
      size: 56, // 14 * 4 = 56px (w-14)
    }),

    // Avatar + Name column
    columnHelper.accessor('username', {
      id: 'avatar',
      header: 'Creator',
      cell: renderAvatarCell,
      size: 420,
    }),

    // Social Media Links column
    columnHelper.accessor('socialLinks', {
      id: 'social',
      header: 'Social',
      cell: renderSocialLinksCell,
      size: 150,
    }),
    // Created Date column
    columnHelper.accessor('createdAt', {
      id: 'created',
      header: 'Created',
      cell: renderCreatedDateCell,
      size: 120,
    }),

    // Actions column - shows ellipsis menu with SAME items as right-click context menu
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: { row: Row<AdminCreatorProfileRow> }) => {
        const profile = row.original;
        const contextMenuItems = getContextMenuItems(profile);
        const actionMenuItems = convertContextMenuItems(contextMenuItems);

        return (
          <CreatorRowActionMenu
            profileId={profile.id}
            items={actionMenuItems}
          />
        );
      },
      size: 64,
      meta: {
        headerVisibility: 'sr-only',
        actionVisibility: 'contextual',
      },
    }),
  ] as ColumnDef<AdminCreatorProfileRow, unknown>[];
}

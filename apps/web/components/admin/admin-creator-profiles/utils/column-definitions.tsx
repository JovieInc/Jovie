/**
 * Column Definitions Factory
 *
 * Creates TanStack Table column definitions for the admin creator profiles table.
 * Uses refs for selection state to prevent column recreation on every selection change.
 */

import type { ColumnDef, HeaderContext, Row } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import type { RefObject } from 'react';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import type { ContextMenuItemType } from '@/components/organisms/table';
import {
  convertContextMenuItems,
  TableCheckboxCell,
} from '@/components/organisms/table';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import {
  renderAvatarCell,
  renderCreatedDateCell,
  renderMusicLinksCell,
  renderSocialLinksCell,
} from './column-renderers';

const columnHelper = createColumnHelper<AdminCreatorProfileRow>();

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
      size: 280,
    }),

    // Social Media Links column
    columnHelper.accessor('socialLinks', {
      id: 'social',
      header: 'Social',
      cell: renderSocialLinksCell,
      size: 220,
    }),

    // Music Streaming Links column
    columnHelper.accessor('socialLinks', {
      id: 'music',
      header: 'Music',
      cell: renderMusicLinksCell,
      size: 220,
    }),

    // Created Date column
    columnHelper.accessor('createdAt', {
      id: 'created',
      header: 'Created',
      cell: renderCreatedDateCell,
      size: 180,
    }),

    // Actions column - shows ellipsis menu with SAME items as right-click context menu
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }: { row: Row<AdminCreatorProfileRow> }) => {
        const profile = row.original;
        const contextMenuItems = getContextMenuItems(profile);
        const actionMenuItems = convertContextMenuItems(contextMenuItems);

        return (
          <div className='flex items-center justify-end'>
            <TableActionMenu items={actionMenuItems} align='end' />
          </div>
        );
      },
      size: 48,
    }),
  ] as ColumnDef<AdminCreatorProfileRow, unknown>[];
}

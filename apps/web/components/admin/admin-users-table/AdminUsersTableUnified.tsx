'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { Copy, ExternalLink, Users } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import {
  ACTION_BAR_BUTTON_CLASS,
  ActionBar,
  ActionBarItem,
  type ContextMenuItemType,
  ExportCSVButton,
  TableBulkActionsToolbar,
  UnifiedTable,
  useRowSelection,
} from '@/components/organisms/table';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  USERS_CSV_FILENAME_PREFIX,
  usersCSVColumns,
} from '@/lib/admin/csv-configs/users';
import type { AdminUserRow } from '@/lib/admin/users';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { useAdminUsersInfiniteQuery } from '@/lib/queries/admin-infinite';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import type { AdminUsersTableProps } from './types';
import {
  createActionsCellRenderer,
  createSelectCellRenderer,
  createSelectHeaderRenderer,
  renderCreatedDateCell,
  renderNameCell,
  renderPlanCell,
  renderStatusCell,
} from './utils/column-renderers';

const columnHelper = createColumnHelper<AdminUserRow>();

export function AdminUsersTableUnified(props: Readonly<AdminUsersTableProps>) {
  const { users: initialUsers, pageSize, total, search, sort } = props;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminUsersInfiniteQuery({
      sort,
      search,
      pageSize,
      initialData: { rows: initialUsers, total },
    });

  const users = useMemo(
    () => data?.pages.flatMap(page => page.rows) ?? initialUsers,
    [data, initialUsers]
  );

  const from = users.length > 0 ? 1 : 0;
  const to = users.length;

  // Row selection
  const rowIds = useMemo(() => users.map(user => user.id), [users]);

  const {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useRowSelection(rowIds);

  // TanStack Table row selection state
  const rowSelection = useMemo(() => {
    return Object.fromEntries(Array.from(selectedIds).map(id => [id, true]));
  }, [selectedIds]);

  // Refs for selection state to avoid column recreation on every selection change
  const selectedIdsRef = useRef(selectedIds);
  // eslint-disable-next-line react-hooks/refs -- stable ref read for TanStack Table column def
  selectedIdsRef.current = selectedIds;
  const headerCheckboxStateRef = useRef(headerCheckboxState);
  // eslint-disable-next-line react-hooks/refs -- stable ref read for TanStack Table column def
  headerCheckboxStateRef.current = headerCheckboxState;

  // Context menu items for right-click AND actions button
  const getContextMenuItems = useCallback(
    (user: AdminUserRow): ContextMenuItemType[] => {
      const items: ContextMenuItemType[] = [];

      // Copy Clerk user ID, Copy email, Copy User ID
      items.push(
        {
          id: 'copy-clerk-id',
          label: 'Copy Clerk user ID',
          icon: <Copy className='h-3.5 w-3.5' />,
          onClick: () => {
            copyToClipboard(user.clerkId).then(ok => {
              if (ok) {
                toast.success('Clerk ID copied', { duration: 2000 });
              } else {
                toast.error('Failed to copy Clerk ID');
              }
            });
          },
        },
        {
          id: 'copy-email',
          label: 'Copy email',
          icon: <Copy className='h-3.5 w-3.5' />,
          onClick: () => {
            if (user.email) {
              copyToClipboard(user.email).then(ok => {
                if (ok) {
                  toast.success('Email copied', { duration: 2000 });
                } else {
                  toast.error('Failed to copy email');
                }
              });
            }
          },
          disabled: !user.email,
        },
        {
          id: 'copy-user-id',
          label: 'Copy User ID',
          icon: <Copy className='h-3.5 w-3.5' />,
          onClick: () => {
            copyToClipboard(user.id).then(ok => {
              if (ok) {
                toast.success('User ID copied', { duration: 2000 });
              } else {
                toast.error('Failed to copy User ID');
              }
            });
          },
        }
      );

      // Open in Clerk (if has Clerk ID)
      const hasClerkConsoleUrl = user.clerkId.length > 0;
      if (hasClerkConsoleUrl) {
        const clerkConsoleUrl = `https://dashboard.clerk.com/apps/users/user_${encodeURIComponent(user.clerkId)}`;
        items.push(
          { type: 'separator' as const },
          {
            id: 'open-in-clerk',
            label: 'Open in Clerk',
            icon: <ExternalLink className='h-3.5 w-3.5' />,
            onClick: () => {
              globalThis.open(clerkConsoleUrl, '_blank', 'noopener,noreferrer');
            },
          }
        );
      }

      return items;
    },
    []
  );

  // Bulk actions
  const bulkActions = useMemo(() => {
    const selectedUsers = users.filter(u => selectedIds.has(u.id));

    return [
      {
        label: 'Copy Clerk IDs',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: async () => {
          const ids = selectedUsers.map(u => u.clerkId).filter(Boolean);
          if (ids.length === 0) return;
          const ok = await copyToClipboard(ids.join('\n'));
          if (ok) {
            toast.success(`Copied ${ids.length} Clerk ID(s)`);
            clearSelection();
          } else {
            toast.error('Failed to copy Clerk IDs');
          }
        },
      },
      {
        label: 'Copy Emails',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: async () => {
          const emails = selectedUsers.map(u => u.email).filter(Boolean);
          if (emails.length === 0) return;
          const ok = await copyToClipboard(emails.join('\n'));
          if (ok) {
            toast.success(`Copied ${emails.length} email(s)`);
            clearSelection();
          } else {
            toast.error('Failed to copy emails');
          }
        },
      },
    ];
  }, [users, selectedIds, clearSelection]);

  // Create memoized cell renderers using refs to avoid column recreation on selection change
  const SelectHeader = useMemo(
    // eslint-disable-next-line react-hooks/refs -- stable ref read for TanStack Table column def
    () => createSelectHeaderRenderer(headerCheckboxStateRef, toggleSelectAll),
    [toggleSelectAll]
  );

  /* eslint-disable react-hooks/refs -- stable ref read for TanStack Table column def */
  const SelectCell = useMemo(
    () => createSelectCellRenderer(selectedIdsRef, toggleSelect),
    [toggleSelect]
  );
  /* eslint-enable react-hooks/refs */

  const ActionsCell = useMemo(
    () => createActionsCellRenderer(getContextMenuItems),
    [getContextMenuItems]
  );

  // Define columns using TanStack Table
  const columns = useMemo<ColumnDef<AdminUserRow, any>[]>(
    () => [
      // Checkbox column with row numbers
      columnHelper.display({
        id: 'select',
        header: SelectHeader,
        cell: SelectCell,
        size: 56,
      }),

      // Name column
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Name',
        cell: renderNameCell,
        size: 320,
      }),

      // Sign up (Created) column
      columnHelper.accessor('createdAt', {
        id: 'created',
        header: 'Sign up',
        cell: renderCreatedDateCell,
        size: 160,
      }),

      // Plan column
      columnHelper.accessor('plan', {
        id: 'plan',
        header: 'Plan',
        cell: renderPlanCell,
        size: 140,
      }),

      // Status column
      columnHelper.display({
        id: 'status',
        header: 'Status',
        cell: renderStatusCell,
        size: 120,
      }),

      // Actions column - shows ellipsis menu with SAME items as right-click context menu
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ActionsCell,
        size: 48,
      }),
    ],
    [SelectHeader, SelectCell, ActionsCell]
  );

  // Get row className - uses unified hover token
  const getRowClassName = useCallback(() => {
    return 'group hover:bg-surface-2/50';
  }, []);

  return (
    <QueryErrorBoundary fallback={TableErrorFallback}>
      <AdminTableShell
        testId='admin-users-content'
        toolbar={
          <>
            {/* Bulk actions toolbar (shows when rows selected) */}
            <TableBulkActionsToolbar
              selectedCount={selectedCount}
              onClearSelection={clearSelection}
              actions={bulkActions}
            />

            {/* Main toolbar (always visible) */}
            <div className='flex items-center justify-between border-b border-subtle bg-transparent px-4 py-1'>
              <div className='hidden text-xs text-secondary-token tabular-nums md:block'>
                Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
                {total.toLocaleString()} users
              </div>
              <ActionBar className='hidden md:flex ml-auto'>
                <ActionBarItem tooltipLabel='Export'>
                  <ExportCSVButton<AdminUserRow>
                    getData={() => users}
                    columns={usersCSVColumns}
                    filename={USERS_CSV_FILENAME_PREFIX}
                    disabled={users.length === 0}
                    ariaLabel='Export users to CSV file'
                    variant='ghost'
                    size='sm'
                    label='Export'
                    className={ACTION_BAR_BUTTON_CLASS}
                  />
                </ActionBarItem>
              </ActionBar>
            </div>
          </>
        }
      >
        {() => (
          <UnifiedTable
            data={users}
            columns={columns}
            rowSelection={rowSelection}
            isLoading={false}
            emptyState={
              <div className='px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3'>
                <Users className='h-6 w-6' />
                <div>
                  <div className='font-medium'>No users found</div>
                  <div className='text-xs'>
                    {search
                      ? 'Try adjusting your search terms or clearing the filter.'
                      : 'Users will appear here once they sign up.'}
                  </div>
                </div>
              </div>
            }
            getRowId={row => row.id}
            getRowClassName={getRowClassName}
            getContextMenuItems={getContextMenuItems}
            enableVirtualization={true}
            minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
            className='text-[13px]'
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => {
              fetchNextPage().catch(() => {});
            }}
          />
        )}
      </AdminTableShell>
    </QueryErrorBoundary>
  );
}

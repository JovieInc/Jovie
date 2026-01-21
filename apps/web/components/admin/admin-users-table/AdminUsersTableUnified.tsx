'use client';

import { Badge, Button, Input } from '@jovie/ui';
import {
  type ColumnDef,
  createColumnHelper,
  type Row,
  type Table,
} from '@tanstack/react-table';
import { Copy, ExternalLink, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  AdminPageSizeSelect,
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  ExportCSVButton,
  type HeaderCheckboxState,
  TableBulkActionsToolbar,
  TableCheckboxCell,
  UnifiedTable,
  useRowSelection,
} from '@/components/organisms/table';
import {
  USERS_CSV_FILENAME_PREFIX,
  usersCSVColumns,
} from '@/lib/admin/csv-configs/users';
import type { AdminUserRow } from '@/lib/admin/users';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import type { AdminUsersTableProps } from './types';
import { useAdminUsersTable } from './useAdminUsersTable';

const columnHelper = createColumnHelper<AdminUserRow>();

interface AdminUsersSelectionHeaderProps {
  table: Table<AdminUserRow>;
  headerCheckboxState: HeaderCheckboxState;
  onToggleSelectAll: () => void;
}

function AdminUsersSelectionHeader({
  table,
  headerCheckboxState,
  onToggleSelectAll,
}: AdminUsersSelectionHeaderProps) {
  return (
    <TableCheckboxCell
      table={table}
      headerCheckboxState={headerCheckboxState}
      onToggleSelectAll={onToggleSelectAll}
    />
  );
}

interface AdminUsersSelectionCellProps {
  row: Row<AdminUserRow>;
  rowNumber: number;
  isChecked: boolean;
  onToggleSelect: () => void;
}

function AdminUsersSelectionCell({
  row,
  rowNumber,
  isChecked,
  onToggleSelect,
}: AdminUsersSelectionCellProps) {
  return (
    <TableCheckboxCell
      row={row}
      rowNumber={rowNumber}
      isChecked={isChecked}
      onToggleSelect={onToggleSelect}
    />
  );
}

interface AdminUsersNameCellProps {
  name?: string | null;
  email?: string | null;
}

function AdminUsersNameCell({ name, email }: AdminUsersNameCellProps) {
  return (
    <div>
      <div className='font-semibold text-primary-token'>{name ?? 'User'}</div>
      <div className='text-xs text-secondary-token'>{email ?? '—'}</div>
    </div>
  );
}

interface AdminUsersPlanCellProps {
  plan: AdminUserRow['plan'];
}

function AdminUsersPlanCell({ plan }: AdminUsersPlanCellProps) {
  return (
    <Badge size='sm' variant={plan === 'pro' ? 'primary' : 'secondary'}>
      {plan}
    </Badge>
  );
}

interface AdminUsersStatusCellProps {
  deletedAt: AdminUserRow['deletedAt'];
}

function AdminUsersStatusCell({ deletedAt }: AdminUsersStatusCellProps) {
  return deletedAt ? (
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

interface AdminUsersActionsCellProps {
  items: ReturnType<typeof convertContextMenuItems>;
}

function AdminUsersActionsCell({ items }: AdminUsersActionsCellProps) {
  return (
    <div className='flex items-center justify-end'>
      <TableActionMenu items={items} align='end' />
    </div>
  );
}

export function AdminUsersTableUnified(props: AdminUsersTableProps) {
  const { users, page, pageSize, total, search, sort } = props;

  const { router, pagination } = useAdminUsersTable(props);

  const {
    totalPages,
    canPrev,
    canNext,
    from,
    to,
    prevHref,
    nextHref,
    clearHref,
    buildHref,
  } = pagination;

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

  // Context menu items for right-click AND actions button
  const getContextMenuItems = useCallback(
    (user: AdminUserRow): ContextMenuItemType[] => {
      const items: ContextMenuItemType[] = [];

      // Copy Clerk user ID
      items.push({
        id: 'copy-clerk-id',
        label: 'Copy Clerk user ID',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => {
          navigator.clipboard.writeText(user.clerkId);
          toast.success('Clerk ID copied', { duration: 2000 });
        },
      });

      // Copy email
      items.push({
        id: 'copy-email',
        label: 'Copy email',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => {
          if (user.email) {
            navigator.clipboard.writeText(user.email);
            toast.success('Email copied', { duration: 2000 });
          }
        },
        disabled: !user.email,
      });

      // Copy User ID
      items.push({
        id: 'copy-user-id',
        label: 'Copy User ID',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => {
          navigator.clipboard.writeText(user.id);
          toast.success('User ID copied', { duration: 2000 });
        },
      });

      // Open in Clerk (if has Clerk ID)
      const hasClerkConsoleUrl = user.clerkId.length > 0;
      if (hasClerkConsoleUrl) {
        const clerkConsoleUrl = `https://dashboard.clerk.com/apps/users/user_${encodeURIComponent(user.clerkId)}`;
        items.push({ type: 'separator' as const });
        items.push({
          id: 'open-in-clerk',
          label: 'Open in Clerk',
          icon: <ExternalLink className='h-3.5 w-3.5' />,
          onClick: () => {
            window.open(clerkConsoleUrl, '_blank', 'noopener,noreferrer');
          },
        });
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
        icon: <Copy className='h-4 w-4' />,
        onClick: () => {
          const ids = selectedUsers.map(u => u.clerkId).join('\n');
          navigator.clipboard.writeText(ids);
          clearSelection();
        },
      },
      {
        label: 'Copy Emails',
        icon: <Copy className='h-4 w-4' />,
        onClick: () => {
          const emails = selectedUsers
            .map(u => u.email)
            .filter(Boolean)
            .join('\n');
          navigator.clipboard.writeText(emails);
          clearSelection();
        },
      },
    ];
  }, [users, selectedIds, clearSelection]);

  // Define columns using TanStack Table
  const columns = useMemo<ColumnDef<AdminUserRow, any>[]>(
    () => [
      // Checkbox column with row numbers
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <AdminUsersSelectionHeader
            table={table}
            headerCheckboxState={headerCheckboxState}
            onToggleSelectAll={toggleSelectAll}
          />
        ),
        cell: ({ row }) => {
          const user = row.original;
          const isChecked = selectedIds.has(user.id);
          const rowNumber = (page - 1) * pageSize + row.index + 1;

          return (
            <AdminUsersSelectionCell
              row={row}
              rowNumber={rowNumber}
              isChecked={isChecked}
              onToggleSelect={() => toggleSelect(user.id)}
            />
          );
        },
        size: 56,
      }),

      // Name column
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Name',
        cell: ({ getValue, row }) => {
          const user = row.original;
          return <AdminUsersNameCell name={getValue()} email={user.email} />;
        },
        size: 320,
      }),

      // Sign up (Created) column
      columnHelper.accessor('createdAt', {
        id: 'created',
        header: 'Sign up',
        cell: ({ getValue }) => <DateCell date={getValue()} />,
        size: 160,
      }),

      // Plan column
      columnHelper.accessor('plan', {
        id: 'plan',
        header: 'Plan',
        cell: ({ getValue }) => {
          const plan = getValue();
          return <AdminUsersPlanCell plan={plan} />;
        },
        size: 140,
      }),

      // Status column
      columnHelper.display({
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const user = row.original;
          return <AdminUsersStatusCell deletedAt={user.deletedAt} />;
        },
        size: 120,
      }),

      // Actions column - shows ellipsis menu with SAME items as right-click context menu
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const user = row.original;
          const contextMenuItems = getContextMenuItems(user);
          const actionMenuItems = convertContextMenuItems(contextMenuItems);

          return <AdminUsersActionsCell items={actionMenuItems} />;
        },
        size: 48,
      }),
    ],
    [
      getContextMenuItems,
      headerCheckboxState,
      toggleSelectAll,
      selectedIds,
      page,
      pageSize,
      toggleSelect,
    ]
  );

  // Get row className - uses unified hover token
  const getRowClassName = useCallback(() => {
    return 'group hover:bg-surface-2/50';
  }, []);

  return (
    <QueryErrorBoundary fallback={TableErrorFallback}>
      <AdminTableShell
        toolbar={
          <>
            {/* Bulk actions toolbar (shows when rows selected) */}
            <TableBulkActionsToolbar
              selectedCount={selectedCount}
              onClearSelection={clearSelection}
              actions={bulkActions}
            />

            {/* Main toolbar (always visible) */}
            <div className='flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 sm:py-3'>
              <div className='text-xs text-secondary-token'>
                <span className='hidden sm:inline'>Showing </span>
                {from.toLocaleString()}–{to.toLocaleString()} of{' '}
                {total.toLocaleString()}
                <span className='hidden sm:inline'> users</span>
              </div>
              <div className='flex items-center gap-2'>
                <form
                  action='/app/admin/users'
                  method='get'
                  className='relative isolate flex items-center gap-2'
                >
                  <input type='hidden' name='sort' value={sort} />
                  <input
                    type='hidden'
                    name='pageSize'
                    value={String(pageSize)}
                  />
                  <Input
                    name='q'
                    defaultValue={search}
                    placeholder='Search by email or name'
                    className='w-[240px]'
                  />
                  <input type='hidden' name='page' value='1' />
                  <Button type='submit' size='sm' variant='secondary'>
                    Search
                  </Button>
                  {search ? (
                    <Button asChild size='sm' variant='ghost'>
                      <Link href={clearHref}>Clear</Link>
                    </Button>
                  ) : null}
                </form>
                <ExportCSVButton<AdminUserRow>
                  getData={() => users}
                  columns={usersCSVColumns}
                  filename={USERS_CSV_FILENAME_PREFIX}
                  disabled={users.length === 0}
                  ariaLabel='Export users to CSV file'
                />
              </div>
            </div>
          </>
        }
        footer={
          <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-secondary-token'>
            <div className='flex items-center gap-2'>
              <span>
                Page {page} of {totalPages}
              </span>
              <span className='text-tertiary-token'>
                {from.toLocaleString()}–{to.toLocaleString()} of{' '}
                {total.toLocaleString()}
              </span>
            </div>
            <div className='flex items-center gap-3'>
              <AdminPageSizeSelect
                initialPageSize={pageSize}
                onPageSizeChange={nextPageSize => {
                  router.push(buildHref({ page: 1, pageSize: nextPageSize }));
                }}
              />
              <div className='flex items-center gap-2'>
                <Button asChild size='sm' variant='ghost' disabled={!canPrev}>
                  <Link href={prevHref ?? '#'} aria-disabled={!canPrev}>
                    Previous
                  </Link>
                </Button>
                <Button asChild size='sm' variant='ghost' disabled={!canNext}>
                  <Link href={nextHref ?? '#'} aria-disabled={!canNext}>
                    Next
                  </Link>
                </Button>
              </div>
            </div>
          </div>
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
          />
        )}
      </AdminTableShell>
    </QueryErrorBoundary>
  );
}

'use client';

import { Badge, Button } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { Copy, ExternalLink, Search, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AdminTableHeader,
  AdminTableSubheader,
} from '@/components/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  ExportCSVButton,
  TableBulkActionsToolbar,
  UnifiedTable,
  useRowSelection,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  USERS_CSV_FILENAME_PREFIX,
  usersCSVColumns,
} from '@/lib/admin/csv-configs/users';
import type { AdminUserRow } from '@/lib/admin/users';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { useAdminUsersInfiniteQuery } from '@/lib/queries/admin-infinite';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import { AdminUserDetailDrawer } from './AdminUserDetailDrawer';
import type { AdminUsersTableProps } from './types';
import {
  createActionsCellRenderer,
  createSelectCellRenderer,
  createSelectHeaderRenderer,
  renderCreatedDateCell,
  renderFunnelCell,
  renderLifecycleCell,
  renderNameCell,
  renderPlanCell,
  renderProfileCell,
  renderStatusCell,
  renderSuppressionCell,
  renderUsernameCell,
  renderWelcomeCell,
} from './utils/column-renderers';

const columnHelper = createColumnHelper<AdminUserRow>();

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

interface AdminUserMobileCardProps {
  readonly user: AdminUserRow;
  readonly isSelected: boolean;
  readonly onToggleSelect: (id: string) => void;
  readonly contextMenuItems: ContextMenuItemType[];
}

function AdminUserMobileCard({
  user,
  isSelected,
  onToggleSelect,
  contextMenuItems,
}: Readonly<AdminUserMobileCardProps>) {
  const actionItems = convertContextMenuItems(contextMenuItems);

  return (
    <article className='rounded-xl border border-subtle bg-surface-1 px-4 py-3'>
      <div className='mb-3 flex items-start justify-between gap-3'>
        <label className='flex min-w-0 flex-1 cursor-pointer items-start gap-3'>
          <input
            type='checkbox'
            checked={isSelected}
            onChange={() => onToggleSelect(user.id)}
            className='mt-0.5 h-4 w-4 rounded border-subtle text-accent focus:ring-accent'
            aria-label={`Select ${user.name ?? user.email ?? 'user'}`}
          />
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold text-primary-token'>
              {user.name || 'Email Subscriber'}
            </p>
            <p className='truncate text-xs text-secondary-token'>
              {user.email ?? 'No email'}
            </p>
          </div>
        </label>
        <TableActionMenu items={actionItems} align='end' />
      </div>

      <div className='flex flex-wrap items-center gap-2 text-xs'>
        <Badge
          size='sm'
          variant={user.plan === 'pro' ? 'primary' : 'secondary'}
        >
          {user.plan}
        </Badge>
        {user.deletedAt ? (
          <Badge size='sm' variant='warning'>
            Deleted
          </Badge>
        ) : (
          <Badge size='sm' variant='success'>
            Active
          </Badge>
        )}
        <span className='text-secondary-token'>
          Joined {user.createdAt ? dateFormatter.format(user.createdAt) : '—'}
        </span>
      </div>
    </article>
  );
}

export function AdminUsersTableUnified(props: Readonly<AdminUsersTableProps>) {
  const { users: initialUsers, pageSize, total, search, sort } = props;
  const [searchTerm, setSearchTerm] = useState(search);

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
  const isMobile = useBreakpointDown('md');

  // Detail drawer state
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  const handleRowClick = useCallback((user: AdminUserRow) => {
    setSelectedUser(prev => (prev?.id === user.id ? null : user));
  }, []);

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
        size: 260,
      }),

      // Jovie Username column
      columnHelper.display({
        id: 'username',
        header: 'Jovie Username',
        cell: renderUsernameCell,
        size: 180,
      }),

      // Sign up (Created) column
      columnHelper.accessor('createdAt', {
        id: 'created',
        header: 'Sign up',
        cell: renderCreatedDateCell,
        size: 160,
      }),

      // Profile column
      columnHelper.accessor('profileUsername', {
        id: 'profile',
        header: 'Profile',
        cell: renderProfileCell,
        size: 160,
      }),

      // Funnel status column
      columnHelper.accessor('userStatus', {
        id: 'funnel',
        header: 'Funnel',
        cell: renderFunnelCell,
        size: 140,
      }),

      // Plan column
      columnHelper.accessor('plan', {
        id: 'plan',
        header: 'Plan',
        cell: renderPlanCell,
        size: 120,
      }),

      // Status column
      columnHelper.display({
        id: 'status',
        header: 'Status',
        cell: renderStatusCell,
        size: 100,
      }),

      // Lifecycle column
      columnHelper.display({
        id: 'lifecycle',
        header: 'Lifecycle',
        cell: renderLifecycleCell,
        size: 120,
      }),

      // Suppression column
      columnHelper.display({
        id: 'suppression',
        header: 'Suppressed',
        cell: renderSuppressionCell,
        size: 130,
      }),

      // Welcome email column
      columnHelper.display({
        id: 'welcome',
        header: 'Welcome',
        cell: renderWelcomeCell,
        size: 130,
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

  // Get row className - highlight selected row, hover for others
  const getRowClassName = useCallback(
    (row: AdminUserRow) =>
      row.id === selectedUser?.id
        ? 'bg-white/[0.04] cursor-pointer'
        : 'group hover:bg-white/[0.02] cursor-pointer',
    [selectedUser?.id]
  );

  return (
    <QueryErrorBoundary fallback={TableErrorFallback}>
      <div className='flex h-full'>
        <div className='flex-1 min-w-0'>
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
                <AdminTableHeader
                  title='Users'
                  subtitle='Review lifecycle state, profile completion, and suppression health.'
                />
                <AdminTableSubheader>
                  <div className='flex flex-wrap items-center justify-between gap-2 sm:gap-3'>
                    <div className='text-xs text-secondary-token tabular-nums'>
                      <span className='hidden sm:inline'>Showing </span>
                      {from.toLocaleString()}–{to.toLocaleString()} of{' '}
                      {total.toLocaleString()}
                      <span className='hidden sm:inline'> users</span>
                    </div>
                    <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
                      <form
                        action={APP_ROUTES.ADMIN_USERS}
                        method='get'
                        className='relative isolate flex w-full items-center gap-2 sm:w-auto'
                      >
                        <input type='hidden' name='sort' value={sort} />
                        <input type='hidden' name='q' value={searchTerm} />
                        <AppSearchField
                          value={searchTerm}
                          onChange={setSearchTerm}
                          placeholder='Search by email, name, or handle'
                          ariaLabel='Search users by email, name, or handle'
                          className='min-w-0 flex-1 sm:w-[280px] sm:flex-none'
                        />
                        <AppIconButton
                          type='submit'
                          ariaLabel='Search users'
                          tooltipLabel='Search users'
                        >
                          <Search />
                        </AppIconButton>
                        {search ? (
                          <AppIconButton
                            asChild
                            ariaLabel='Clear user search'
                            tooltipLabel='Clear search'
                          >
                            <Link href='?'>
                              <X />
                            </Link>
                          </AppIconButton>
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
                </AdminTableSubheader>
              </>
            }
          >
            {() =>
              isMobile ? (
                <div className='space-y-3 p-3'>
                  {users.length === 0 ? (
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
                  ) : (
                    users.map(user => (
                      <AdminUserMobileCard
                        key={user.id}
                        user={user}
                        isSelected={selectedIds.has(user.id)}
                        onToggleSelect={toggleSelect}
                        contextMenuItems={getContextMenuItems(user)}
                      />
                    ))
                  )}

                  {hasNextPage ? (
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      className='w-full'
                      loading={isFetchingNextPage}
                      onClick={() => {
                        fetchNextPage().catch(() => {});
                      }}
                    >
                      Load more users
                    </Button>
                  ) : null}
                </div>
              ) : (
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
                  onRowClick={handleRowClick}
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
              )
            }
          </AdminTableShell>
        </div>
        <AdminUserDetailDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      </div>
    </QueryErrorBoundary>
  );
}

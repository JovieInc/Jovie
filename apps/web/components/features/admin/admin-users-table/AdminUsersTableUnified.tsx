'use client';

import { Badge, Button } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { Copy, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { HeaderSearchAction } from '@/components/molecules/HeaderSearchAction';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  convertToCommonDropdownItems,
  ExportCSVButton,
  PAGE_TOOLBAR_END_GROUP_CLASS,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  TableBulkActionsToolbar,
  UnifiedTable,
  useRowSelection,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import {
  AdminTableHeader,
  AdminTableSubheader,
} from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { DashboardHeaderActionGroup } from '@/features/dashboard/atoms/DashboardHeaderActionGroup';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  USERS_CSV_FILENAME_PREFIX,
  usersCSVColumns,
} from '@/lib/admin/csv-configs/users';
import type { AdminUserRow } from '@/lib/admin/users';
import { SIDEBAR_WIDTH, TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { QueryErrorBoundary, useAdminUsersInfiniteQuery } from '@/lib/queries';
import { AdminUserDetailDrawer } from './AdminUserDetailDrawer';
import {
  type BuildAdminUserActionsCallbacks,
  buildAdminUserActions,
} from './admin-user-actions';
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
    <ContentSurfaceCard
      as='article'
      className='overflow-hidden bg-surface-0 p-0'
    >
      <div className='flex items-start justify-between gap-3 px-3 py-2.5'>
        <label className='flex min-w-0 flex-1 cursor-pointer items-start gap-3'>
          <input
            type='checkbox'
            checked={isSelected}
            onChange={() => onToggleSelect(user.id)}
            className='mt-0.5 h-4 w-4 rounded border-subtle bg-surface-0 text-(--linear-accent) focus:ring-(--linear-border-focus) focus:ring-1'
            aria-label={`Select ${user.name ?? user.email ?? 'user'}`}
          />
          <div className='min-w-0'>
            <p className='truncate text-[14px] font-[560] tracking-[-0.01em] text-primary-token'>
              {user.name || 'Email Subscriber'}
            </p>
            <p className='truncate text-[12px] text-secondary-token'>
              {user.email ?? 'No email'}
            </p>
          </div>
        </label>
        <TableActionMenu items={actionItems} align='end' />
      </div>

      <div className='flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]'>
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
    </ContentSurfaceCard>
  );
}

export function AdminUsersTableUnified(props: Readonly<AdminUsersTableProps>) {
  const { users: initialUsers, pageSize, total, search, sort } = props;
  const [searchTerm, setSearchTerm] = useState(search);

  useEffect(() => {
    setSearchTerm(search);
  }, [search]);

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
  const { setTableMeta } = useTableMeta();
  const { setHeaderActions } = useSetHeaderActions();
  const usersRef = useRef(users);
  usersRef.current = users;

  const handleRowClick = useCallback((user: AdminUserRow) => {
    setSelectedUser(prev => (prev?.id === user.id ? null : user));
  }, []);

  useEffect(() => {
    const toggle = () => {
      if (selectedUser) {
        setSelectedUser(null);
        return;
      }

      const firstUser = usersRef.current[0];
      if (firstUser) {
        setSelectedUser(firstUser);
      }
    };

    setTableMeta({
      rowCount: users.length,
      toggle: users.length > 0 ? toggle : null,
      rightPanelWidth: selectedUser ? SIDEBAR_WIDTH : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTableMeta is a stable context setter
  }, [selectedUser, users.length]);

  const headerActions = useMemo(
    () => (
      <DashboardHeaderActionGroup
        trailing={
          <DrawerToggleButton
            ariaLabel='Toggle user details'
            label='Details'
            tooltipLabel='Details'
          />
        }
      >
        <HeaderSearchAction
          action={APP_ROUTES.ADMIN_USERS}
          clearHref={`${APP_ROUTES.ADMIN_USERS}?sort=${sort}`}
          searchValue={searchTerm}
          onSearchValueChange={setSearchTerm}
          placeholder='Search by email, name, or handle'
          ariaLabel='Search users by email, name, or handle'
          submitAriaLabel='Search users'
          hiddenInputs={[{ name: 'sort', value: sort }]}
          tooltipLabel='Search'
        />
      </DashboardHeaderActionGroup>
    ),
    [searchTerm, sort]
  );

  useEffect(() => {
    setHeaderActions(headerActions);

    return () => {
      setHeaderActions(null);
    };
  }, [headerActions, setHeaderActions]);

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
  selectedIdsRef.current = selectedIds;
  const headerCheckboxStateRef = useRef(headerCheckboxState);
  headerCheckboxStateRef.current = headerCheckboxState;

  // Action callbacks — clipboard + toast logic lives here, builder is pure
  const actionCallbacks = useMemo<BuildAdminUserActionsCallbacks>(
    () => ({
      onCopyClerkId: (u: AdminUserRow) => {
        copyToClipboard(u.clerkId).then(ok => {
          if (ok) {
            toast.success('Clerk ID copied', { duration: 2000 });
          } else {
            toast.error('Failed to copy Clerk ID');
          }
        });
      },
      onCopyEmail: (u: AdminUserRow) => {
        if (u.email) {
          copyToClipboard(u.email).then(ok => {
            if (ok) {
              toast.success('Email copied', { duration: 2000 });
            } else {
              toast.error('Failed to copy email');
            }
          });
        }
      },
      onCopyUserId: (u: AdminUserRow) => {
        copyToClipboard(u.id).then(ok => {
          if (ok) {
            toast.success('User ID copied', { duration: 2000 });
          } else {
            toast.error('Failed to copy User ID');
          }
        });
      },
      onOpenInClerk: (u: AdminUserRow) => {
        const clerkConsoleUrl = `https://dashboard.clerk.com/apps/users/user_${encodeURIComponent(u.clerkId)}`;
        globalThis.open(clerkConsoleUrl, '_blank', 'noopener,noreferrer');
      },
    }),
    []
  );

  // Context menu items for right-click AND actions button
  const getContextMenuItems = useCallback(
    (user: AdminUserRow): ContextMenuItemType[] =>
      buildAdminUserActions(user, actionCallbacks),
    [actionCallbacks]
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
      {
        label: 'Copy User IDs',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: async () => {
          const ids = selectedUsers.map(u => u.id).filter(Boolean);
          if (ids.length === 0) return;
          const ok = await copyToClipboard(ids.join('\n'));
          if (ok) {
            toast.success(`Copied ${ids.length} User ID(s)`);
            clearSelection();
          } else {
            toast.error('Failed to copy User IDs');
          }
        },
      },
    ];
  }, [users, selectedIds, clearSelection]);

  // Create memoized cell renderers using refs to avoid column recreation on selection change
  const SelectHeader = useMemo(
    () => createSelectHeaderRenderer(headerCheckboxStateRef, toggleSelectAll),
    [toggleSelectAll]
  );

  const SelectCell = useMemo(
    () => createSelectCellRenderer(selectedIdsRef, toggleSelect),
    [toggleSelect]
  );

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
        ? 'group cursor-pointer bg-(--linear-row-selected)'
        : 'group cursor-pointer',
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
                <AdminTableSubheader
                  start={
                    <div className={PAGE_TOOLBAR_META_TEXT_CLASS}>
                      Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
                      {total.toLocaleString()} users
                    </div>
                  }
                  end={
                    <div className={PAGE_TOOLBAR_END_GROUP_CLASS}>
                      <ExportCSVButton<AdminUserRow>
                        getData={() => users}
                        columns={usersCSVColumns}
                        filename={USERS_CSV_FILENAME_PREFIX}
                        disabled={users.length === 0}
                        ariaLabel='Export users to CSV file'
                        chrome='page-toolbar'
                        iconOnly
                        tooltipLabel='Export'
                      />
                    </div>
                  }
                />
              </>
            }
          >
            {() =>
              isMobile ? (
                <div className='space-y-2 p-3'>
                  {users.length === 0 ? (
                    <ContentSurfaceCard className='flex flex-col items-center gap-3 bg-surface-0 px-4 py-10 text-center'>
                      <Users className='h-6 w-6' />
                      <div>
                        <div className='text-sm font-[560] tracking-[-0.01em] text-primary-token'>
                          No users found
                        </div>
                        <div className='text-[12px] text-secondary-token'>
                          {search
                            ? 'Try adjusting your search terms or clearing the filter.'
                            : 'Users will appear here once they sign up.'}
                        </div>
                      </div>
                    </ContentSurfaceCard>
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
                    <ContentSurfaceCard className='mx-4 my-6 flex flex-col items-center gap-3 bg-surface-0 px-4 py-10 text-center'>
                      <Users className='h-6 w-6' />
                      <div>
                        <div className='text-sm font-[560] tracking-[-0.01em] text-primary-token'>
                          No users found
                        </div>
                        <div className='text-[12px] text-secondary-token'>
                          {search
                            ? 'Try adjusting your search terms or clearing the filter.'
                            : 'Users will appear here once they sign up.'}
                        </div>
                      </div>
                    </ContentSurfaceCard>
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
          contextMenuItems={
            selectedUser
              ? convertToCommonDropdownItems(getContextMenuItems(selectedUser))
              : undefined
          }
        />
      </div>
    </QueryErrorBoundary>
  );
}

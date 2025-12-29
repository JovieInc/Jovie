'use client';

import { Badge, Button, Input } from '@jovie/ui';
import { Copy, UserCog, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { type Column, Table } from '@/components/admin/table';
import { AdminPageSizeSelect } from '@/components/admin/table/AdminPageSizeSelect';
import { ExportCSVButton } from '@/components/admin/table/molecules/ExportCSVButton';
import { useAdminTablePaginationLinks } from '@/components/admin/table/useAdminTablePaginationLinks';
import { UserActionsMenu } from '@/components/admin/UserActionsMenu';
import {
  getNextUserSort,
  type UserSortableColumnKey,
} from '@/components/admin/users-sort-config';
import {
  USERS_CSV_FILENAME_PREFIX,
  usersCSVColumns,
} from '@/lib/admin/csv-configs/users';
import type { AdminUserRow, AdminUsersSort } from '@/lib/admin/users';
import { useNotifications } from '@/lib/hooks/useNotifications';

export interface AdminUsersTableProps {
  users: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
  sort: AdminUsersSort;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function AdminUsersTable({
  users,
  page,
  pageSize,
  total,
  search,
  sort,
}: AdminUsersTableProps) {
  const router = useRouter();
  const notifications = useNotifications();
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
  } = useAdminTablePaginationLinks<AdminUsersSort>({
    basePath: '/app/admin/users',
    page,
    pageSize,
    search,
    sort,
    total,
  });

  const createSortHref = (column: UserSortableColumnKey) =>
    buildHref({ page: 1, sort: getNextUserSort(sort, column) });

  const selectedUsers = useMemo(
    () => users.filter(user => selectedIds.has(user.id)),
    [selectedIds, users]
  );

  const copySelectedEmails = async (): Promise<void> => {
    const emails = selectedUsers
      .map(user => user.email)
      .filter(
        (email): email is string =>
          typeof email === 'string' && email.length > 0
      );

    if (emails.length === 0) {
      notifications.error('No emails available for selected users');
      return;
    }

    const success = await copyTextToClipboard(emails.join('\n'));
    if (success) {
      notifications.success(`Copied ${emails.length} email(s)`);
      return;
    }

    notifications.error('Failed to copy emails');
  };

  const copySelectedClerkIds = async (): Promise<void> => {
    const ids = selectedUsers
      .map(user => user.clerkId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (ids.length === 0) {
      notifications.error('No Clerk IDs available for selected users');
      return;
    }

    const success = await copyTextToClipboard(ids.join('\n'));
    if (success) {
      notifications.success(`Copied ${ids.length} Clerk ID(s)`);
      return;
    }

    notifications.error('Failed to copy Clerk IDs');
  };

  // Define table columns
  const columns: Column<AdminUserRow>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: user => (
          <div>
            <div className='font-semibold text-primary-token'>
              {user.name ?? '—'}
            </div>
            <div className='text-xs text-secondary-token'>{user.clerkId}</div>
          </div>
        ),
        sortable: true,
        width: 'w-[260px]',
      },
      {
        id: 'email',
        header: 'Email',
        cell: user => user.email ?? '—',
        sortable: true,
        width: 'w-[280px]',
        hideOnMobile: true,
      },
      {
        id: 'created',
        header: 'Sign up',
        cell: user =>
          new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }).format(user.createdAt),
        sortable: true,
        width: 'w-[160px]',
        hideOnMobile: true,
      },
      {
        id: 'plan',
        header: 'Plan',
        cell: user => (
          <Badge
            size='sm'
            variant={user.plan === 'pro' ? 'primary' : 'secondary'}
          >
            {user.plan}
          </Badge>
        ),
        width: 'w-[140px]',
        hideOnMobile: true,
      },
      {
        id: 'status',
        header: 'Status',
        cell: user =>
          user.deletedAt ? (
            <Badge size='sm' variant='warning'>
              Deleted
            </Badge>
          ) : (
            <Badge size='sm' variant='success'>
              Active
            </Badge>
          ),
        width: 'w-[120px]',
      },
      {
        id: 'actions',
        header: '',
        cell: user => (
          <div className='flex items-center justify-end'>
            <UserActionsMenu
              user={user}
              open={openMenuUserId === user.id}
              onOpenChange={open => setOpenMenuUserId(open ? user.id : null)}
            />
          </div>
        ),
        align: 'right',
        width: 'w-[72px]',
      },
    ],
    [openMenuUserId]
  );

  // Handle sorting with URL navigation
  const handleSortChange = (columnId: string) => {
    // Always use the createSortHref helper which handles the sort toggle logic
    router.push(createSortHref(columnId as UserSortableColumnKey));
  };

  // Determine current sort column and direction
  const sortColumn = sort
    ? sort.startsWith('-')
      ? sort.slice(1)
      : sort
    : null;
  const sortDirection = sort ? (sort.startsWith('-') ? 'desc' : 'asc') : null;

  return (
    <div className='space-y-4'>
      {/* Custom toolbar with search */}
      <div className='flex h-14 w-full items-center gap-3 px-4 bg-surface-0 border border-subtle rounded-lg'>
        <div className='hidden sm:block text-xs text-secondary-token'>
          Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
          {total.toLocaleString()} users
        </div>
        <div className='ml-auto flex items-center gap-3'>
          <form
            action='/app/admin/users'
            method='get'
            className='relative isolate flex items-center gap-2'
          >
            <input type='hidden' name='sort' value={sort} />
            <input type='hidden' name='pageSize' value={String(pageSize)} />
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

      {/* Table */}
      <Table
        data={users}
        columns={columns}
        getRowId={user => user.id}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        sortColumn={sortColumn}
        sortDirection={sortDirection as 'asc' | 'desc' | null}
        onSortChange={handleSortChange}
        bulkActions={[
          {
            label: 'Copy emails',
            icon: <Copy className='h-4 w-4' />,
            onClick: () => {
              void copySelectedEmails();
            },
          },
          {
            label: 'Copy Clerk IDs',
            icon: <UserCog className='h-4 w-4' />,
            onClick: () => {
              void copySelectedClerkIds();
            },
          },
        ]}
        virtualizationThreshold={20}
        rowHeight={60}
        caption='Admin users table'
        emptyState={{
          icon: <Users className='h-6 w-6' />,
          title: 'No users found',
          description: search
            ? 'Try adjusting your search terms or clearing the filter.'
            : 'Users will appear here once they sign up.',
        }}
      />

      {/* Custom footer with pagination */}
      <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-secondary-token bg-surface-0 border border-subtle rounded-lg'>
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
    </div>
  );
}

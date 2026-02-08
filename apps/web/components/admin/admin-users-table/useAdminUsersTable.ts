'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAdminTablePaginationLinks } from '@/components/admin/table/useAdminTablePaginationLinks';
import {
  getNextUserSort,
  type UserSortableColumnKey,
} from '@/components/admin/users-sort-config';
import { APP_ROUTES } from '@/constants/routes';
import type { AdminUserRow, AdminUsersSort } from '@/lib/admin/users';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { AdminUsersTableProps } from './types';
import { copyTextToClipboard } from './utils';

export interface UseAdminUsersTableReturn {
  router: ReturnType<typeof useRouter>;
  notifications: ReturnType<typeof useNotifications>;
  openMenuUserId: string | null;
  setOpenMenuUserId: (id: string | null) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  selectedUsers: AdminUserRow[];
  pagination: ReturnType<typeof useAdminTablePaginationLinks<AdminUsersSort>>;
  createSortHref: (column: UserSortableColumnKey) => string;
  copySelectedEmails: () => Promise<void>;
  copySelectedClerkIds: () => Promise<void>;
  handleSortChange: (columnId: string) => void;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc' | null;
}

export function useAdminUsersTable({
  users,
  page,
  pageSize,
  total,
  search,
  sort,
}: AdminUsersTableProps): UseAdminUsersTableReturn {
  const router = useRouter();
  const notifications = useNotifications();
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pagination = useAdminTablePaginationLinks<AdminUsersSort>({
    basePath: APP_ROUTES.ADMIN_USERS,
    page,
    pageSize,
    search,
    sort,
    total,
  });

  const createSortHref = (column: UserSortableColumnKey) =>
    pagination.buildHref({ page: 1, sort: getNextUserSort(sort, column) });

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

  const handleSortChange = (columnId: string) => {
    router.push(createSortHref(columnId as UserSortableColumnKey));
  };

  const getSortColumn = (): string | null => {
    if (!sort) return null;
    return sort.startsWith('-') ? sort.slice(1) : sort;
  };
  const sortColumn = getSortColumn();

  const getSortDirection = (): 'asc' | 'desc' | null => {
    if (!sort) return null;
    return sort.startsWith('-') ? 'desc' : 'asc';
  };
  const sortDirection = getSortDirection();

  return {
    router,
    notifications,
    openMenuUserId,
    setOpenMenuUserId,
    selectedIds,
    setSelectedIds,
    selectedUsers,
    pagination,
    createSortHref,
    copySelectedEmails,
    copySelectedClerkIds,
    handleSortChange,
    sortColumn,
    sortDirection,
  };
}

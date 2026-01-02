import type { AdminUserRow, AdminUsersSort } from '@/lib/admin/users';

export interface AdminUsersTableProps {
  users: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
  sort: AdminUsersSort;
}

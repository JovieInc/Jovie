import type { AdminUserRow, AdminUsersSort } from '@/lib/admin/users';

export interface AdminUsersTableProps {
  readonly users: AdminUserRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminUsersSort;
}

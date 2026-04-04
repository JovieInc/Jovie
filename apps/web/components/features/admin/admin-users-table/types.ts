import type { AdminUserRow, AdminUsersSort } from '@/lib/admin/types';

export interface AdminUsersTableProps {
  readonly users: AdminUserRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminUsersSort;
  readonly basePath?: string;
}

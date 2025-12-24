'use client';

import dynamic from 'next/dynamic';
import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';
import type { ContactSidebarMode } from '@/types';

const AdminCreatorProfilesWithSidebar = dynamic(
  () =>
    import('@/components/admin/AdminCreatorProfilesWithSidebar').then(mod => ({
      default: mod.AdminCreatorProfilesWithSidebar,
    })),
  {
    loading: () => (
      <div className='h-full w-full space-y-4 p-4'>
        <div className='flex items-center justify-between'>
          <div className='h-8 w-48 animate-pulse rounded bg-surface-1' />
          <div className='flex gap-2'>
            <div className='h-8 w-24 animate-pulse rounded bg-surface-1' />
            <div className='h-8 w-24 animate-pulse rounded bg-surface-1' />
          </div>
        </div>
        <div className='space-y-2'>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className='h-16 animate-pulse rounded-lg bg-surface-1'
            />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export interface LazyAdminCreatorProfilesWithSidebarProps {
  profiles: AdminCreatorProfileRow[];
  page: number;
  pageSize: number;
  total: number;
  search: string;
  sort: AdminCreatorProfilesSort;
  mode?: ContactSidebarMode;
  basePath?: string;
}

export function LazyAdminCreatorProfilesWithSidebar(
  props: LazyAdminCreatorProfilesWithSidebarProps
) {
  return <AdminCreatorProfilesWithSidebar {...props} />;
}

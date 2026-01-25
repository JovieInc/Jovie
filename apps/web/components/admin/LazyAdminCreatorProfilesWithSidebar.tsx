'use client';

import dynamic from 'next/dynamic';
import type { AdminCreatorProfilesWithSidebarProps } from '@/components/admin/admin-creator-profiles';

const ADMIN_CREATOR_PROFILES_LOADING_ROW_KEYS = Array.from(
  { length: 12 },
  (_, i) => `admin-creators-loading-row-${i + 1}`
);

const AdminCreatorProfilesWithSidebar = dynamic(
  () =>
    import('@/components/admin/admin-creator-profiles').then(mod => ({
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
          {ADMIN_CREATOR_PROFILES_LOADING_ROW_KEYS.map(key => (
            <div
              key={key}
              className='h-16 animate-pulse rounded-lg bg-surface-1'
            />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export type LazyAdminCreatorProfilesWithSidebarProps =
  AdminCreatorProfilesWithSidebarProps;

export function LazyAdminCreatorProfilesWithSidebar(
  props: Readonly<AdminCreatorProfilesWithSidebarProps>
) {
  return <AdminCreatorProfilesWithSidebar {...props} />;
}

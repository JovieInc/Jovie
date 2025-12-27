'use client';

import dynamic from 'next/dynamic';
import type { AdminCreatorProfilesWithSidebarProps } from '@/components/admin/AdminCreatorProfilesWithSidebar';

const skeletonRowKeys = [
  'row-1',
  'row-2',
  'row-3',
  'row-4',
  'row-5',
  'row-6',
  'row-7',
  'row-8',
  'row-9',
  'row-10',
  'row-11',
  'row-12',
] as const;

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
          {skeletonRowKeys.map(key => (
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
  props: AdminCreatorProfilesWithSidebarProps
) {
  return <AdminCreatorProfilesWithSidebar {...props} />;
}

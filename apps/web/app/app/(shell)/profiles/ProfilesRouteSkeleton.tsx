'use client';

import styles from '@/components/features/presence/presence-workspace.module.css';
import { PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table';
import { UnifiedTableSkeleton } from '@/components/organisms/table/organisms/UnifiedTableSkeleton';
import type { ColumnDef } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';

/**
 * Geometry-only projection of the Profiles table columns (id, header, size,
 * meta). Importing the live columns would pull the whole Presence workspace
 * into the shell fallback; `shell-route-skeleton.test.tsx` pins the headers
 * to the loaded table.
 */
export const PROFILES_TABLE_SKELETON_COLUMNS = [
  {
    id: 'label',
    header: 'Profile',
    size: 200,
    minSize: 140,
    meta: { className: 'px-3' },
  },
  { id: 'type', header: 'Type', size: 48, meta: { className: 'hidden' } },
  {
    id: 'status',
    header: 'Status',
    size: 120,
    meta: { className: cn('px-2', styles.statusColumn) },
  },
  {
    id: 'rank',
    header: 'Search Rank',
    size: 72,
    meta: { className: 'max-lg:hidden' },
  },
  {
    id: 'change',
    header: 'Change',
    size: 78,
    meta: { className: 'max-xl:hidden' },
  },
  {
    id: 'monitoring',
    header: 'Monitoring',
    size: 124,
    meta: { className: 'hidden 2xl:table-cell' },
  },
  {
    id: 'actions',
    header: 'Actions',
    size: 44,
    meta: { className: 'px-3', headerVisibility: 'sr-only' },
  },
] as ColumnDef<Record<string, never>, unknown>[];

const PROFILES_SKELETON_CONFIG = [
  { variant: 'person', width: '160px' },
  { variant: 'text', width: '24px' },
  { variant: 'badge', width: '72px' },
  { variant: 'meta', width: '32px' },
  { variant: 'meta', width: '40px' },
  { variant: 'text', width: '80px' },
  { variant: 'button', width: '24px' },
] as const;

/**
 * First-boot fallback for /app/presence and /app/profiles. Same frame,
 * toolbar and table header as `ProfilesWorkspace`, with rows held back.
 */
export function ProfilesRouteSkeleton() {
  return (
    <PageShell
      aria-busy='true'
      aria-label='Loading Profiles'
      aria-live='polite'
      frame='none'
      contentPadding='none'
      surfaceMode='table'
      maxWidth='wide'
      data-testid='profiles-route-skeleton'
      toolbar={
        <PageToolbar
          start={
            <span className='text-app font-medium text-primary-token'>
              Profiles
            </span>
          }
          end={
            <>
              <span className='skeleton h-8 w-36 rounded-full' />
              <span className='skeleton h-8 w-8 rounded-full sm:w-24' />
            </>
          }
        />
      }
    >
      <UnifiedTableSkeleton<Record<string, never>>
        columns={PROFILES_TABLE_SKELETON_COLUMNS}
        skeletonColumnConfig={[...PROFILES_SKELETON_CONFIG]}
        skeletonRows={8}
        rowMode='list'
        containerClassName='min-h-0 flex-1'
        minWidth='0'
        className={styles.table}
      />
    </PageShell>
  );
}

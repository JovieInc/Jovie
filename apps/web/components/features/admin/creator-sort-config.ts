import type { AdminCreatorProfilesSort } from '@/lib/admin/creator-profiles';

export const SORTABLE_COLUMNS = {
  created: {
    label: 'Created',
    asc: 'created_asc',
    desc: 'created_desc',
  },
  claimed: {
    label: 'Claimed',
    asc: 'claimed_asc',
    desc: 'claimed_desc',
  },
  verified: {
    label: 'Verified',
    asc: 'verified_asc',
    desc: 'verified_desc',
  },
} as const;

export type SortableColumnKey = keyof typeof SORTABLE_COLUMNS;

export function getNextSort(
  currentSort: AdminCreatorProfilesSort,
  column: SortableColumnKey
): AdminCreatorProfilesSort {
  const columnSort = SORTABLE_COLUMNS[column];
  return currentSort === columnSort.desc ? columnSort.asc : columnSort.desc;
}

export function getSortDirection(
  currentSort: AdminCreatorProfilesSort,
  column: SortableColumnKey
): 'asc' | 'desc' | undefined {
  const columnSort = SORTABLE_COLUMNS[column];
  if (currentSort === columnSort.asc) return 'asc';
  if (currentSort === columnSort.desc) return 'desc';
  return undefined;
}

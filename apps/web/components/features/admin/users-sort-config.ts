export const USER_SORTABLE_COLUMNS = {
  created: {
    label: 'Sign up',
    asc: 'created_asc',
    desc: 'created_desc',
  },
  name: {
    label: 'Name',
    asc: 'name_asc',
    desc: 'name_desc',
  },
  email: {
    label: 'Email',
    asc: 'email_asc',
    desc: 'email_desc',
  },
} as const;

export type UserSortableColumnKey = keyof typeof USER_SORTABLE_COLUMNS;

export type AdminUsersSort =
  | (typeof USER_SORTABLE_COLUMNS)[UserSortableColumnKey]['asc']
  | (typeof USER_SORTABLE_COLUMNS)[UserSortableColumnKey]['desc'];

export function getNextUserSort(
  currentSort: AdminUsersSort,
  column: UserSortableColumnKey
): AdminUsersSort {
  const columnSort = USER_SORTABLE_COLUMNS[column];
  return currentSort === columnSort.desc ? columnSort.asc : columnSort.desc;
}

export function getUserSortDirection(
  currentSort: AdminUsersSort,
  column: UserSortableColumnKey
): 'asc' | 'desc' | undefined {
  const columnSort = USER_SORTABLE_COLUMNS[column];
  if (currentSort === columnSort.asc) return 'asc';
  if (currentSort === columnSort.desc) return 'desc';
  return undefined;
}

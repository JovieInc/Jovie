import type { FilterFn } from '@tanstack/react-table';

/**
 * Creates a TanStack Table FilterFn that searches across arbitrary fields
 * on the row's original data. Use this when you need to search fields that
 * aren't column accessors (e.g., email in a users table where email isn't
 * a visible column).
 *
 * @example
 * const filterFn = createMultiFieldFilterFn<AdminUserRow>([
 *   row => row.email,
 *   row => row.name,
 *   row => row.profileUsername,
 * ]);
 *
 * <UnifiedTable
 *   globalFilter={searchTerm}
 *   enableFiltering
 *   globalFilterFn={filterFn}
 * />
 */
export function createMultiFieldFilterFn<TData>(
  fields: Array<(row: TData) => string | number | null | undefined>
): FilterFn<TData> {
  return (row, _columnId, filterValue) => {
    const search = String(filterValue).toLowerCase().trim();
    if (!search) return true;

    return fields.some(fn => {
      const val = fn(row.original);
      return val != null && String(val).toLowerCase().includes(search);
    });
  };
}

import {
  flexRender,
  type Header,
  type HeaderGroup,
} from '@tanstack/react-table';
import { cn, presets } from '@/components/organisms/table';

type HeaderVariant = 'loading' | 'standard';

export interface UnifiedTableHeaderProps<TData> {
  headerGroups: HeaderGroup<TData>[];
  variant: HeaderVariant;
}

const renderSortIcon = (sortDirection: false | 'asc' | 'desc') => {
  if (!sortDirection) return null;

  return (
    <svg
      width='12'
      height='12'
      viewBox='0 0 12 12'
      fill='none'
      className='shrink-0'
      style={{ color: 'lch(62.6% 1.35 272 / 1)' }}
      aria-hidden='true'
    >
      {sortDirection === 'asc' ? (
        <path d='M6 3L9 7H3L6 3Z' fill='currentColor' />
      ) : (
        <path d='M6 9L3 5H9L6 9Z' fill='currentColor' />
      )}
    </svg>
  );
};

const renderHeaderCell = <TData,>(
  header: Header<TData, unknown>,
  variant: HeaderVariant
) => {
  if (header.isPlaceholder) {
    return null;
  }

  const headerContent = flexRender(
    header.column.columnDef.header,
    header.getContext()
  );

  if (variant === 'loading') {
    return <div className={cn(presets.tableHeader)}>{headerContent}</div>;
  }

  const canSort = header.column.getCanSort();
  const sortDirection = header.column.getIsSorted();

  if (!canSort) {
    return <div className={cn(presets.tableHeader)}>{headerContent}</div>;
  }

  return (
    <button
      type='button'
      onClick={header.column.getToggleSortingHandler()}
      className={cn(
        'flex items-center gap-2 px-6 py-3 text-left w-full',
        'text-xs font-semibold uppercase tracking-wide text-tertiary-token line-clamp-1',
        'hover:bg-surface-2/50 transition-colors rounded-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
      )}
    >
      {headerContent}
      {renderSortIcon(sortDirection)}
    </button>
  );
};

export function UnifiedTableHeader<TData>({
  headerGroups,
  variant,
}: UnifiedTableHeaderProps<TData>) {
  const groupsToRender =
    variant === 'loading' ? headerGroups.slice(0, 1) : headerGroups;

  return (
    <thead>
      {groupsToRender.map(headerGroup => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map(header => {
            const canSort =
              variant === 'standard' && header.column.getCanSort();
            const sortDirection = canSort ? header.column.getIsSorted() : false;

            const ariaSort = canSort
              ? sortDirection === 'asc'
                ? 'ascending'
                : sortDirection === 'desc'
                  ? 'descending'
                  : 'none'
              : undefined;

            return (
              <th
                key={header.id}
                className={cn(
                  presets.stickyHeader,
                  variant === 'loading' && presets.tableHeader
                )}
                style={{
                  width:
                    header.getSize() !== 150 ? header.getSize() : undefined,
                }}
                aria-sort={ariaSort}
              >
                {renderHeaderCell(header, variant)}
              </th>
            );
          })}
        </tr>
      ))}
    </thead>
  );
}

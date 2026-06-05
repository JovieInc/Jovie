import { cn } from '@/lib/utils';

interface ReleaseTableRowClassNameOptions {
  readonly designV1: boolean;
  readonly isExpanded?: boolean;
  readonly isFlashed: boolean;
  readonly isRefreshing: boolean;
  readonly isSelected: boolean;
}

export function getReleaseTableRowClassName({
  designV1,
  isExpanded = false,
  isFlashed,
  isRefreshing,
  isSelected,
}: ReleaseTableRowClassNameOptions) {
  const stateClassName = isSelected
    ? 'system-b-release-table-row--selected'
    : isExpanded
      ? 'system-b-release-table-row--expanded'
      : 'system-b-release-table-row--idle';

  return cn(
    'system-b-release-table-row',
    designV1 ? 'rounded-md' : 'rounded-none',
    stateClassName,
    isRefreshing && 'system-b-release-table-row--refreshing skeleton',
    isFlashed && 'system-b-release-table-row--flashed'
  );
}

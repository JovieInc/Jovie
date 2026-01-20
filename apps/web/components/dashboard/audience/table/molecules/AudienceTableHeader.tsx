'use client';

import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { SortableHeaderButton } from '@/components/admin/table/SortableHeaderButton';
import type { HeaderCheckboxState } from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import type { AudienceMode } from '../types';

const MEMBER_COLUMNS = [
  { key: 'displayName', label: 'User' },
  { key: 'type', label: 'Type' },
  { key: 'location', label: 'Location' },
  { key: 'device', label: 'Device' },
  { key: 'visits', label: 'Visits' },
  { key: 'actions', label: 'Actions', align: 'right' as const },
  { key: 'lastSeen', label: 'Last seen' },
] as const;

const SUBSCRIBER_COLUMNS = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country' },
  { key: 'createdAt', label: 'Signed up' },
] as const;

type MemberColumnKey = (typeof MEMBER_COLUMNS)[number]['key'];
type SubscriberColumnKey = (typeof SUBSCRIBER_COLUMNS)[number]['key'];
type ColumnKey = MemberColumnKey | SubscriberColumnKey;

type MemberSortColumn =
  | 'lastSeen'
  | 'visits'
  | 'intent'
  | 'type'
  | 'engagement'
  | 'createdAt';

type SubscriberSortColumn = 'email' | 'phone' | 'country' | 'createdAt';

const SORTABLE_COLUMN_MAP: Partial<
  Record<ColumnKey, MemberSortColumn | SubscriberSortColumn>
> = {
  visits: 'visits',
  lastSeen: 'lastSeen',
  email: 'email',
  phone: 'phone',
  country: 'country',
  createdAt: 'createdAt',
};

export interface BulkAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface AudienceTableHeaderProps {
  mode: AudienceMode;
  sort: string;
  direction: 'asc' | 'desc';
  headerCheckboxState: HeaderCheckboxState;
  selectedCount: number;
  headerElevated: boolean;
  totalCount: number;
  onSortChange: (sort: string) => void;
  onToggleSelectAll: () => void;
  bulkActions: BulkAction[];
}

export function AudienceTableHeader({
  mode,
  sort,
  direction,
  headerCheckboxState,
  selectedCount,
  headerElevated,
  totalCount,
  onSortChange,
  onToggleSelectAll,
  bulkActions,
}: AudienceTableHeaderProps) {
  const activeColumns =
    mode === 'members' ? MEMBER_COLUMNS : SUBSCRIBER_COLUMNS;

  return (
    <thead
      className={cn(
        'sticky top-0 z-20 bg-surface-1',
        headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
      )}
    >
      <tr className='text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
        <th className='w-14 border-b border-subtle px-4 py-3 text-left sm:px-6'>
          <Checkbox
            aria-label='Select all'
            checked={headerCheckboxState}
            onCheckedChange={() => onToggleSelectAll()}
          />
        </th>

        {activeColumns.map((column, index) => {
          const sortKey = SORTABLE_COLUMN_MAP[column.key as ColumnKey];
          const isSortable = Boolean(sortKey);
          const isActive = isSortable && sortKey === sort;
          const activeDirection = isActive ? direction : undefined;
          const columnAlign = 'align' in column ? column.align : 'left';

          return (
            <th
              key={column.key}
              className={cn(
                'border-b border-subtle px-4 py-3 sm:px-6',
                columnAlign === 'right' ? 'text-right' : 'text-left'
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-2',
                  columnAlign === 'right' ? 'justify-end' : 'justify-between'
                )}
              >
                {isSortable ? (
                  <SortableHeaderButton
                    label={column.label}
                    direction={activeDirection as 'asc' | 'desc' | undefined}
                    onClick={() => onSortChange(sortKey as unknown as string)}
                  />
                ) : (
                  <span className='inline-flex items-center line-clamp-1'>
                    {column.label}
                  </span>
                )}

                {index === 0 ? (
                  <>
                    <div
                      className={cn(
                        'inline-flex items-center transition-all duration-150',
                        selectedCount > 0
                          ? 'opacity-100 translate-y-0'
                          : 'pointer-events-none opacity-0 -translate-y-0.5'
                      )}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant='secondary'
                            size='sm'
                            className='normal-case'
                          >
                            Bulk actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          {bulkActions.map(action => (
                            <DropdownMenuItem
                              key={action.label}
                              disabled={action.disabled}
                              onClick={action.onClick}
                            >
                              {action.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border border-subtle bg-surface-2/50 px-2.5 py-0.5 text-xs font-medium text-secondary-token transition-all duration-150 whitespace-nowrap',
                        selectedCount > 0 &&
                          'pointer-events-none opacity-0 -translate-y-0.5'
                      )}
                    >
                      {totalCount} {totalCount === 1 ? 'person' : 'people'}
                    </span>
                  </>
                ) : null}
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export { MEMBER_COLUMNS, SUBSCRIBER_COLUMNS };

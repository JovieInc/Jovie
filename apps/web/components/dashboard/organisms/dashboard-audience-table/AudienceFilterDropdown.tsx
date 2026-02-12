'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TooltipShortcut,
} from '@jovie/ui';
import { X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { FilterSubmenu } from '@/components/dashboard/organisms/release-provider-matrix/FilterSubmenu';
import { cn } from '@/lib/utils';
import type { AudienceFilters } from './types';

/** Segment filter options */
const SEGMENT_OPTIONS = [
  { id: 'highIntent', label: 'High Intent', iconName: 'Bolt' },
  { id: 'returning', label: 'Returning', iconName: 'RefreshCw' },
  { id: 'frequent', label: '3+ Visits', iconName: 'Activity' },
  { id: 'recent24h', label: 'Last 24h', iconName: 'AlarmClock' },
] as const;

type SegmentId = (typeof SEGMENT_OPTIONS)[number]['id'];

interface ActiveFilterPillProps {
  readonly groupLabel: string;
  readonly values: string[];
  readonly onClear: () => void;
}

function ActiveFilterPill({
  groupLabel,
  values,
  onClear,
}: ActiveFilterPillProps) {
  const displayValue =
    values.length > 1 ? `${values.length} selected` : values[0];

  return (
    <div className='flex items-center gap-0.5 rounded-md bg-surface-2/80 text-[11px]'>
      <div className='flex items-center gap-1.5 py-1 pl-2 pr-1'>
        <span className='text-tertiary-token'>{groupLabel}</span>
        <span className='text-tertiary-token'>is</span>
        <span className='font-medium text-primary-token'>{displayValue}</span>
      </div>
      <button
        type='button'
        onClick={onClear}
        className='flex h-full items-center rounded-r-md px-1.5 py-1 text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-primary-token focus-visible:outline-none focus-visible:bg-interactive-hover'
        aria-label={`Clear ${groupLabel} filter`}
      >
        <X className='h-3 w-3' />
      </button>
    </div>
  );
}

interface AudienceFilterDropdownProps {
  readonly filters: AudienceFilters;
  readonly onFiltersChange: (filters: AudienceFilters) => void;
  readonly buttonClassName?: string;
}

export function AudienceFilterDropdown({
  filters,
  onFiltersChange,
  buttonClassName,
}: AudienceFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSegmentToggle = useCallback(
    (id: SegmentId) => {
      const newSegments = filters.segments.includes(id)
        ? filters.segments.filter(s => s !== id)
        : [...filters.segments, id];
      onFiltersChange({ ...filters, segments: newSegments });
    },
    [filters, onFiltersChange]
  );

  const handleClearSegments = useCallback(() => {
    onFiltersChange({ ...filters, segments: [] });
  }, [filters, onFiltersChange]);

  const hasAnyFilter = filters.segments.length > 0;

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const activeSegmentLabels = filters.segments.map(
    id => SEGMENT_OPTIONS.find(opt => opt.id === id)?.label || id
  );

  return (
    <div className='flex items-center gap-2'>
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <TooltipShortcut label='Filter' shortcut='F' side='bottom'>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              className={cn(
                'h-7 gap-1.5 rounded-md border border-transparent text-secondary-token transition-colors duration-150 hover:bg-surface-2 hover:text-primary-token',
                buttonClassName
              )}
            >
              <Icon name='Filter' className='h-3.5 w-3.5' />
              Filter
            </Button>
          </DropdownMenuTrigger>
        </TooltipShortcut>

        <DropdownMenuContent
          align='start'
          sideOffset={4}
          className='min-w-[200px] max-h-[320px] overflow-hidden flex flex-col'
          onCloseAutoFocus={e => e.preventDefault()}
        >
          <div className='flex-1 overflow-y-auto p-1'>
            <FilterSubmenu
              label='Segment'
              iconName='Users'
              options={SEGMENT_OPTIONS}
              selectedIds={filters.segments}
              onToggle={handleSegmentToggle}
              searchPlaceholder='Search segments...'
            />

            {hasAnyFilter && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className='text-tertiary-token hover:text-primary-token'
                  onSelect={() => {
                    onFiltersChange({ segments: [] });
                  }}
                >
                  <X className='h-3.5 w-3.5' />
                  <span>Clear all filters</span>
                </DropdownMenuItem>
              </>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {filters.segments.length > 0 && (
        <ActiveFilterPill
          groupLabel='Segment'
          values={activeSegmentLabels}
          onClear={handleClearSegments}
        />
      )}
    </div>
  );
}

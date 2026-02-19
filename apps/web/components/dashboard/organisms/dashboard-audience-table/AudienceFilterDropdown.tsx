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
import { Check, Clock, Filter, RefreshCw, Repeat, X, Zap } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AudienceFilters } from './types';

/** Segment filter options with inline icons */
const SEGMENT_OPTIONS: readonly {
  id: SegmentId;
  label: string;
  icon: ReactNode;
}[] = [
  {
    id: 'highIntent',
    label: 'High Intent',
    icon: <Zap className='h-3.5 w-3.5' />,
  },
  {
    id: 'returning',
    label: 'Returning',
    icon: <RefreshCw className='h-3.5 w-3.5' />,
  },
  {
    id: 'frequent',
    label: '3+ Visits',
    icon: <Repeat className='h-3.5 w-3.5' />,
  },
  {
    id: 'recent24h',
    label: 'Last 24h',
    icon: <Clock className='h-3.5 w-3.5' />,
  },
];

type SegmentId = 'highIntent' | 'returning' | 'frequent' | 'recent24h';

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
              <Filter className='h-3.5 w-3.5' />
              Filter
            </Button>
          </DropdownMenuTrigger>
        </TooltipShortcut>

        <DropdownMenuContent
          align='start'
          sideOffset={4}
          className='min-w-[180px]'
          onCloseAutoFocus={e => e.preventDefault()}
        >
          {SEGMENT_OPTIONS.map(opt => {
            const checked = filters.segments.includes(opt.id);
            return (
              <DropdownMenuItem
                key={opt.id}
                onSelect={e => {
                  e.preventDefault();
                  handleSegmentToggle(opt.id);
                }}
                className={cn(
                  'justify-between',
                  checked && 'bg-primary/5 dark:bg-primary/10'
                )}
              >
                <div className='flex items-center gap-2'>
                  <span className='text-tertiary-token'>{opt.icon}</span>
                  <span>{opt.label}</span>
                </div>
                {checked && <Check className='h-3.5 w-3.5 text-primary' />}
              </DropdownMenuItem>
            );
          })}

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

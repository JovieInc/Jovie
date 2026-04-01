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
import { type ReactNode, useCallback, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ActiveFilterPill } from '@/components/molecules/filters';
import {
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
} from '@/components/organisms/table';
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
    icon: (
      <Icon
        name='Bolt'
        className={PAGE_TOOLBAR_ICON_CLASS}
        strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
      />
    ),
  },
  {
    id: 'returning',
    label: 'Returning',
    icon: (
      <Icon
        name='RefreshCw'
        className={PAGE_TOOLBAR_ICON_CLASS}
        strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
      />
    ),
  },
  {
    id: 'frequent',
    label: '3+ Visits',
    icon: (
      <Icon
        name='RefreshCw'
        className={PAGE_TOOLBAR_ICON_CLASS}
        strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
      />
    ),
  },
  {
    id: 'recent24h',
    label: 'Last 24h',
    icon: (
      <Icon
        name='AlarmClock'
        className={PAGE_TOOLBAR_ICON_CLASS}
        strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
      />
    ),
  },
  {
    id: 'touringCity',
    label: 'Touring City',
    icon: (
      <Icon
        name='MapPin'
        className={PAGE_TOOLBAR_ICON_CLASS}
        strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
      />
    ),
  },
];

type SegmentId =
  | 'highIntent'
  | 'returning'
  | 'frequent'
  | 'recent24h'
  | 'touringCity';

interface AudienceFilterDropdownProps {
  readonly filters: AudienceFilters;
  readonly onFiltersChange: (filters: AudienceFilters) => void;
  readonly buttonClassName?: string;
  readonly iconOnly?: boolean;
}

export function AudienceFilterDropdown({
  filters,
  onFiltersChange,
  buttonClassName,
  iconOnly = false,
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
                PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
                iconOnly && PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
                (isOpen || hasAnyFilter) && PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
                buttonClassName
              )}
              aria-pressed={isOpen || hasAnyFilter}
            >
              <Icon
                name='Filter'
                className={PAGE_TOOLBAR_ICON_CLASS}
                strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
              />
              <span
                className={cn(iconOnly ? 'sr-only' : 'sr-only md:not-sr-only')}
              >
                Filter
              </span>
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
                  checked && 'bg-interactive-active'
                )}
              >
                <div className='flex items-center gap-2'>
                  <span className='text-tertiary-token'>{opt.icon}</span>
                  <span>{opt.label}</span>
                </div>
                {checked && (
                  <Icon
                    name='Check'
                    className='h-3.5 w-3.5 text-primary'
                    strokeWidth={2}
                  />
                )}
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
                <Icon name='X' className='h-3.5 w-3.5' strokeWidth={2} />
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

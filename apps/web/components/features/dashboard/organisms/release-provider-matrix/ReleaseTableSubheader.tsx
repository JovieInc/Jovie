'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TooltipShortcut,
} from '@jovie/ui';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import { memo, useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import {
  ExportCSVButton,
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
  PAGE_TOOLBAR_END_GROUP_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
  PageToolbar,
} from '@/components/organisms/table';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type { ReleaseType, ReleaseViewModel } from '@/lib/discography/types';
import { GLYPH_SHIFT } from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';
import { useReleaseFilterCounts } from './hooks/useReleaseFilterCounts';
import { ReleaseFilterDropdown } from './ReleaseFilterDropdown';
import {
  getReleasesForExport,
  RELEASES_CSV_COLUMNS,
} from './utils/exportReleases';

/** Popularity level for filtering */
export type PopularityLevel = 'low' | 'med' | 'high';

/** Filter state for releases table */
export interface ReleaseFilters {
  releaseTypes: ReleaseType[];
  readonly popularity: PopularityLevel[];
  readonly labels: string[];
}

/** Default filter state */
export const DEFAULT_RELEASE_FILTERS: ReleaseFilters = {
  releaseTypes: [],
  popularity: [],
  labels: [],
};

/** Release view filter type */
export type ReleaseView = 'tracks' | 'releases';

interface ReleaseTableSubheaderProps {
  /** All releases for export */
  readonly releases: ReleaseViewModel[];
  /** Selected release IDs for filtered export */
  readonly selectedIds: Set<string>;
  /** Current filter state */
  readonly filters: ReleaseFilters;
  /** Callback when filters change */
  readonly onFiltersChange: (filters: ReleaseFilters) => void;
  /** Whether to group releases by year */
  readonly groupByYear?: boolean;
  /** Callback when groupByYear changes */
  readonly onGroupByYearChange?: (group: boolean) => void;
  /** Current release view filter */
  readonly releaseView?: ReleaseView;
  /** Callback when release view changes */
  readonly onReleaseViewChange?: (view: ReleaseView) => void;
}

/** Options for release view segmented control */
const RELEASE_VIEW_OPTIONS = [
  { value: 'tracks', label: 'Tracks', icon: 'ListMusic' },
  { value: 'releases', label: 'Releases', icon: 'Disc3' },
] as const;

function ReleaseViewButtons({
  value,
  onChange,
  className,
}: {
  readonly value: ReleaseView;
  readonly onChange: (value: ReleaseView) => void;
  readonly className?: string;
}) {
  return (
    <AppSegmentControl
      value={value}
      onValueChange={onChange}
      options={RELEASE_VIEW_OPTIONS.map(option => ({
        value: option.value,
        label: (
          <span className='flex items-center justify-center gap-1.5'>
            <Icon
              name={option.icon}
              className={PAGE_TOOLBAR_ICON_CLASS}
              strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
            />
            <span>{option.label}</span>
          </span>
        ),
      }))}
      size='sm'
      surface='ghost'
      className={cn('w-full md:w-auto', className)}
      triggerClassName='min-w-[88px] px-2.5'
      aria-label='Choose releases view'
    />
  );
}

/** Linear-style full-width segmented control with icons */
function ReleaseViewSegmentedControl({
  value,
  onChange,
}: {
  value: ReleaseView;
  onChange: (value: ReleaseView) => void;
}) {
  return (
    <AppSegmentControl
      value={value}
      onValueChange={onChange}
      options={RELEASE_VIEW_OPTIONS.map(option => ({
        value: option.value,
        label: (
          <span className='flex items-center justify-center gap-1.5'>
            <Icon name={option.icon} className='h-4 w-4' />
            <span>{option.label}</span>
          </span>
        ),
      }))}
      size='md'
      className='grid w-full grid-cols-2'
      triggerClassName='min-h-[36px] px-3 py-1.5 text-[12px]'
      aria-label='Choose releases view'
    />
  );
}

/** Toggle switch component for display menu options */
function ToggleSwitch({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      onClick={onToggle}
      className='flex w-full items-center justify-between gap-2 rounded-[8px] px-2 py-1.5 transition-[background-color,color] duration-150 hover:bg-surface-1 focus-visible:outline-none focus-visible:bg-surface-1'
    >
      <span className='text-[12px] font-[510] text-secondary-token'>
        {label}
      </span>
      <span
        className={cn(
          'flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-[3px] transition-colors',
          checked ? 'bg-(--linear-accent)' : 'bg-(--linear-border-subtle)'
        )}
      >
        <span
          className={cn(
            'h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-3'
          )}
        />
      </span>
    </button>
  );
}

/**
 * LinearStyleDisplayMenu - Compact display settings popover
 *
 * Features:
 * - Tracks/releases view toggle
 * - Group by year toggle
 */
function LinearStyleDisplayMenu({
  groupByYear,
  onGroupByYearChange,
  releaseView,
  onReleaseViewChange,
  triggerClassName,
  compact = false,
}: {
  groupByYear?: boolean;
  onGroupByYearChange?: (group: boolean) => void;
  releaseView?: ReleaseView;
  onReleaseViewChange?: (view: ReleaseView) => void;
  triggerClassName?: string;
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <TooltipShortcut
        label='Display'
        shortcut={`${GLYPH_SHIFT}V`}
        side='bottom'
      >
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
              'h-7 rounded-[8px] px-1.5 [&_svg]:h-3 [&_svg]:w-3',
              compact && PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
              compact && 'w-7',
              isOpen && PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
              triggerClassName
            )}
          >
            <Icon
              name='SlidersHorizontal'
              className={PAGE_TOOLBAR_ICON_CLASS}
              strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
            />
            <span className={cn(compact && 'sr-only')}>Display</span>
          </Button>
        </PopoverTrigger>
      </TooltipShortcut>
      <PopoverContent
        align='end'
        className='w-[248px] rounded-[12px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] p-0 shadow-[0_10px_20px_rgba(0,0,0,0.06)]'
      >
        {/* Header */}
        <div className='flex items-center justify-between border-b border-(--linear-app-frame-seam) px-3 py-2'>
          <span className='text-[13px] font-[510] text-primary-token'>
            Display
          </span>
          <PopoverPrimitive.Close asChild>
            <AppIconButton
              type='button'
              ariaLabel='Close display menu'
              className='border-transparent bg-transparent'
            >
              <X className='h-3.5 w-3.5' />
            </AppIconButton>
          </PopoverPrimitive.Close>
        </div>

        {/* Release view toggle */}
        {onReleaseViewChange && (
          <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
            <ReleaseViewSegmentedControl
              value={releaseView ?? 'releases'}
              onChange={onReleaseViewChange}
            />
          </div>
        )}

        {/* List options */}
        {onGroupByYearChange && (
          <div className='border-b border-(--linear-app-frame-seam) px-3 py-1.5'>
            <p className='px-1 pb-1 text-[13px] font-[510] tracking-normal text-secondary-token'>
              List options
            </p>
            <ToggleSwitch
              label='Group by year'
              checked={groupByYear ?? false}
              onToggle={() => onGroupByYearChange(!groupByYear)}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * ReleaseTableSubheader - Subheader with right-aligned search, filter, display, and export controls
 */
export const ReleaseTableSubheader = memo(function ReleaseTableSubheader({
  releases,
  selectedIds,
  filters,
  onFiltersChange,
  groupByYear,
  onGroupByYearChange,
  releaseView = 'releases',
  onReleaseViewChange,
}: ReleaseTableSubheaderProps) {
  // Compute filter counts for displaying badges
  const counts = useReleaseFilterCounts(releases);

  return (
    <PageToolbar
      className={cn(LINEAR_SURFACE.toolbar, 'min-h-[32px] border-b')}
      start={
        onReleaseViewChange ? (
          <ReleaseViewButtons
            value={releaseView}
            onChange={onReleaseViewChange}
            className='w-full pb-px md:w-auto'
          />
        ) : null
      }
      end={
        <div className={PAGE_TOOLBAR_END_GROUP_CLASS}>
          <ReleaseFilterDropdown
            filters={filters}
            onFiltersChange={onFiltersChange}
            counts={counts}
            buttonClassName={cn(
              PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
              'h-7 rounded-[8px] px-1.5 [&_svg]:h-3 [&_svg]:w-3'
            )}
            iconOnly
          />
          <LinearStyleDisplayMenu
            groupByYear={groupByYear}
            onGroupByYearChange={onGroupByYearChange}
            releaseView={releaseView}
            onReleaseViewChange={onReleaseViewChange}
            triggerClassName={PAGE_TOOLBAR_ACTION_BUTTON_CLASS}
            compact
          />
          <ExportCSVButton
            getData={() => getReleasesForExport(releases, selectedIds)}
            columns={RELEASES_CSV_COLUMNS}
            filename='releases'
            label='Export'
            variant='ghost'
            size='sm'
            chrome='page-toolbar'
            iconOnly
            tooltipLabel='Export'
            className='h-7 w-7 rounded-[8px] px-0 [&_svg]:h-3 [&_svg]:w-3'
          />
          <DrawerToggleButton
            chrome='page-toolbar'
            ariaLabel='Toggle release preview'
            label='Preview'
            tooltipLabel='Preview'
            className='h-7 w-7 rounded-[8px] px-0 [&_svg]:h-3 [&_svg]:w-3'
          />
        </div>
      }
    />
  );
});

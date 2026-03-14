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
import { memo } from 'react';
import {
  APP_CONTROL_BUTTON_CLASS,
  AppIconButton,
} from '@/components/atoms/AppIconButton';
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
  PageToolbarTabButton,
} from '@/components/organisms/table';
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

function InlineReleaseViewTabs({
  value,
  onChange,
}: {
  readonly value: ReleaseView;
  readonly onChange: (value: ReleaseView) => void;
}) {
  return (
    <AppSegmentControl
      value={value}
      onValueChange={onChange}
      options={RELEASE_VIEW_OPTIONS.map(option => ({
        value: option.value,
        label: (
          <span className='inline-flex items-center gap-1.5'>
            <Icon name={option.icon} className='h-3.5 w-3.5' />
            {option.label}
          </span>
        ),
      }))}
      size='sm'
      className='hidden md:inline-flex'
      surface='ghost'
      triggerClassName='flex-none'
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
          <span className='flex flex-col items-center gap-1'>
            <Icon name={option.icon} className='h-4 w-4' />
            <span>{option.label}</span>
          </span>
        ),
      }))}
      size='md'
      className='grid w-full grid-cols-2'
      triggerClassName='h-auto min-h-16 px-2 py-3 text-[13px]'
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
      className='flex w-full items-center justify-between gap-2 rounded-[8px] px-1 py-1.5 transition-[background-color,color] duration-150 hover:bg-(--linear-bg-surface-1) focus-visible:outline-none focus-visible:bg-(--linear-bg-surface-1)'
    >
      <span className='text-[13px] text-(--linear-text-secondary)'>
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
            className={cn(APP_CONTROL_BUTTON_CLASS, triggerClassName)}
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
      <PopoverContent align='end' className='w-[260px]'>
        {/* Header */}
        <div className='flex items-center justify-between border-b border-(--linear-border-subtle) px-3 py-2'>
          <span className='text-[13px] font-[510] text-(--linear-text-primary)'>
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
          <div className='border-b border-(--linear-border-subtle) px-3 py-2'>
            <ReleaseViewSegmentedControl
              value={releaseView ?? 'releases'}
              onChange={onReleaseViewChange}
            />
          </div>
        )}

        {/* List options */}
        {onGroupByYearChange && (
          <div className='border-b border-(--linear-border-subtle) px-3 py-1.5'>
            <p className='px-1 pb-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
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
    <div className='flex items-center justify-between border-b border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-[var(--linear-app-header-padding-x)] py-2'>
      <div className='flex items-center gap-3'>
        {onReleaseViewChange ? (
          <InlineReleaseViewTabs
            value={releaseView}
            onChange={onReleaseViewChange}
          />
        ) : null}
      </div>

      {/* Right: Search + Filter + Display + Export */}
      <ActionBar className='ml-auto hidden items-center md:flex'>
        {onSearchToggle && (
          <TooltipShortcut label='Search' side='bottom'>
            <Button
              variant='ghost'
              size='sm'
              onClick={onSearchToggle}
              className={cn(
                ACTION_BAR_BUTTON_CLASS,
                isSearchOpen && 'bg-interactive-active text-primary-token'
              )}
              aria-pressed={isSearchOpen}
            >
              <Icon name='Search' className='h-3.5 w-3.5' />
              Search
            </Button>
          </TooltipShortcut>
        )}
        <ReleaseFilterDropdown
          filters={filters}
          onFiltersChange={onFiltersChange}
          counts={counts}
          buttonClassName={ACTION_BAR_BUTTON_CLASS}
        />
        <div
          className='h-4 w-px bg-(--linear-border-subtle)'
          aria-hidden='true'
        />
        <LinearStyleDisplayMenu
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={onColumnVisibilityChange}
          availableColumns={availableColumns}
          onResetToDefaults={onResetToDefaults}
          groupByYear={groupByYear}
          onGroupByYearChange={onGroupByYearChange}
          releaseView={releaseView}
          onReleaseViewChange={onReleaseViewChange}
          triggerClassName={ACTION_BAR_BUTTON_CLASS}
        />
        <ExportCSVButton
          getData={() => getReleasesForExport(releases, selectedIds)}
          columns={RELEASES_CSV_COLUMNS}
          filename='releases'
          label='Export'
          variant='ghost'
          size='sm'
          className={ACTION_BAR_BUTTON_CLASS}
          tooltipLabel='Export'
        />
      </ActionBar>
    </div>
  );
});

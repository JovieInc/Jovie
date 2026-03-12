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
import { memo, type ReactNode } from 'react';
import {
  APP_CONTROL_BUTTON_CLASS,
  AppIconButton,
} from '@/components/atoms/AppIconButton';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import {
  ACTION_BAR_BUTTON_CLASS,
  ActionBar,
  ExportCSVButton,
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
  /** Whether search is currently active */
  readonly isSearchOpen?: boolean;
  /** Callback to toggle search open/close */
  readonly onSearchToggle?: () => void;
  /** Primary action rendered with the toolbar controls */
  readonly primaryAction?: ReactNode;
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

function CompactReleaseViewTabs({
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
      className='inline-flex w-full md:hidden'
      surface='ghost'
      triggerClassName='flex-1'
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
      className='flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:bg-interactive-hover'
    >
      <span className='text-[13px] text-secondary-token'>{label}</span>
      <span
        className={cn(
          'flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-[3px] transition-colors',
          checked ? 'bg-primary' : 'bg-surface-3'
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
  return (
    <Popover>
      <TooltipShortcut
        label='Display'
        shortcut={`${GLYPH_SHIFT}V`}
        side='bottom'
      >
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(APP_CONTROL_BUTTON_CLASS, 'px-2 md:px-3', triggerClassName)}
          >
            <Icon name='SlidersHorizontal' className='h-3.5 w-3.5' />
            <span className={cn(compact && 'sr-only md:not-sr-only')}>
              Display
            </span>
          </Button>
        </PopoverTrigger>
      </TooltipShortcut>
      <PopoverContent align='end' className='w-[260px]'>
        {/* Header */}
        <div className='flex items-center justify-between border-b border-subtle px-3 py-2'>
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
          <div className='border-b border-subtle px-3 py-2'>
            <ReleaseViewSegmentedControl
              value={releaseView ?? 'releases'}
              onChange={onReleaseViewChange}
            />
          </div>
        )}

        {/* List options */}
        {onGroupByYearChange && (
          <div className='border-b border-subtle px-3 py-1.5'>
            <p className='px-1 pb-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
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
  isSearchOpen,
  onSearchToggle,
  primaryAction,
}: ReleaseTableSubheaderProps) {
  // Compute filter counts for displaying badges
  const counts = useReleaseFilterCounts(releases);

  return (
    <div className='flex flex-col gap-2 border-b border-(--linear-border-subtle) bg-(--linear-app-content-surface) px-4 py-1.5 md:flex-row md:items-center md:justify-between md:px-[var(--linear-app-header-padding-x)]'>
      <div className='flex min-w-0 flex-1 items-center gap-2 md:w-auto md:flex-none'>
        {onReleaseViewChange ? (
          <>
            <CompactReleaseViewTabs
              value={releaseView}
              onChange={onReleaseViewChange}
            />
            <InlineReleaseViewTabs
              value={releaseView}
              onChange={onReleaseViewChange}
            />
          </>
        ) : null}
      </div>

      {/* Right: Search + Filter + Display + Export */}
      <ActionBar className='ml-auto flex w-full items-center justify-end gap-1.5 md:w-auto'>
        {onSearchToggle && (
          <TooltipShortcut label='Search' side='bottom'>
            <Button
              variant='ghost'
              size='sm'
              onClick={onSearchToggle}
              className={cn(
                ACTION_BAR_BUTTON_CLASS,
                'px-2 md:px-3',
                isSearchOpen && 'bg-interactive-active text-primary-token'
              )}
              aria-pressed={isSearchOpen}
            >
              <Icon name='Search' className='h-3.5 w-3.5' />
              <span className='sr-only md:not-sr-only'>Search</span>
            </Button>
          </TooltipShortcut>
        )}
        <ReleaseFilterDropdown
          filters={filters}
          onFiltersChange={onFiltersChange}
          counts={counts}
          buttonClassName={ACTION_BAR_BUTTON_CLASS}
        />
        <LinearStyleDisplayMenu
          groupByYear={groupByYear}
          onGroupByYearChange={onGroupByYearChange}
          releaseView={releaseView}
          onReleaseViewChange={onReleaseViewChange}
          triggerClassName={ACTION_BAR_BUTTON_CLASS}
          compact
        />
        <ExportCSVButton
          getData={() => getReleasesForExport(releases, selectedIds)}
          columns={RELEASES_CSV_COLUMNS}
          filename='releases'
          label='Export'
          variant='ghost'
          size='sm'
          className={cn(ACTION_BAR_BUTTON_CLASS, 'hidden md:inline-flex')}
          tooltipLabel='Export'
        />
        {primaryAction}
      </ActionBar>
    </div>
  );
});

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
import { HeaderSearchAction } from '@/components/molecules/HeaderSearchAction';
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
import { useCodeFlag } from '@/lib/feature-flags/client';
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
  /** Current table search query */
  readonly searchQuery: string;
  /** Callback when search query changes */
  readonly onSearchQueryChange: (value: string) => void;
  /** Callback to create a release */
  readonly onCreateRelease?: () => void;
  /** Whether create release is available */
  readonly canCreateManualReleases?: boolean;
}

/** Options for release view segmented control */
const RELEASE_VIEW_OPTIONS = [
  { value: 'tracks', label: 'Tracks' },
  { value: 'releases', label: 'Releases' },
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
        label: option.label,
      }))}
      size='sm'
      surface='muted'
      className={cn('w-auto', className)}
      triggerClassName='min-w-[72px] px-3'
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
        label: option.label,
      }))}
      size='md'
      className='grid w-full grid-cols-2'
      triggerClassName='min-h-[34px] px-3 py-1.5 text-[12px]'
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
      className='flex w-full items-center justify-between gap-2 rounded-full px-2 py-1.5 transition-[background-color,color] duration-150 hover:bg-surface-1 focus-visible:outline-none focus-visible:bg-surface-1'
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
              'h-7 rounded-full px-1.5 [&_svg]:h-3 [&_svg]:w-3',
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
        className='w-[248px] rounded-[12px] border border-subtle bg-surface-1 p-0 shadow-popover'
      >
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
  searchQuery,
  onSearchQueryChange,
  onCreateRelease,
  canCreateManualReleases = false,
}: ReleaseTableSubheaderProps) {
  // Compute filter counts for displaying badges
  const counts = useReleaseFilterCounts(releases);
  const showToolbarExtras = useCodeFlag('SHOW_RELEASE_TOOLBAR_EXTRAS');

  return (
    <PageToolbar
      className={cn(LINEAR_SURFACE.toolbar, 'min-h-[30px]')}
      start={
        onReleaseViewChange ? (
          <ReleaseViewButtons
            value={releaseView}
            onChange={onReleaseViewChange}
            className='pb-px'
          />
        ) : null
      }
      end={
        <div className={PAGE_TOOLBAR_END_GROUP_CLASS}>
          <HeaderSearchAction
            searchValue={searchQuery}
            onSearchValueChange={onSearchQueryChange}
            onClearAction={() => onSearchQueryChange('')}
            onApply={() => undefined}
            placeholder='Search releases'
            ariaLabel='Search releases'
            submitAriaLabel='Search releases'
            submitIcon={
              <Icon
                name='Search'
                className={PAGE_TOOLBAR_ICON_CLASS}
                strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
              />
            }
            tooltipLabel='Search'
            className='h-7 text-[12px] text-tertiary-token hover:text-primary-token'
          />
          {showToolbarExtras && (
            <ReleaseFilterDropdown
              filters={filters}
              onFiltersChange={onFiltersChange}
              counts={counts}
              buttonClassName={cn(
                PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
                'h-7 rounded-full px-1.5 [&_svg]:h-3 [&_svg]:w-3'
              )}
              iconOnly
            />
          )}
          {showToolbarExtras && (
            <LinearStyleDisplayMenu
              groupByYear={groupByYear}
              onGroupByYearChange={onGroupByYearChange}
              releaseView={releaseView}
              onReleaseViewChange={onReleaseViewChange}
              triggerClassName={PAGE_TOOLBAR_ACTION_BUTTON_CLASS}
              compact
            />
          )}
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
            className='h-7 w-7 rounded-full px-0 [&_svg]:h-3 [&_svg]:w-3'
          />
          <DrawerToggleButton
            chrome='page-toolbar'
            ariaLabel='Toggle release preview'
            label='Preview'
            tooltipLabel='Preview'
            className='h-7 w-7 text-tertiary-token hover:text-primary-token'
          />
        </div>
      }
    />
  );
});

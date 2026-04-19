'use client';

import { Button } from '@jovie/ui';
import { lazy, memo, Suspense } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import { HeaderSearchAction } from '@/components/molecules/HeaderSearchAction';
import {
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
import { useAppFlag } from '@/lib/flags/client';
import { cn } from '@/lib/utils';
import { useReleaseFilterCounts } from './hooks/useReleaseFilterCounts';
import { RELEASE_VIEW_OPTIONS } from './ReleaseTable.types';

const ReleaseFilterDropdown = lazy(() =>
  import('./ReleaseFilterDropdown').then(m => ({
    default: m.ReleaseFilterDropdown,
  }))
);

const ReleaseTableDisplayMenu = lazy(() =>
  import('./ReleaseTableDisplayMenu').then(m => ({
    default: m.ReleaseTableDisplayMenu,
  }))
);

const ReleaseTableExportButton = lazy(() =>
  import('./ReleaseTableExportButton').then(m => ({
    default: m.ReleaseTableExportButton,
  }))
);

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
  /** Filtered releases for export */
  readonly releases: ReleaseViewModel[];
  /** All unfiltered releases for computing filter counts */
  readonly allReleases: ReleaseViewModel[];
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

/**
 * ReleaseTableSubheader - Subheader with right-aligned search, filter, display, and export controls
 */
export const ReleaseTableSubheader = memo(function ReleaseTableSubheader({
  releases,
  allReleases,
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
  // Compute filter counts from all (unfiltered) releases so counts stay stable
  const counts = useReleaseFilterCounts(allReleases);
  const showToolbarExtras = useAppFlag('SHOW_RELEASE_TOOLBAR_EXTRAS');

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
          <Suspense
            fallback={
              <Button
                variant='ghost'
                size='sm'
                className={cn(
                  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
                  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
                  'h-7 rounded-full px-1.5 [&_svg]:h-3 [&_svg]:w-3'
                )}
                aria-label='Loading filters'
                disabled
              >
                <Icon name='Filter' className='h-3.5 w-3.5' strokeWidth={2} />
                <span className='sr-only'>Loading filters</span>
              </Button>
            }
          >
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
          </Suspense>
          {showToolbarExtras && (
            <Suspense
              fallback={
                <Button
                  variant='ghost'
                  size='sm'
                  className={cn(
                    PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
                    PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
                    'h-7 w-7 rounded-full px-0 [&_svg]:h-3 [&_svg]:w-3'
                  )}
                  aria-label='Display'
                  disabled
                >
                  <Icon
                    name='SlidersHorizontal'
                    className={PAGE_TOOLBAR_ICON_CLASS}
                    strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
                  />
                  <span className='sr-only'>Display</span>
                </Button>
              }
            >
              <ReleaseTableDisplayMenu
                groupByYear={groupByYear}
                onGroupByYearChange={onGroupByYearChange}
                releaseView={releaseView}
                onReleaseViewChange={onReleaseViewChange}
                triggerClassName={PAGE_TOOLBAR_ACTION_BUTTON_CLASS}
                compact
              />
            </Suspense>
          )}
          <Suspense
            fallback={
              <Button
                variant='ghost'
                size='sm'
                className={cn(
                  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
                  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
                  'h-7 w-7 rounded-full px-0 [&_svg]:h-3 [&_svg]:w-3'
                )}
                aria-label='Export'
                disabled
              >
                <Icon
                  name='Download'
                  className={PAGE_TOOLBAR_ICON_CLASS}
                  strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
                />
                <span className='sr-only'>Export</span>
              </Button>
            }
          >
            <ReleaseTableExportButton
              releases={releases}
              selectedIds={selectedIds}
            />
          </Suspense>
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

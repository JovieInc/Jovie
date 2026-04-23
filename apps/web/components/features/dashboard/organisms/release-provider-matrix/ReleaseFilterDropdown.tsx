'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  TooltipShortcut,
} from '@jovie/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DropdownEmptyState } from '@/components/molecules/DropdownEmptyState';
import {
  ActiveFilterPill,
  FilterCheckboxItem,
  FilterSearchInput,
} from '@/components/molecules/filters';
import { PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS } from '@/components/organisms/table';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type { ReleaseType } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { FilterSubmenu } from './FilterSubmenu';
import type { ReleaseFilterCounts } from './hooks/useReleaseFilterCounts';
import type { PopularityLevel, ReleaseFilters } from './ReleaseTableSubheader';

// ============================================================================
// FILTER OPTIONS CONFIG
// ============================================================================

/** Release type filter options */
const RELEASE_TYPE_OPTIONS: {
  id: ReleaseType;
  label: string;
  iconName: string;
}[] = [
  { id: 'album', label: 'Album', iconName: 'Disc3' },
  { id: 'ep', label: 'EP', iconName: 'Disc' },
  { id: 'single', label: 'Single', iconName: 'Music' },
  { id: 'compilation', label: 'Compilation', iconName: 'ListMusic' },
  { id: 'live', label: 'Live', iconName: 'Radio' },
  { id: 'mixtape', label: 'Mixtape', iconName: 'Shuffle' },
  { id: 'other', label: 'Other', iconName: 'MoreHorizontal' },
];

/** Popularity filter options */
const POPULARITY_OPTIONS: {
  id: PopularityLevel;
  label: string;
  iconName: string;
}[] = [
  { id: 'low', label: 'Low (0-33)', iconName: 'SignalLow' },
  { id: 'med', label: 'Medium (34-66)', iconName: 'SignalMedium' },
  { id: 'high', label: 'High (67-100)', iconName: 'SignalHigh' },
];

// ============================================================================
// VIRTUALIZED LABEL LIST
// ============================================================================

interface VirtualizedLabelListProps {
  readonly options: Array<{ label: string; count: number }>;
  readonly selectedLabels: string[];
  readonly onToggle: (label: string) => void;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly emptyMessage: string;
}

function VirtualizedLabelList({
  options,
  selectedLabels,
  onToggle,
  searchInputRef,
  emptyMessage,
}: VirtualizedLabelListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Use virtualization only if we have more than 20 items
  const useVirtualization = options.length > 20;

  const rowVirtualizer = useVirtualizer({
    count: options.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // Estimated height of each item in pixels
    overscan: 5, // Number of items to render outside of the visible area
    enabled: useVirtualization,
  });

  if (options.length === 0) {
    return (
      <div className='flex-1 overflow-y-auto'>
        <DropdownEmptyState message={emptyMessage} />
      </div>
    );
  }

  if (!useVirtualization) {
    // For small lists, render normally without virtualization
    return (
      <div className='flex-1 overflow-y-auto p-1.5'>
        {options.map(opt => (
          <FilterCheckboxItem
            key={opt.label}
            label={opt.label}
            icon={<Icon name='Building2' className='h-3.5 w-3.5' />}
            count={opt.count}
            checked={selectedLabels.includes(opt.label)}
            onCheckedChange={() => onToggle(opt.label)}
            searchInputRef={searchInputRef}
          />
        ))}
      </div>
    );
  }

  // For large lists, use virtualization
  return (
    <div ref={parentRef} className='flex-1 overflow-y-auto p-1.5'>
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map(virtualItem => {
          const opt = options[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <FilterCheckboxItem
                label={opt.label}
                icon={<Icon name='Building2' className='h-3.5 w-3.5' />}
                count={opt.count}
                checked={selectedLabels.includes(opt.label)}
                onCheckedChange={() => onToggle(opt.label)}
                searchInputRef={searchInputRef}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ReleaseFilterDropdownProps {
  readonly filters: ReleaseFilters;
  readonly onFiltersChange: (filters: ReleaseFilters) => void;
  readonly counts: ReleaseFilterCounts;
  readonly buttonClassName?: string;
  readonly iconOnly?: boolean;
}

const FILTER_TRIGGER_ACTIVE_CLASS =
  'border-transparent bg-surface-1 text-primary-token';

export function ReleaseFilterDropdown({
  filters,
  onFiltersChange,
  counts,
  buttonClassName,
  iconOnly = false,
}: ReleaseFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mainSearch, setMainSearch] = useState('');
  const [labelSearch, setLabelSearch] = useState('');
  const mainSearchRef = useRef<HTMLInputElement>(null);
  const labelSearchRef = useRef<HTMLInputElement>(null);

  // Toggle type selection
  const handleTypeToggle = useCallback(
    (type: ReleaseType) => {
      const newTypes = filters.releaseTypes.includes(type)
        ? filters.releaseTypes.filter(t => t !== type)
        : [...filters.releaseTypes, type];
      onFiltersChange({ ...filters, releaseTypes: newTypes });
    },
    [filters, onFiltersChange]
  );

  // Toggle popularity selection
  const handlePopularityToggle = useCallback(
    (level: PopularityLevel) => {
      const newLevels = filters.popularity.includes(level)
        ? filters.popularity.filter(l => l !== level)
        : [...filters.popularity, level];
      onFiltersChange({ ...filters, popularity: newLevels });
    },
    [filters, onFiltersChange]
  );

  // Toggle label selection
  const handleLabelToggle = useCallback(
    (label: string) => {
      const newLabels = filters.labels.includes(label)
        ? filters.labels.filter(l => l !== label)
        : [...filters.labels, label];
      onFiltersChange({ ...filters, labels: newLabels });
    },
    [filters, onFiltersChange]
  );

  // Clear handlers
  const handleClearTypes = useCallback(() => {
    onFiltersChange({ ...filters, releaseTypes: [] });
  }, [filters, onFiltersChange]);

  const handleClearPopularity = useCallback(() => {
    onFiltersChange({ ...filters, popularity: [] });
  }, [filters, onFiltersChange]);

  const handleClearLabels = useCallback(() => {
    onFiltersChange({ ...filters, labels: [] });
  }, [filters, onFiltersChange]);

  // Filter categories by main search
  const FILTER_CATEGORIES = useMemo(
    () =>
      [
        { id: 'releaseType', label: 'Release Type', iconName: 'Disc3' },
        { id: 'popularity', label: 'Popularity', iconName: 'Signal' },
        { id: 'label', label: 'Label', iconName: 'Building2' },
      ] as const,
    []
  );

  const filteredCategories = useMemo(() => {
    if (!mainSearch.trim()) return FILTER_CATEGORIES;
    const query = mainSearch.toLowerCase();
    return FILTER_CATEGORIES.filter(cat =>
      cat.label.toLowerCase().includes(query)
    );
  }, [mainSearch, FILTER_CATEGORIES]);

  // Filter label options by search
  const filteredLabelOptions = useMemo(() => {
    if (!labelSearch.trim()) return counts.byLabel;
    const query = labelSearch.toLowerCase();
    return counts.byLabel.filter(opt =>
      opt.label.toLowerCase().includes(query)
    );
  }, [labelSearch, counts.byLabel]);

  // Build active filter labels
  const activeTypeLabels = filters.releaseTypes.map(
    type => RELEASE_TYPE_OPTIONS.find(opt => opt.id === type)?.label || type
  );
  const activePopularityLabels = filters.popularity.map(
    level => POPULARITY_OPTIONS.find(opt => opt.id === level)?.label || level
  );

  // Count active filters for each category
  const typeFilterCount = filters.releaseTypes.length;
  const popularityFilterCount = filters.popularity.length;
  const labelFilterCount = filters.labels.length;
  const hasAnyFilter =
    typeFilterCount > 0 || popularityFilterCount > 0 || labelFilterCount > 0;

  // Reset searches when dropdown closes
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setMainSearch('');
      setLabelSearch('');
    }
  }, []);
  return (
    <div className='flex items-center gap-2'>
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <TooltipShortcut label='Filter' shortcut='F' side='bottom'>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              className={cn(
                iconOnly && PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
                buttonClassName,
                (isOpen || hasAnyFilter) && FILTER_TRIGGER_ACTIVE_CLASS
              )}
              aria-pressed={isOpen || hasAnyFilter}
            >
              <Icon name='Filter' className='h-3.5 w-3.5' strokeWidth={2} />
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
          className={cn(
            LINEAR_SURFACE.popover,
            'flex max-h-[280px] min-w-[212px] max-w-[calc(100vw-16px)] flex-col overflow-hidden'
          )}
          onCloseAutoFocus={e => e.preventDefault()}
        >
          {/* Main Menu Search */}
          <FilterSearchInput
            value={mainSearch}
            onChange={setMainSearch}
            onClear={() => {
              setMainSearch('');
              mainSearchRef.current?.focus();
            }}
            placeholder='Search filters...'
            inputRef={mainSearchRef}
          />

          {/* Categories List */}
          <div className='flex-1 overflow-y-auto p-1.5'>
            {filteredCategories.length === 0 ? (
              <DropdownEmptyState message='No filters found' />
            ) : (
              <>
                {/* Release Type Submenu */}
                <FilterSubmenu
                  label='Release Type'
                  iconName='Disc3'
                  options={RELEASE_TYPE_OPTIONS}
                  selectedIds={filters.releaseTypes}
                  onToggle={handleTypeToggle}
                  counts={counts.byType}
                  searchPlaceholder='Search types...'
                  isVisible={filteredCategories.some(
                    c => c.id === 'releaseType'
                  )}
                />

                {/* Popularity Submenu */}
                <FilterSubmenu
                  label='Popularity'
                  iconName='Signal'
                  options={POPULARITY_OPTIONS}
                  selectedIds={filters.popularity}
                  onToggle={handlePopularityToggle}
                  counts={counts.byPopularity}
                  searchPlaceholder='Search popularity...'
                  isVisible={filteredCategories.some(
                    c => c.id === 'popularity'
                  )}
                />

                {/* Label Submenu - Note: Uses VirtualizedLabelList internally */}
                {filteredCategories.some(c => c.id === 'label') && (
                  <DropdownMenuSub
                    onOpenChange={open => {
                      if (open) {
                        setTimeout(() => labelSearchRef.current?.focus(), 50);
                      } else {
                        setLabelSearch('');
                      }
                    }}
                  >
                    <DropdownMenuSubTrigger className='justify-between rounded-[6px]'>
                      <div className='flex items-center gap-2'>
                        <Icon
                          name='Building2'
                          className='h-3.5 w-3.5 text-tertiary-token'
                        />
                        <span>Label</span>
                        {labelFilterCount > 0 && (
                          <span className='rounded-[6px] bg-(--linear-accent-subtle) px-1.5 py-0.5 text-3xs font-[510] text-(--linear-accent)'>
                            {labelFilterCount}
                          </span>
                        )}
                      </div>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      sideOffset={4}
                      alignOffset={-4}
                      collisionPadding={8}
                      className={cn(
                        LINEAR_SURFACE.popover,
                        'flex max-h-[300px] min-w-[196px] max-w-[calc(100vw-16px)] flex-col overflow-hidden'
                      )}
                    >
                      <FilterSearchInput
                        value={labelSearch}
                        onChange={setLabelSearch}
                        onClear={() => {
                          setLabelSearch('');
                          labelSearchRef.current?.focus();
                        }}
                        placeholder='Search labels...'
                        inputRef={labelSearchRef}
                      />
                      <VirtualizedLabelList
                        options={filteredLabelOptions}
                        selectedLabels={filters.labels}
                        onToggle={handleLabelToggle}
                        searchInputRef={labelSearchRef}
                        emptyMessage={
                          counts.byLabel.length === 0
                            ? 'No labels available'
                            : 'No labels found'
                        }
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </>
            )}

            {/* Clear All option when filters are active */}
            {hasAnyFilter && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className='rounded-[6px] text-tertiary-token hover:text-primary-token'
                  onSelect={() => {
                    onFiltersChange({
                      releaseTypes: [],
                      popularity: [],
                      labels: [],
                    });
                  }}
                >
                  <Icon name='X' className='h-3.5 w-3.5' />
                  <span>Clear all filters</span>
                </DropdownMenuItem>
              </>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Active Filter Pills */}
      {filters.releaseTypes.length > 0 && (
        <ActiveFilterPill
          groupLabel='Release Type'
          values={activeTypeLabels}
          icon={<Icon name='Disc3' className='h-3.5 w-3.5' />}
          onClear={handleClearTypes}
        />
      )}

      {filters.popularity.length > 0 && (
        <ActiveFilterPill
          groupLabel='Popularity'
          values={activePopularityLabels}
          icon={<Icon name='Signal' className='h-3.5 w-3.5' />}
          onClear={handleClearPopularity}
        />
      )}

      {filters.labels.length > 0 && (
        <ActiveFilterPill
          groupLabel='Label'
          values={filters.labels}
          icon={<Icon name='Building2' className='h-3.5 w-3.5' />}
          onClear={handleClearLabels}
        />
      )}
    </div>
  );
}

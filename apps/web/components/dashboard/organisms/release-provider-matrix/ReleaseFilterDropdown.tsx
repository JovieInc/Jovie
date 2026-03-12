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
  MENU_ITEM_BASE,
  TooltipShortcut,
} from '@jovie/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Search, X } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DropdownEmptyState } from '@/components/molecules/DropdownEmptyState';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';
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
// SEARCH INPUT COMPONENT
// ============================================================================

interface SearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onClear: () => void;
  readonly placeholder?: string;
  readonly inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Called when Escape is pressed in the search input */
  readonly onEscape?: () => void;
}

function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search...',
  inputRef,
  onEscape,
}: SearchInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (value) {
          // Clear search first, then if pressed again close submenu
          e.preventDefault();
          e.stopPropagation();
          onClear();
        } else if (onEscape) {
          // No search value, propagate escape to close submenu
          onEscape();
        }
      } else if (e.key === 'ArrowDown') {
        // Move focus to first checkbox item
        e.preventDefault();
        const container = (e.target as HTMLElement).closest(
          '[data-radix-menu-content]'
        );
        const firstItem = container?.querySelector(
          'button[data-filter-item]'
        ) as HTMLElement;
        firstItem?.focus();
      }
    },
    [value, onClear, onEscape]
  );

  return (
    <div className='sticky top-0 z-10 bg-transparent p-2 pb-1'>
      <div className='relative'>
        <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--linear-text-tertiary)' />
        <input
          ref={inputRef}
          type='text'
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full rounded-[8px] border border-transparent bg-(--linear-bg-surface-0) py-1.5 pl-8 pr-7 text-[13px]',
            'text-(--linear-text-primary) placeholder:text-(--linear-text-tertiary)',
            'transition-[background-color,border-color,box-shadow] duration-150',
            'focus-visible:border-(--linear-border-focus) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20'
          )}
          aria-label={placeholder}
        />
        {value && (
          <DrawerInlineIconButton
            onClick={onClear}
            className='absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-(--linear-text-tertiary)'
            aria-label='Clear search'
          >
            <X className='h-3 w-3' />
          </DrawerInlineIconButton>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ACTIVE FILTER PILL COMPONENT
// ============================================================================

interface ActiveFilterPillProps {
  readonly groupLabel: string;
  readonly values: string[];
  readonly icon?: ReactNode;
  readonly onClear: () => void;
}

function ActiveFilterPill({
  groupLabel,
  values,
  icon,
  onClear,
}: ActiveFilterPillProps) {
  const displayValue =
    values.length > 1 ? `${values.length} selected` : values[0];

  return (
    <div className='flex items-center gap-0.5 rounded-[7px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-[11px]'>
      <div className='flex items-center gap-1.5 py-1 pl-2.5 pr-1'>
        {icon && (
          <span className='flex h-3.5 w-3.5 items-center justify-center text-(--linear-text-tertiary)'>
            {icon}
          </span>
        )}
        <span className='text-(--linear-text-tertiary)'>{groupLabel}</span>
        <span className='text-(--linear-text-tertiary)'>is</span>
        <span className='font-[510] text-(--linear-accent)'>
          {displayValue}
        </span>
      </div>
      <DrawerInlineIconButton
        onClick={onClear}
        className='h-full rounded-r-[7px] px-1.5 py-1 text-(--linear-text-tertiary)'
        aria-label={`Clear ${groupLabel} filter`}
      >
        <X className='h-3 w-3' />
      </DrawerInlineIconButton>
    </div>
  );
}

// ============================================================================
// SUBMENU CHECKBOX ITEM
// ============================================================================

interface SubmenuCheckboxItemProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly count?: number;
  readonly checked: boolean;
  readonly onCheckedChange: () => void;
  /** Ref to the search input to return focus on ArrowUp from first item */
  readonly searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

function SubmenuCheckboxItem({
  label,
  icon,
  count,
  checked,
  onCheckedChange,
  searchInputRef,
}: SubmenuCheckboxItemProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (e.target as HTMLElement)
          .nextElementSibling as HTMLElement;
        if (next?.hasAttribute('data-filter-item')) {
          next.focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (e.target as HTMLElement)
          .previousElementSibling as HTMLElement;
        if (prev?.hasAttribute('data-filter-item')) {
          prev.focus();
        } else {
          // At first item, go back to search input
          searchInputRef?.current?.focus();
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onCheckedChange();
      }
    },
    [onCheckedChange, searchInputRef]
  );

  return (
    <button
      type='button'
      data-filter-item
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        onCheckedChange();
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        MENU_ITEM_BASE,
        'w-full',
        checked && 'text-(--linear-text-primary)'
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
          checked
            ? 'border-(--linear-accent) bg-(--linear-accent) text-white'
            : 'border-(--linear-border-subtle) bg-(--linear-bg-surface-1)'
        )}
      >
        {checked && <Check className='h-3 w-3' />}
      </span>
      {icon && (
        <span className='flex h-4 w-4 shrink-0 items-center justify-center text-(--linear-text-tertiary)'>
          {icon}
        </span>
      )}
      <span className='flex-1 truncate text-left'>{label}</span>
      {count !== undefined && (
        <span className='text-[10px] tabular-nums text-(--linear-text-tertiary)'>
          {count}
        </span>
      )}
    </button>
  );
}

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
      <div className='flex-1 overflow-y-auto p-1'>
        {options.map(opt => (
          <SubmenuCheckboxItem
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
    <div ref={parentRef} className='flex-1 overflow-y-auto p-1'>
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
              <SubmenuCheckboxItem
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
}

const FILTER_TRIGGER_ACTIVE_CLASS =
  'border-(--linear-border-default) bg-(--linear-bg-surface-1) text-(--linear-text-primary)';

export function ReleaseFilterDropdown({
  filters,
  onFiltersChange,
  counts,
  buttonClassName,
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
                buttonClassName,
                (isOpen || hasAnyFilter) && FILTER_TRIGGER_ACTIVE_CLASS
              )}
              aria-pressed={isOpen || hasAnyFilter}
            >
              <Icon name='Filter' className='h-3.5 w-3.5' />
              <span className='sr-only md:not-sr-only'>Filter</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipShortcut>

        <DropdownMenuContent
          align='start'
          sideOffset={4}
          className='min-w-[200px] max-w-[calc(100vw-16px)] max-h-[320px] overflow-hidden flex flex-col'
          onCloseAutoFocus={e => e.preventDefault()}
        >
          {/* Main Menu Search */}
          <SearchInput
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
          <div className='flex-1 overflow-y-auto p-1'>
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
                    <DropdownMenuSubTrigger className='justify-between'>
                      <div className='flex items-center gap-2'>
                        <Icon
                          name='Building2'
                          className='h-3.5 w-3.5 text-(--linear-text-tertiary)'
                        />
                        <span>Label</span>
                        {labelFilterCount > 0 && (
                          <span className='rounded-full bg-(--linear-accent-subtle) px-1.5 py-0.5 text-[10px] font-[510] text-(--linear-accent)'>
                            {labelFilterCount}
                          </span>
                        )}
                      </div>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      sideOffset={4}
                      alignOffset={-4}
                      collisionPadding={8}
                      className='min-w-[180px] max-w-[calc(100vw-16px)] max-h-[300px] overflow-hidden flex flex-col'
                    >
                      <SearchInput
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
                  className='text-(--linear-text-tertiary) hover:text-(--linear-text-primary)'
                  onSelect={() => {
                    onFiltersChange({
                      releaseTypes: [],
                      popularity: [],
                      labels: [],
                    });
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

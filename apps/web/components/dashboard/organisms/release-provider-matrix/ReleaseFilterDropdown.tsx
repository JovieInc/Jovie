'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import {
  DROPDOWN_CONTENT_BASE,
  DROPDOWN_SHADOW,
  DROPDOWN_SLIDE_ANIMATIONS,
  DROPDOWN_TRANSITIONS,
  MENU_ITEM_BASE,
  MENU_SEPARATOR_BASE,
} from '@jovie/ui/lib/dropdown-styles';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Search, X } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { ReleaseType } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
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
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Called when Escape is pressed in the search input */
  onEscape?: () => void;
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
    <div className='sticky top-0 z-10 bg-white dark:bg-[#101011] p-2 pb-1'>
      <div className='relative'>
        <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary-token' />
        <input
          ref={inputRef}
          type='text'
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full rounded-md border border-subtle bg-surface-2 dark:bg-[#151618] py-1.5 pl-8 pr-7 text-xs',
            'text-primary-token placeholder:text-tertiary-token',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          )}
          aria-label={placeholder}
        />
        {value && (
          <button
            type='button'
            onClick={onClear}
            className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-tertiary-token hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            aria-label='Clear search'
          >
            <X className='h-3 w-3' />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ACTIVE FILTER PILL COMPONENT
// ============================================================================

interface ActiveFilterPillProps {
  groupLabel: string;
  values: string[];
  icon?: ReactNode;
  onClear: () => void;
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
    <div className='flex items-center gap-0.5 rounded-md bg-surface-2 text-[12px]'>
      <div className='flex items-center gap-1.5 py-1 pl-2 pr-1'>
        {icon && (
          <span className='flex h-3.5 w-3.5 items-center justify-center text-tertiary-token'>
            {icon}
          </span>
        )}
        <span className='text-tertiary-token'>{groupLabel}</span>
        <span className='text-tertiary-token'>is</span>
        <span className='font-medium text-primary-token'>{displayValue}</span>
      </div>
      <button
        type='button'
        onClick={onClear}
        className='flex h-full items-center rounded-r-md px-1.5 py-1 text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset'
        aria-label={`Clear ${groupLabel} filter`}
      >
        <X className='h-3 w-3' />
      </button>
    </div>
  );
}

// ============================================================================
// SUBMENU CHECKBOX ITEM
// ============================================================================

interface SubmenuCheckboxItemProps {
  label: string;
  icon?: ReactNode;
  count?: number;
  checked: boolean;
  onCheckedChange: () => void;
  /** Ref to the search input to return focus on ArrowUp from first item */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
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
        'gap-2 pl-2 pr-2 w-full',
        checked && 'text-primary-token'
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
          checked
            ? 'border-primary bg-primary text-white'
            : 'border-subtle bg-surface-2'
        )}
      >
        {checked && <Check className='h-3 w-3' />}
      </span>
      {icon && (
        <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token'>
          {icon}
        </span>
      )}
      <span className='flex-1 truncate text-left'>{label}</span>
      {count !== undefined && (
        <span className='text-[10px] tabular-nums text-tertiary-token'>
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ReleaseFilterDropdownProps {
  filters: ReleaseFilters;
  onFiltersChange: (filters: ReleaseFilters) => void;
  counts: ReleaseFilterCounts;
}

export function ReleaseFilterDropdown({
  filters,
  onFiltersChange,
  counts,
}: ReleaseFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mainSearch, setMainSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [popularitySearch, setPopularitySearch] = useState('');
  const [labelSearch, setLabelSearch] = useState('');
  const mainSearchRef = useRef<HTMLInputElement>(null);
  const typeSearchRef = useRef<HTMLInputElement>(null);
  const popularitySearchRef = useRef<HTMLInputElement>(null);
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
  const FILTER_CATEGORIES = [
    { id: 'releaseType', label: 'Release Type', iconName: 'Disc3' },
    { id: 'popularity', label: 'Popularity', iconName: 'Signal' },
    { id: 'label', label: 'Label', iconName: 'Building2' },
  ] as const;

  const filteredCategories = useMemo(() => {
    if (!mainSearch.trim()) return FILTER_CATEGORIES;
    const query = mainSearch.toLowerCase();
    return FILTER_CATEGORIES.filter(cat =>
      cat.label.toLowerCase().includes(query)
    );
  }, [mainSearch]);

  // Filter type options by search
  const filteredTypeOptions = useMemo(() => {
    if (!typeSearch.trim()) return RELEASE_TYPE_OPTIONS;
    const query = typeSearch.toLowerCase();
    return RELEASE_TYPE_OPTIONS.filter(opt =>
      opt.label.toLowerCase().includes(query)
    );
  }, [typeSearch]);

  // Filter popularity options by search
  const filteredPopularityOptions = useMemo(() => {
    if (!popularitySearch.trim()) return POPULARITY_OPTIONS;
    const query = popularitySearch.toLowerCase();
    return POPULARITY_OPTIONS.filter(opt =>
      opt.label.toLowerCase().includes(query)
    );
  }, [popularitySearch]);

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
      setTypeSearch('');
      setPopularitySearch('');
      setLabelSearch('');
    }
  }, []);

  // Submenu content styles
  const submenuContentClass = cn(
    DROPDOWN_CONTENT_BASE,
    DROPDOWN_SHADOW,
    DROPDOWN_TRANSITIONS,
    DROPDOWN_SLIDE_ANIMATIONS,
    'min-w-[200px] max-h-[300px] overflow-hidden flex flex-col'
  );

  return (
    <div className='flex items-center gap-2'>
      <DropdownMenuPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
        <TooltipShortcut label='Filter' shortcut='F' side='bottom'>
          <DropdownMenuPrimitive.Trigger asChild>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 gap-1.5 rounded-full border border-transparent text-secondary-token transition-colors duration-150 hover:border-subtle hover:bg-[#f2f2f2] hover:text-primary-token'
            >
              <Icon name='Filter' className='h-3.5 w-3.5' />
              Filter
            </Button>
          </DropdownMenuPrimitive.Trigger>
        </TooltipShortcut>

        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align='start'
            sideOffset={4}
            className={cn(
              DROPDOWN_CONTENT_BASE,
              DROPDOWN_SHADOW,
              DROPDOWN_TRANSITIONS,
              DROPDOWN_SLIDE_ANIMATIONS,
              'min-w-[200px] max-h-[320px] overflow-hidden flex flex-col'
            )}
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
                <div className='py-6 text-center text-xs text-tertiary-token'>
                  No filters found
                </div>
              ) : (
                <>
                  {/* Release Type Submenu */}
                  {filteredCategories.some(c => c.id === 'releaseType') && (
                    <DropdownMenuPrimitive.Sub
                      onOpenChange={open => {
                        if (open) {
                          // Delay focus to ensure submenu is rendered
                          setTimeout(() => typeSearchRef.current?.focus(), 50);
                        } else {
                          setTypeSearch('');
                        }
                      }}
                    >
                      <DropdownMenuPrimitive.SubTrigger
                        className={cn(MENU_ITEM_BASE, 'gap-2 justify-between')}
                      >
                        <div className='flex items-center gap-2'>
                          <Icon
                            name='Disc3'
                            className='h-3.5 w-3.5 text-tertiary-token'
                          />
                          <span>Release Type</span>
                          {typeFilterCount > 0 && (
                            <span className='rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary'>
                              {typeFilterCount}
                            </span>
                          )}
                        </div>
                        <ChevronRight className='h-3.5 w-3.5 text-tertiary-token' />
                      </DropdownMenuPrimitive.SubTrigger>
                      <DropdownMenuPrimitive.Portal>
                        <DropdownMenuPrimitive.SubContent
                          sideOffset={4}
                          alignOffset={-4}
                          className={submenuContentClass}
                        >
                          <SearchInput
                            value={typeSearch}
                            onChange={setTypeSearch}
                            onClear={() => {
                              setTypeSearch('');
                              typeSearchRef.current?.focus();
                            }}
                            placeholder='Search types...'
                            inputRef={typeSearchRef}
                          />
                          <div className='flex-1 overflow-y-auto p-1'>
                            {filteredTypeOptions.length === 0 ? (
                              <div className='py-6 text-center text-xs text-tertiary-token'>
                                No types found
                              </div>
                            ) : (
                              filteredTypeOptions.map(opt => (
                                <SubmenuCheckboxItem
                                  key={opt.id}
                                  label={opt.label}
                                  icon={
                                    <Icon
                                      name={opt.iconName as 'Disc3'}
                                      className='h-3.5 w-3.5'
                                    />
                                  }
                                  count={counts.byType[opt.id] || 0}
                                  checked={filters.releaseTypes.includes(
                                    opt.id
                                  )}
                                  onCheckedChange={() =>
                                    handleTypeToggle(opt.id)
                                  }
                                  searchInputRef={typeSearchRef}
                                />
                              ))
                            )}
                          </div>
                        </DropdownMenuPrimitive.SubContent>
                      </DropdownMenuPrimitive.Portal>
                    </DropdownMenuPrimitive.Sub>
                  )}

                  {/* Popularity Submenu */}
                  {filteredCategories.some(c => c.id === 'popularity') && (
                    <DropdownMenuPrimitive.Sub
                      onOpenChange={open => {
                        if (open) {
                          // Delay focus to ensure submenu is rendered
                          setTimeout(
                            () => popularitySearchRef.current?.focus(),
                            50
                          );
                        } else {
                          setPopularitySearch('');
                        }
                      }}
                    >
                      <DropdownMenuPrimitive.SubTrigger
                        className={cn(MENU_ITEM_BASE, 'gap-2 justify-between')}
                      >
                        <div className='flex items-center gap-2'>
                          <Icon
                            name='Signal'
                            className='h-3.5 w-3.5 text-tertiary-token'
                          />
                          <span>Popularity</span>
                          {popularityFilterCount > 0 && (
                            <span className='rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary'>
                              {popularityFilterCount}
                            </span>
                          )}
                        </div>
                        <ChevronRight className='h-3.5 w-3.5 text-tertiary-token' />
                      </DropdownMenuPrimitive.SubTrigger>
                      <DropdownMenuPrimitive.Portal>
                        <DropdownMenuPrimitive.SubContent
                          sideOffset={4}
                          alignOffset={-4}
                          className={submenuContentClass}
                        >
                          <SearchInput
                            value={popularitySearch}
                            onChange={setPopularitySearch}
                            onClear={() => {
                              setPopularitySearch('');
                              popularitySearchRef.current?.focus();
                            }}
                            placeholder='Search popularity...'
                            inputRef={popularitySearchRef}
                          />
                          <div className='flex-1 overflow-y-auto p-1'>
                            {filteredPopularityOptions.length === 0 ? (
                              <div className='py-6 text-center text-xs text-tertiary-token'>
                                No options found
                              </div>
                            ) : (
                              filteredPopularityOptions.map(opt => (
                                <SubmenuCheckboxItem
                                  key={opt.id}
                                  label={opt.label}
                                  icon={
                                    <Icon
                                      name={opt.iconName as 'Signal'}
                                      className='h-3.5 w-3.5'
                                    />
                                  }
                                  count={counts.byPopularity[opt.id] || 0}
                                  checked={filters.popularity.includes(opt.id)}
                                  onCheckedChange={() =>
                                    handlePopularityToggle(opt.id)
                                  }
                                  searchInputRef={popularitySearchRef}
                                />
                              ))
                            )}
                          </div>
                        </DropdownMenuPrimitive.SubContent>
                      </DropdownMenuPrimitive.Portal>
                    </DropdownMenuPrimitive.Sub>
                  )}

                  {/* Label Submenu */}
                  {filteredCategories.some(c => c.id === 'label') && (
                    <DropdownMenuPrimitive.Sub
                      onOpenChange={open => {
                        if (open) {
                          // Delay focus to ensure submenu is rendered
                          setTimeout(() => labelSearchRef.current?.focus(), 50);
                        } else {
                          setLabelSearch('');
                        }
                      }}
                    >
                      <DropdownMenuPrimitive.SubTrigger
                        className={cn(MENU_ITEM_BASE, 'gap-2 justify-between')}
                      >
                        <div className='flex items-center gap-2'>
                          <Icon
                            name='Building2'
                            className='h-3.5 w-3.5 text-tertiary-token'
                          />
                          <span>Label</span>
                          {labelFilterCount > 0 && (
                            <span className='rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary'>
                              {labelFilterCount}
                            </span>
                          )}
                        </div>
                        <ChevronRight className='h-3.5 w-3.5 text-tertiary-token' />
                      </DropdownMenuPrimitive.SubTrigger>
                      <DropdownMenuPrimitive.Portal>
                        <DropdownMenuPrimitive.SubContent
                          sideOffset={4}
                          alignOffset={-4}
                          className={submenuContentClass}
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
                          <div className='flex-1 overflow-y-auto p-1'>
                            {filteredLabelOptions.length === 0 ? (
                              <div className='py-6 text-center text-xs text-tertiary-token'>
                                {counts.byLabel.length === 0
                                  ? 'No labels available'
                                  : 'No labels found'}
                              </div>
                            ) : (
                              filteredLabelOptions.map(opt => (
                                <SubmenuCheckboxItem
                                  key={opt.label}
                                  label={opt.label}
                                  icon={
                                    <Icon
                                      name='Building2'
                                      className='h-3.5 w-3.5'
                                    />
                                  }
                                  count={opt.count}
                                  checked={filters.labels.includes(opt.label)}
                                  onCheckedChange={() =>
                                    handleLabelToggle(opt.label)
                                  }
                                  searchInputRef={labelSearchRef}
                                />
                              ))
                            )}
                          </div>
                        </DropdownMenuPrimitive.SubContent>
                      </DropdownMenuPrimitive.Portal>
                    </DropdownMenuPrimitive.Sub>
                  )}
                </>
              )}

              {/* Clear All option when filters are active */}
              {hasAnyFilter && (
                <>
                  <div className={cn(MENU_SEPARATOR_BASE, 'my-1')} />
                  <DropdownMenuPrimitive.Item
                    className={cn(
                      MENU_ITEM_BASE,
                      'gap-2 text-tertiary-token hover:text-primary-token'
                    )}
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
                  </DropdownMenuPrimitive.Item>
                </>
              )}
            </div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>

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

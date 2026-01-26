'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import {
  DROPDOWN_CONTENT_BASE,
  DROPDOWN_SHADOW,
  DROPDOWN_SLIDE_ANIMATIONS,
  DROPDOWN_TRANSITIONS,
  MENU_LABEL_BASE,
  MENU_SEPARATOR_BASE,
} from '@jovie/ui/lib/dropdown-styles';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, Search, X } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { ReleaseType } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import type { ReleaseFilterCounts } from './hooks/useReleaseFilterCounts';
import type { ReleaseFilters } from './ReleaseTableSubheader';

// ============================================================================
// TYPES
// ============================================================================

interface FilterOption {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
  group: 'type' | 'availability';
  groupLabel: string;
}

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

/** Availability filter options */
const AVAILABILITY_OPTIONS: {
  id: 'all' | 'complete' | 'incomplete';
  label: string;
  iconName: string;
}[] = [
  { id: 'all', label: 'All releases', iconName: 'List' },
  { id: 'complete', label: 'Complete', iconName: 'CheckCircle' },
  { id: 'incomplete', label: 'Missing providers', iconName: 'AlertCircle' },
];

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
        className='flex h-full items-center rounded-r-md px-1.5 py-1 text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
        aria-label={`Clear ${groupLabel} filter`}
      >
        <X className='h-3 w-3' />
      </button>
    </div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Build all filter options with groups
  const allOptions: FilterOption[] = useMemo(() => {
    const typeOptions = RELEASE_TYPE_OPTIONS.map(opt => ({
      id: `type:${opt.id}`,
      label: opt.label,
      icon: <Icon name={opt.iconName as 'Disc3'} className='h-3.5 w-3.5' />,
      count: counts.byType[opt.id] || 0,
      group: 'type' as const,
      groupLabel: 'Type',
    }));

    const availabilityOptions = AVAILABILITY_OPTIONS.filter(
      opt => opt.id !== 'all'
    ).map(opt => ({
      id: `availability:${opt.id}`,
      label: opt.label,
      icon: <Icon name={opt.iconName as 'List'} className='h-3.5 w-3.5' />,
      count:
        opt.id === 'complete'
          ? counts.byAvailability.complete
          : counts.byAvailability.incomplete,
      group: 'availability' as const,
      groupLabel: 'Availability',
    }));

    return [...typeOptions, ...availabilityOptions];
  }, [counts]);

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return allOptions;
    const query = searchQuery.toLowerCase();
    return allOptions.filter(
      opt =>
        opt.label.toLowerCase().includes(query) ||
        opt.groupLabel.toLowerCase().includes(query)
    );
  }, [allOptions, searchQuery]);

  // Group filtered options
  const groupedOptions = useMemo(() => {
    const groups: Record<string, FilterOption[]> = {};
    for (const opt of filteredOptions) {
      if (!groups[opt.group]) {
        groups[opt.group] = [];
      }
      groups[opt.group].push(opt);
    }
    return groups;
  }, [filteredOptions]);

  // Check if an option is selected
  const isSelected = useCallback(
    (optionId: string) => {
      const [group, id] = optionId.split(':');
      if (group === 'type') {
        return filters.releaseTypes.includes(id as ReleaseType);
      }
      if (group === 'availability') {
        return filters.availability === id;
      }
      return false;
    },
    [filters]
  );

  // Toggle option selection
  const handleToggle = useCallback(
    (optionId: string) => {
      const [group, id] = optionId.split(':');

      if (group === 'type') {
        const type = id as ReleaseType;
        const newTypes = filters.releaseTypes.includes(type)
          ? filters.releaseTypes.filter(t => t !== type)
          : [...filters.releaseTypes, type];
        onFiltersChange({ ...filters, releaseTypes: newTypes });
      } else if (group === 'availability') {
        const value = id as 'complete' | 'incomplete';
        // Toggle: if already selected, reset to 'all', otherwise set
        const newValue = filters.availability === value ? 'all' : value;
        onFiltersChange({ ...filters, availability: newValue });
      }
    },
    [filters, onFiltersChange]
  );

  // Clear type filters
  const handleClearTypes = useCallback(() => {
    onFiltersChange({ ...filters, releaseTypes: [] });
  }, [filters, onFiltersChange]);

  // Clear availability filter
  const handleClearAvailability = useCallback(() => {
    onFiltersChange({ ...filters, availability: 'all' });
  }, [filters, onFiltersChange]);

  // Reset search when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    } else {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  // Build active filter labels
  const activeTypeLabels = filters.releaseTypes.map(
    type => RELEASE_TYPE_OPTIONS.find(opt => opt.id === type)?.label || type
  );
  const activeAvailabilityLabel =
    filters.availability !== 'all'
      ? AVAILABILITY_OPTIONS.find(opt => opt.id === filters.availability)?.label
      : null;

  return (
    <div className='flex items-center gap-2'>
      <DropdownMenuPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
        <TooltipShortcut label='Filter' shortcut='F' side='bottom'>
          <DropdownMenuPrimitive.Trigger asChild>
            <Button
              variant='ghost'
              size='sm'
              aria-label='Filter releases'
              className='h-7 gap-1.5 text-secondary-token hover:bg-surface-2 hover:text-primary-token'
            >
              <Icon name='Filter' className='h-3.5 w-3.5' />
              Filter
            </Button>
          </DropdownMenuPrimitive.Trigger>
        </TooltipShortcut>

        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            ref={contentRef}
            align='start'
            sideOffset={4}
            className={cn(
              DROPDOWN_CONTENT_BASE,
              DROPDOWN_SHADOW,
              DROPDOWN_TRANSITIONS,
              DROPDOWN_SLIDE_ANIMATIONS,
              'w-64 max-h-[360px] overflow-hidden flex flex-col'
            )}
            onPointerDownOutside={e => {
              if (contentRef.current?.contains(e.target as Node)) {
                e.preventDefault();
              }
            }}
            onEscapeKeyDown={e => {
              if (searchQuery) {
                e.preventDefault();
                handleClearSearch();
              }
            }}
          >
            {/* Search Input */}
            <div className='sticky top-0 z-10 bg-surface-3 p-2 pb-1'>
              <div className='relative'>
                <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary-token' />
                <input
                  ref={searchInputRef}
                  type='text'
                  placeholder='Search filters...'
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={cn(
                    'w-full rounded-md border border-subtle bg-surface-2 py-1.5 pl-8 pr-7 text-xs',
                    'text-primary-token placeholder:text-tertiary-token',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                  )}
                  aria-label='Search filters'
                />
                {searchQuery && (
                  <button
                    type='button'
                    onClick={handleClearSearch}
                    className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-tertiary-token hover:bg-surface-1 hover:text-primary-token'
                    aria-label='Clear search'
                  >
                    <X className='h-3 w-3' />
                  </button>
                )}
              </div>
            </div>

            {/* Options List */}
            <div className='flex-1 overflow-y-auto overflow-x-hidden p-1'>
              {filteredOptions.length === 0 ? (
                <div className='py-6 text-center text-xs text-tertiary-token'>
                  No filters found
                </div>
              ) : (
                <>
                  {/* Type Group */}
                  {groupedOptions.type && groupedOptions.type.length > 0 && (
                    <div>
                      <div className={cn(MENU_LABEL_BASE, 'mt-1')}>Type</div>
                      {groupedOptions.type.map(option => {
                        const selected = isSelected(option.id);
                        return (
                          <button
                            key={option.id}
                            type='button'
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggle(option.id);
                            }}
                            className={cn(
                              'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium',
                              'transition-colors duration-150 ease-out',
                              'text-secondary-token hover:bg-white/5 hover:text-primary-token',
                              'focus-visible:bg-white/5 focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
                              selected && 'text-primary-token'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-4 w-4 items-center justify-center rounded-sm border',
                                selected
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-subtle bg-surface-2'
                              )}
                            >
                              {selected && <Check className='h-3 w-3' />}
                            </span>
                            {option.icon && (
                              <span className='flex h-4 w-4 items-center justify-center text-tertiary-token'>
                                {option.icon}
                              </span>
                            )}
                            <span className='flex-1 truncate text-left'>
                              {option.label}
                            </span>
                            {option.count !== undefined && (
                              <span className='text-[10px] tabular-nums text-tertiary-token'>
                                {option.count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Availability Group */}
                  {groupedOptions.availability &&
                    groupedOptions.availability.length > 0 && (
                      <div>
                        {groupedOptions.type &&
                          groupedOptions.type.length > 0 && (
                            <div className={cn(MENU_SEPARATOR_BASE, 'my-1')} />
                          )}
                        <div className={cn(MENU_LABEL_BASE, 'mt-1')}>
                          Availability
                        </div>
                        {groupedOptions.availability.map(option => {
                          const selected = isSelected(option.id);
                          return (
                            <button
                              key={option.id}
                              type='button'
                              onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggle(option.id);
                              }}
                              className={cn(
                                'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium',
                                'transition-colors duration-150 ease-out',
                                'text-secondary-token hover:bg-white/5 hover:text-primary-token',
                                'focus-visible:bg-white/5 focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
                                selected && 'text-primary-token'
                              )}
                            >
                              <span
                                className={cn(
                                  'flex h-4 w-4 items-center justify-center rounded-full border',
                                  selected
                                    ? 'border-primary bg-primary text-white'
                                    : 'border-subtle bg-surface-2'
                                )}
                              >
                                {selected && <Check className='h-3 w-3' />}
                              </span>
                              {option.icon && (
                                <span className='flex h-4 w-4 items-center justify-center text-tertiary-token'>
                                  {option.icon}
                                </span>
                              )}
                              <span className='flex-1 truncate text-left'>
                                {option.label}
                              </span>
                              {option.count !== undefined && (
                                <span className='text-[10px] tabular-nums text-tertiary-token'>
                                  {option.count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                </>
              )}
            </div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>

      {/* Active Filter Pills */}
      {filters.releaseTypes.length > 0 && (
        <ActiveFilterPill
          groupLabel='Type'
          values={activeTypeLabels}
          icon={<Icon name='Disc3' className='h-3.5 w-3.5' />}
          onClear={handleClearTypes}
        />
      )}

      {activeAvailabilityLabel && (
        <ActiveFilterPill
          groupLabel='Availability'
          values={[activeAvailabilityLabel]}
          icon={<Icon name='CheckCircle' className='h-3.5 w-3.5' />}
          onClear={handleClearAvailability}
        />
      )}
    </div>
  );
}

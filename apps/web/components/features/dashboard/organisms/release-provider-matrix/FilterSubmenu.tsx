'use client';

import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@jovie/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DropdownEmptyState } from '@/components/molecules/DropdownEmptyState';
import {
  FilterCheckboxItem,
  FilterSearchInput,
} from '@/components/molecules/filters';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';

/**
 * Configuration for a filter category option
 */
export interface FilterOption<T = string> {
  readonly id: T;
  readonly label: string;
  readonly iconName?: string;
}

/**
 * Props for the reusable FilterSubmenu component
 */
export interface FilterSubmenuProps<T = string> {
  /** Category label shown in the main menu */
  readonly label: string;
  /** Icon name for the category */
  readonly iconName: string;
  /** Available filter options */
  readonly options: readonly FilterOption<T>[];
  /** Currently selected option IDs */
  readonly selectedIds: readonly T[];
  /** Handler for toggling an option */
  readonly onToggle: (id: T) => void;
  /** Count map for each option */
  readonly counts?: Record<string, number>;
  /** Search placeholder text */
  readonly searchPlaceholder?: string;
  /** Whether this category should be shown (for main menu filtering) */
  readonly isVisible?: boolean;
}

/**
 * Reusable filter submenu component
 *
 * Provides a searchable, checkbox-based filter submenu with:
 * - Keyboard navigation support
 * - Search filtering
 * - Selection counts
 * - Icon support
 *
 * @example
 * <FilterSubmenu
 *   label="Release Type"
 *   iconName="Disc3"
 *   options={RELEASE_TYPE_OPTIONS}
 *   selectedIds={filters.releaseTypes}
 *   onToggle={handleTypeToggle}
 *   counts={counts.byType}
 *   searchPlaceholder="Search types..."
 * />
 */
export function FilterSubmenu<T extends string = string>({
  label,
  iconName,
  options,
  selectedIds,
  onToggle,
  counts = {},
  searchPlaceholder = 'Search...',
  isVisible = true,
}: FilterSubmenuProps<T>) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter options by search query
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = search.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(query));
  }, [options, search]);

  // Count of selected items
  const selectedCount = selectedIds.length;

  // Reset search when submenu closes
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, []);

  // Don't render if not visible (filtered out by main search)
  if (!isVisible) return null;

  return (
    <DropdownMenuSub onOpenChange={handleOpenChange}>
      <DropdownMenuSubTrigger className='justify-between rounded-full'>
        <div className='flex items-center gap-2'>
          <Icon
            name={iconName as 'Disc3'}
            className='h-3.5 w-3.5 text-tertiary-token'
          />
          <span>{label}</span>
          {selectedCount > 0 && (
            <span className='rounded-md border border-(--linear-app-frame-seam) bg-surface-1 px-1.5 py-0.5 text-3xs font-[510] text-secondary-token'>
              {selectedCount}
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
          'flex max-h-[260px] min-w-[196px] max-w-[calc(100vw-16px)] flex-col overflow-hidden'
        )}
      >
        <FilterSearchInput
          value={search}
          onChange={setSearch}
          onClear={() => {
            setSearch('');
            searchRef.current?.focus();
          }}
          placeholder={searchPlaceholder}
          inputRef={searchRef}
        />

        <div className='flex-1 overflow-y-auto p-1.5'>
          {filteredOptions.length === 0 ? (
            <DropdownEmptyState message='No options found' />
          ) : (
            filteredOptions.map(opt => (
              <FilterCheckboxItem
                key={opt.id}
                label={opt.label}
                icon={
                  opt.iconName ? (
                    <Icon
                      name={opt.iconName as 'Disc3'}
                      className='h-3.5 w-3.5'
                    />
                  ) : undefined
                }
                count={counts[opt.id] || 0}
                checked={selectedIds.includes(opt.id)}
                onCheckedChange={() => onToggle(opt.id)}
                searchInputRef={searchRef}
              />
            ))
          )}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

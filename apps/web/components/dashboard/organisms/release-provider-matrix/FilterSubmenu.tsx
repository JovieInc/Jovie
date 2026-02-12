'use client';

import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  MENU_ITEM_BASE,
} from '@jovie/ui';
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

/**
 * Search input component for filtering options within a submenu
 */
interface SearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onClear: () => void;
  readonly placeholder?: string;
  readonly inputRef?: React.RefObject<HTMLInputElement | null>;
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
          e.preventDefault();
          e.stopPropagation();
          onClear();
        } else if (onEscape) {
          onEscape();
        }
      } else if (e.key === 'ArrowDown') {
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
        <Icon
          name='Search'
          className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary-token'
        />
        <input
          ref={inputRef}
          type='text'
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className='w-full rounded-md border-0 border-b border-subtle bg-transparent py-1.5 pl-8 pr-7 text-xs text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-0'
        />
        {value && (
          <button
            type='button'
            onClick={onClear}
            className='absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 hover:bg-interactive-hover'
          >
            <Icon name='X' className='h-3 w-3 text-tertiary-token' />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Checkbox item within a filter submenu
 */
interface SubmenuCheckboxItemProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly count?: number;
  readonly checked: boolean;
  readonly onCheckedChange: () => void;
  readonly searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

function SubmenuCheckboxItem({
  label,
  icon,
  count = 0,
  checked,
  onCheckedChange,
  searchInputRef,
}: SubmenuCheckboxItemProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        searchInputRef?.current?.focus();
      }
    },
    [searchInputRef]
  );

  return (
    <button
      type='button'
      data-filter-item
      onClick={onCheckedChange}
      onKeyDown={handleKeyDown}
      className={cn(
        MENU_ITEM_BASE,
        'w-full justify-between',
        checked && 'bg-primary/5 dark:bg-primary/10'
      )}
    >
      <div className='flex items-center gap-2'>
        {icon && <span className='text-tertiary-token'>{icon}</span>}
        <span className='text-xs'>{label}</span>
      </div>
      <div className='flex items-center gap-2'>
        {count > 0 && (
          <span className='text-[10px] text-tertiary-token'>{count}</span>
        )}
        {checked && <Icon name='Check' className='h-3.5 w-3.5 text-primary' />}
      </div>
    </button>
  );
}

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
  /** Fallback item icon when some options have icons but others do not */
  readonly defaultItemIconName?: string;
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
  defaultItemIconName = 'Disc',
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
  const hasAnyOptionIcon = useMemo(
    () => options.some(opt => Boolean(opt.iconName)),
    [options]
  );

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
      <DropdownMenuSubTrigger className='justify-between'>
        <div className='flex items-center gap-2'>
          <Icon
            name={iconName as 'Disc3'}
            className='h-3.5 w-3.5 text-tertiary-token'
          />
          <span>{label}</span>
          {selectedCount > 0 && (
            <span className='rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary'>
              {selectedCount}
            </span>
          )}
        </div>
        <ChevronRight className='h-3.5 w-3.5 text-tertiary-token' />
      </DropdownMenuSubTrigger>

      <DropdownMenuSubContent
        sideOffset={4}
        alignOffset={-4}
        className='min-w-[200px] max-h-[300px] overflow-hidden flex flex-col'
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          onClear={() => {
            setSearch('');
            searchRef.current?.focus();
          }}
          placeholder={searchPlaceholder}
          inputRef={searchRef}
        />

        <div className='flex-1 overflow-y-auto p-1'>
          {filteredOptions.length === 0 ? (
            <div className='py-6 text-center text-xs text-tertiary-token'>
              No options found
            </div>
          ) : (
            filteredOptions.map(opt => (
              <SubmenuCheckboxItem
                key={opt.id}
                label={opt.label}
                icon={
                  opt.iconName || hasAnyOptionIcon ? (
                    <Icon
                      name={(opt.iconName ?? defaultItemIconName) as 'Disc3'}
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

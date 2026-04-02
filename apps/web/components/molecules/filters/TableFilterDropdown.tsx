'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TooltipShortcut,
} from '@jovie/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DropdownEmptyState } from '@/components/molecules/DropdownEmptyState';
import {
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
} from '@/components/organisms/table';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';
import { FilterCheckboxItem } from './FilterCheckboxItem';
import { FilterSearchInput } from './FilterSearchInput';

export interface TableFilterDropdownOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly iconName?: string;
  readonly count?: number;
}

export interface TableFilterDropdownCategory<T extends string = string> {
  readonly id: string;
  readonly label: string;
  readonly iconName: string;
  readonly options: readonly TableFilterDropdownOption<T>[];
  readonly selectedIds: readonly T[];
  readonly onToggle: (id: T) => void;
  readonly searchPlaceholder?: string;
}

export interface TableFilterDropdownProps {
  readonly categories: readonly TableFilterDropdownCategory[];
  readonly buttonClassName?: string;
  readonly iconOnly?: boolean;
  readonly emptyMessage?: string;
  readonly onClearAll?: () => void;
}

function TableFilterSection<T extends string>({
  category,
}: Readonly<{
  category: TableFilterDropdownCategory<T>;
}>) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const shouldShowSearch = category.options.length > 6;

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return category.options;
    const query = search.toLowerCase();
    return category.options.filter(option =>
      option.label.toLowerCase().includes(query)
    );
  }, [category.options, search]);

  const handleClear = useCallback(() => {
    setSearch('');
    searchRef.current?.focus();
  }, []);

  return (
    <div className='space-y-1.5'>
      <div className='flex items-center gap-2 px-1'>
        <Icon
          name={category.iconName as 'Filter'}
          className='h-3.5 w-3.5 text-tertiary-token'
        />
        <span className='text-[11px] font-[560] tracking-[0.02em] text-tertiary-token'>
          {category.label}
        </span>
        {category.selectedIds.length > 0 ? (
          <span className='rounded-full border border-(--linear-app-frame-seam) bg-surface-1 px-1.5 py-0.5 text-[10px] font-[510] text-secondary-token'>
            {category.selectedIds.length}
          </span>
        ) : null}
      </div>

      {shouldShowSearch ? (
        <FilterSearchInput
          value={search}
          onChange={setSearch}
          onClear={handleClear}
          placeholder={category.searchPlaceholder ?? `Search ${category.label}`}
          inputRef={searchRef}
        />
      ) : null}

      <div className='space-y-1'>
        {filteredOptions.length === 0 ? (
          <DropdownEmptyState message='No options found' />
        ) : (
          filteredOptions.map(option => (
            <FilterCheckboxItem
              key={option.id}
              label={option.label}
              icon={
                option.iconName ? (
                  <Icon
                    name={option.iconName as 'Filter'}
                    className='h-3.5 w-3.5'
                  />
                ) : undefined
              }
              count={option.count}
              checked={category.selectedIds.includes(option.id)}
              onCheckedChange={() => category.onToggle(option.id)}
              searchInputRef={searchRef}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function TableFilterDropdown({
  categories,
  buttonClassName,
  iconOnly = false,
  emptyMessage = 'No filters found',
  onClearAll,
}: Readonly<TableFilterDropdownProps>) {
  const [isOpen, setIsOpen] = useState(false);

  const hasAnyFilter = categories.some(category => category.selectedIds.length);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <TooltipShortcut label='Filter' shortcut='F' side='bottom'>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
              iconOnly && PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
              (isOpen || hasAnyFilter) && PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
              buttonClassName
            )}
            aria-pressed={isOpen || hasAnyFilter}
          >
            <Icon
              name='Filter'
              className={PAGE_TOOLBAR_ICON_CLASS}
              strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
            />
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
          'flex min-w-[240px] max-w-[calc(100vw-16px)] flex-col overflow-hidden'
        )}
        onCloseAutoFocus={event => event.preventDefault()}
      >
        <div className='max-h-[340px] space-y-3 overflow-y-auto p-2'>
          {categories.length === 0 ? (
            <DropdownEmptyState message={emptyMessage} />
          ) : (
            categories.map((category, index) => (
              <div key={category.id} className='space-y-3'>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <TableFilterSection category={category} />
              </div>
            ))
          )}
        </div>

        {hasAnyFilter && onClearAll ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className='text-tertiary-token hover:text-primary-token'
              onSelect={event => {
                event.preventDefault();
                onClearAll();
              }}
            >
              <Icon name='X' className='h-3.5 w-3.5' strokeWidth={2} />
              <span>Clear all filters</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

export interface TableFilterDropdownProps<T extends string = string> {
  readonly categories: readonly TableFilterDropdownCategory<T>[];
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

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return category.options;
    const query = search.toLowerCase();
    return category.options.filter(option =>
      option.label.toLowerCase().includes(query)
    );
  }, [category.options, search]);

  return (
    <div className='flex max-h-[320px] min-h-[220px] min-w-[260px] flex-col overflow-hidden'>
      <div className='border-b border-(--linear-app-frame-seam) p-2'>
        <FilterSearchInput
          value={search}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder={category.searchPlaceholder ?? `Search ${category.label}`}
          inputRef={searchRef}
        />
      </div>

      <div className='flex-1 overflow-y-auto p-1.5'>
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
                    name={option.iconName}
                    className='h-3.5 w-3.5 text-tertiary-token'
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

function TableFilterSubmenu<T extends string>({
  category,
}: Readonly<{
  category: TableFilterDropdownCategory<T>;
}>) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        inset={false}
        className='justify-between gap-2 rounded-[8px] px-2.5 py-2 text-[13px] text-secondary-token'
      >
        <span className='flex min-w-0 items-center gap-2.5'>
          <Icon
            name={category.iconName}
            className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
          />
          <span className='flex-1 truncate text-left'>{category.label}</span>
        </span>
        <span className='flex items-center gap-2'>
          {category.selectedIds.length > 0 ? (
            <span className='shrink-0 text-[11px] tabular-nums text-tertiary-token'>
              {category.selectedIds.length}
            </span>
          ) : null}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        sideOffset={8}
        className={cn(LINEAR_SURFACE.popover, 'overflow-hidden p-0')}
      >
        <TableFilterSection category={category} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function TableFilterDropdown<T extends string = string>({
  categories,
  buttonClassName,
  iconOnly = true,
  emptyMessage = 'No filters found',
  onClearAll,
}: Readonly<TableFilterDropdownProps<T>>) {
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
              PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
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
          'flex min-w-[240px] max-w-[calc(100vw-16px)] flex-col overflow-hidden p-1.5'
        )}
        onCloseAutoFocus={event => event.preventDefault()}
      >
        {categories.length === 0 ? (
          <DropdownEmptyState message={emptyMessage} />
        ) : (
          categories.map(category => (
            <TableFilterSubmenu key={category.id} category={category} />
          ))
        )}

        {hasAnyFilter && onClearAll ? (
          <>
            <DropdownMenuSeparator className='my-1' />
            <DropdownMenuItem
              className='rounded-[8px] text-tertiary-token hover:text-primary-token'
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

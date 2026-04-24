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
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DropdownEmptyState } from '@/components/molecules/DropdownEmptyState';
import {
  TOOLBAR_MENU_CONTENT_CLASS,
  TOOLBAR_MENU_HEADER_BADGE_CLASS,
  TOOLBAR_MENU_HEADER_CLASS,
  TOOLBAR_MENU_ITEM_CLASS,
  TOOLBAR_MENU_SEPARATOR_CLASS,
  TOOLBAR_MENU_SUB_TRIGGER_CLASS,
  ToolbarMenuRow,
} from '@/components/molecules/menus/ToolbarMenuPrimitives';
import {
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
} from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import { FilterCheckboxItem } from './FilterCheckboxItem';
import { FilterSearchInput } from './FilterSearchInput';

export interface TableFilterDropdownOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly leadingVisual?: ReactNode;
  readonly iconName?: string;
  readonly iconClassName?: string;
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
  readonly align?: 'start' | 'end';
  readonly headerLabel?: string;
  readonly shortcutHint?: string;
}

function TableFilterSection<T extends string>({
  category,
  headerLabel,
  shortcutHint,
}: Readonly<{
  category: TableFilterDropdownCategory<T>;
  headerLabel?: string;
  shortcutHint?: string;
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
      <div
        data-menu-header
        className='border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_44%,transparent)]'
      >
        <div className={cn(TOOLBAR_MENU_HEADER_CLASS, 'border-b-0 pb-1.25')}>
          <span className='truncate text-2xs font-[600] text-secondary-token'>
            {headerLabel ?? category.label}
          </span>
          {shortcutHint ? (
            <span className={TOOLBAR_MENU_HEADER_BADGE_CLASS}>
              {shortcutHint}
            </span>
          ) : null}
        </div>
        <div className='px-2.5 pb-2 pt-0.5'>
          <FilterSearchInput
            value={search}
            onChange={setSearch}
            onClear={() => setSearch('')}
            placeholder={
              category.searchPlaceholder ?? `Search ${category.label}`
            }
            inputRef={searchRef}
          />
        </div>
      </div>

      <div className='flex-1 overflow-y-auto px-1 pb-1'>
        {filteredOptions.length === 0 ? (
          <DropdownEmptyState message='No options found' />
        ) : (
          filteredOptions.map(option => (
            <FilterCheckboxItem
              key={option.id}
              label={option.label}
              icon={
                option.leadingVisual ??
                (option.iconName ? (
                  <Icon
                    name={option.iconName}
                    className={cn(
                      'h-3.5 w-3.5 text-tertiary-token',
                      option.iconClassName
                    )}
                  />
                ) : undefined)
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
  headerLabel,
  shortcutHint,
}: Readonly<{
  category: TableFilterDropdownCategory<T>;
  headerLabel?: string;
  shortcutHint?: string;
}>) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        inset={false}
        className={TOOLBAR_MENU_SUB_TRIGGER_CLASS}
      >
        <ToolbarMenuRow
          leadingVisual={
            <Icon
              name={category.iconName}
              className='h-3.5 w-3.5 text-secondary-token'
            />
          }
          label={category.label}
          trailingVisual={
            category.selectedIds.length > 0 ? (
              <span className='inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[6px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_44%,transparent)] bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_30%,transparent)] px-[5px] text-[10.5px] tabular-nums text-tertiary-token'>
                {category.selectedIds.length}
              </span>
            ) : null
          }
        />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        sideOffset={4}
        data-menu-surface='toolbar'
        className={cn(TOOLBAR_MENU_CONTENT_CLASS, 'p-0')}
      >
        <TableFilterSection
          category={category}
          headerLabel={headerLabel}
          shortcutHint={shortcutHint}
        />
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
  align = 'end',
  headerLabel,
  shortcutHint,
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
        align={align}
        sideOffset={4}
        data-menu-surface='toolbar'
        className={cn(
          TOOLBAR_MENU_CONTENT_CLASS,
          'flex min-w-[240px] max-w-[calc(100vw-16px)] flex-col'
        )}
        onCloseAutoFocus={event => event.preventDefault()}
      >
        {categories.length === 0 ? (
          <DropdownEmptyState message={emptyMessage} />
        ) : (
          categories.map(category => (
            <TableFilterSubmenu
              key={category.id}
              category={category}
              headerLabel={headerLabel}
              shortcutHint={shortcutHint}
            />
          ))
        )}

        {hasAnyFilter && onClearAll ? (
          <>
            <DropdownMenuSeparator className={TOOLBAR_MENU_SEPARATOR_CLASS} />
            <DropdownMenuItem
              className={TOOLBAR_MENU_ITEM_CLASS}
              onSelect={event => {
                event.preventDefault();
                onClearAll();
              }}
            >
              <ToolbarMenuRow
                leadingVisual={
                  <Icon name='X' className='h-3.5 w-3.5' strokeWidth={2} />
                }
                label='Clear All Filters'
              />
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

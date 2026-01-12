'use client';

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  MoreVertical,
  Search,
} from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';
import type {
  CommonDropdownActionItem,
  CommonDropdownCheckboxItem,
  CommonDropdownItem,
  CommonDropdownProps,
  CommonDropdownRadioGroup,
  CommonDropdownSubmenu,
} from './common-dropdown-types';
import {
  isActionItem,
  isCheckboxItem,
  isCustomItem,
  isLabel,
  isRadioGroup,
  isSeparator,
  isSubmenu,
} from './common-dropdown-types';

// Shared style constants
const GLASS_BASE_TRANSITIONS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

const GLASS_POSITIONING =
  'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 ' +
  'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ' +
  'origin-[--radix-dropdown-menu-content-transform-origin]';

const DROPDOWN_CONTENT_BASE =
  'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[10rem] overflow-y-auto overflow-x-hidden rounded-xl border border-subtle bg-surface-1 p-2 text-primary-token shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5 dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)] dark:ring-white/5';

const CONTEXT_CONTENT_BASE =
  'z-50 max-h-[var(--radix-context-menu-content-available-height)] min-w-[10rem] overflow-y-auto overflow-x-hidden rounded-xl border border-subtle bg-surface-1 p-2 text-primary-token shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5 dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)] dark:ring-white/5';

const MENU_ITEM_BASE =
  'relative flex cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors duration-150 ease-out text-secondary-token hover:bg-surface-2 hover:text-primary-token data-highlighted:bg-surface-2 data-highlighted:text-primary-token data-disabled:pointer-events-none data-disabled:opacity-50 focus-ring-themed focus-visible:ring-offset-(--color-bg-surface-1) [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

const MENU_ITEM_DESTRUCTIVE =
  'text-destructive hover:text-destructive hover:bg-destructive/10 data-highlighted:text-destructive data-highlighted:bg-destructive/10 focus-visible:ring-destructive [&_svg]:text-destructive';

const CHECKBOX_RADIO_BASE =
  'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-10 pr-3 text-sm outline-none transition-colors duration-150 ease-out text-secondary-token hover:bg-surface-2 hover:text-primary-token data-highlighted:bg-surface-2 data-highlighted:text-primary-token data-disabled:pointer-events-none data-disabled:opacity-50 focus-ring-themed focus-visible:ring-offset-(--color-bg-surface-1)';

/**
 * CommonDropdown - Unified dropdown component supporting multiple variants
 *
 * This component consolidates all dropdown patterns across the application:
 * - Action menus (click-to-open menus with actions)
 * - Select dropdowns (single-value selection)
 * - Context menus (right-click menus)
 *
 * Features:
 * - Action items with icons, badges, shortcuts
 * - Checkbox items (multi-select)
 * - Radio groups (single-select)
 * - Submenus (nested menus)
 * - Separators and labels
 * - Custom content rendering
 * - Search/filter functionality
 * - Loading states
 * - Full keyboard navigation
 * - WCAG 2.1 AA compliant
 *
 * @example
 * // Simple action menu
 * <CommonDropdown
 *   variant="dropdown"
 *   items={[
 *     { type: 'action', id: 'edit', label: 'Edit', icon: Pencil, onClick: handleEdit },
 *     { type: 'separator', id: 'sep-1' },
 *     { type: 'action', id: 'delete', label: 'Delete', icon: Trash2, onClick: handleDelete, variant: 'destructive' },
 *   ]}
 * />
 */
export function CommonDropdown(props: CommonDropdownProps) {
  const {
    variant = 'dropdown',
    items,
    trigger,
    defaultTriggerType = 'button',
    triggerIcon: TriggerIcon = MoreVertical,
    align = 'end',
    side = 'bottom',
    sideOffset = 4,
    open,
    onOpenChange,
    disablePortal = false,
    portalProps,
    contentClassName,
    triggerClassName,
    'aria-label': ariaLabel,
    searchable = false,
    searchPlaceholder = 'Search...',
    onSearch,
    isLoading = false,
    emptyMessage = 'No items found',
    disabled = false,
    children,
  } = props;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [filteredItems, setFilteredItems] = React.useState(items);

  // Search functionality
  React.useEffect(() => {
    if (!searchable) {
      setFilteredItems(items);
      return;
    }

    if (!searchQuery.trim()) {
      setFilteredItems(items);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = items.filter(item => {
      if (isLabel(item) || isSeparator(item) || isCustomItem(item)) return true;

      if (isActionItem(item)) {
        return item.label.toLowerCase().includes(query);
      }

      if (isCheckboxItem(item)) {
        return item.label.toLowerCase().includes(query);
      }

      if (isRadioGroup(item)) {
        return item.items.some(radioItem =>
          radioItem.label.toLowerCase().includes(query)
        );
      }

      if (isSubmenu(item)) {
        return item.label.toLowerCase().includes(query);
      }

      return false;
    });

    setFilteredItems(filtered);
    onSearch?.(searchQuery);
  }, [searchQuery, items, searchable, onSearch]);

  // Render context menu variant
  if (variant === 'context') {
    return (
      <ContextMenuPrimitive.Root>
        <ContextMenuPrimitive.Trigger asChild disabled={disabled}>
          {children}
        </ContextMenuPrimitive.Trigger>
        {renderContextMenuContent()}
      </ContextMenuPrimitive.Root>
    );
  }

  // Render dropdown menu variant
  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenuPrimitive.Trigger
        asChild
        disabled={disabled}
        className={triggerClassName}
      >
        {trigger || renderDefaultTrigger()}
      </DropdownMenuPrimitive.Trigger>
      {renderDropdownContent()}
    </DropdownMenuPrimitive.Root>
  );

  // Helper: Render default trigger
  function renderDefaultTrigger() {
    if (defaultTriggerType === 'select') {
      return (
        <button
          type='button'
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-default bg-surface-1 px-3 py-2',
            'text-sm ring-offset-background',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            triggerClassName
          )}
          aria-label={ariaLabel || 'Open dropdown'}
        >
          <span>Select...</span>
          <ChevronDown className='h-4 w-4 opacity-50' />
        </button>
      );
    }

    return (
      <button
        type='button'
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          triggerClassName
        )}
        aria-label={ariaLabel || 'More actions'}
        onClick={e => e.stopPropagation()}
      >
        <TriggerIcon className='h-4 w-4' />
      </button>
    );
  }

  // Helper: Render dropdown content
  function renderDropdownContent() {
    const content = (
      <DropdownMenuPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          DROPDOWN_CONTENT_BASE,
          GLASS_BASE_TRANSITIONS,
          GLASS_POSITIONING,
          contentClassName
        )}
      >
        {searchable && (
          <div className='relative mb-2'>
            <Search className='absolute left-3 top-2.5 h-4 w-4 text-tertiary-token' />
            <input
              type='text'
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='w-full rounded-md border border-subtle bg-surface-2 py-2 pl-9 pr-3 text-sm text-primary-token placeholder:text-tertiary-token focus:outline-none focus:ring-2 focus:ring-accent'
            />
          </div>
        )}
        {isLoading ? (
          <div className='flex items-center justify-center py-6'>
            <Loader2 className='h-6 w-6 animate-spin text-tertiary-token' />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className='py-6 text-center text-sm text-tertiary-token'>
            {emptyMessage}
          </div>
        ) : (
          renderItems(filteredItems, false)
        )}
      </DropdownMenuPrimitive.Content>
    );

    if (disablePortal) {
      return content;
    }

    return (
      <DropdownMenuPrimitive.Portal {...portalProps}>
        {content}
      </DropdownMenuPrimitive.Portal>
    );
  }

  // Helper: Render context menu content
  function renderContextMenuContent() {
    const content = (
      <ContextMenuPrimitive.Content
        className={cn(
          CONTEXT_CONTENT_BASE,
          GLASS_BASE_TRANSITIONS,
          GLASS_POSITIONING,
          contentClassName
        )}
      >
        {isLoading ? (
          <div className='flex items-center justify-center py-6'>
            <Loader2 className='h-6 w-6 animate-spin text-tertiary-token' />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className='py-6 text-center text-sm text-tertiary-token'>
            {emptyMessage}
          </div>
        ) : (
          renderItems(filteredItems, true)
        )}
      </ContextMenuPrimitive.Content>
    );

    if (disablePortal) {
      return content;
    }

    return (
      <ContextMenuPrimitive.Portal {...portalProps}>
        {content}
      </ContextMenuPrimitive.Portal>
    );
  }

  // Helper: Render items
  function renderItems(
    itemsToRender: CommonDropdownItem[],
    isContextMenu: boolean
  ): React.ReactNode {
    return itemsToRender.map((item, index) => {
      // Separator
      if (isSeparator(item)) {
        const Separator = isContextMenu
          ? ContextMenuPrimitive.Separator
          : DropdownMenuPrimitive.Separator;

        return (
          <Separator
            key={`separator-${index}`}
            className={cn(
              '-mx-1 my-1 h-px bg-[var(--color-border-subtle)]/70',
              item.className
            )}
          />
        );
      }

      // Label
      if (isLabel(item)) {
        const Label = isContextMenu
          ? ContextMenuPrimitive.Label
          : DropdownMenuPrimitive.Label;

        return (
          <Label
            key={item.id}
            className={cn(
              'px-3 py-1 text-xs font-semibold uppercase tracking-wide text-tertiary-token/80',
              item.inset && 'pl-10',
              item.className
            )}
          >
            {item.label}
          </Label>
        );
      }

      // Action item
      if (isActionItem(item)) {
        return renderActionItem(item, isContextMenu);
      }

      // Checkbox item
      if (isCheckboxItem(item)) {
        return renderCheckboxItem(item, isContextMenu);
      }

      // Radio group
      if (isRadioGroup(item)) {
        return renderRadioGroup(item, isContextMenu);
      }

      // Submenu
      if (isSubmenu(item)) {
        return renderSubmenu(item, isContextMenu);
      }

      // Custom item
      if (isCustomItem(item)) {
        return <React.Fragment key={item.id}>{item.render()}</React.Fragment>;
      }

      return null;
    });
  }

  // Helper: Render action item
  function renderActionItem(
    item: CommonDropdownActionItem,
    isContextMenu: boolean
  ): React.ReactNode {
    const MenuItem = isContextMenu
      ? ContextMenuPrimitive.Item
      : DropdownMenuPrimitive.Item;

    const IconComponent = item.icon;
    const IconAfterComponent = item.iconAfter;

    return (
      <MenuItem
        key={item.id}
        onClick={e => {
          e.stopPropagation();
          item.onClick();
        }}
        disabled={item.disabled}
        className={cn(
          MENU_ITEM_BASE,
          item.variant === 'destructive' && MENU_ITEM_DESTRUCTIVE,
          item.className
        )}
      >
        {IconComponent &&
          (typeof IconComponent === 'function' ? (
            <IconComponent className='h-3.5 w-3.5' />
          ) : (
            IconComponent
          ))}
        <span className='flex-1'>{item.label}</span>
        {item.badge && (
          <span
            className='rounded px-1.5 py-0.5 text-[10px] font-medium'
            style={{
              backgroundColor: item.badge.color || 'var(--color-accent-subtle)',
              color: item.badge.color ? 'white' : 'var(--color-accent)',
            }}
          >
            {item.badge.text}
          </span>
        )}
        {item.subText && (
          <span className='text-[11px] text-tertiary-token'>
            {item.subText}
          </span>
        )}
        {item.shortcut && (
          <span className='ml-auto text-[10px] tracking-[0.35em] text-tertiary-token/70'>
            {item.shortcut}
          </span>
        )}
        {IconAfterComponent &&
          (typeof IconAfterComponent === 'function' ? (
            <IconAfterComponent className='ml-auto h-3.5 w-3.5' />
          ) : (
            IconAfterComponent
          ))}
      </MenuItem>
    );
  }

  // Helper: Render checkbox item
  function renderCheckboxItem(
    item: CommonDropdownCheckboxItem,
    isContextMenu: boolean
  ): React.ReactNode {
    const CheckboxItem = isContextMenu
      ? ContextMenuPrimitive.CheckboxItem
      : DropdownMenuPrimitive.CheckboxItem;

    const ItemIndicator = isContextMenu
      ? ContextMenuPrimitive.ItemIndicator
      : DropdownMenuPrimitive.ItemIndicator;

    const IconComponent = item.icon;

    return (
      <CheckboxItem
        key={item.id}
        checked={item.checked}
        onCheckedChange={item.onCheckedChange}
        disabled={item.disabled}
        className={cn(CHECKBOX_RADIO_BASE, item.className)}
      >
        <span className='absolute left-2 flex h-3.5 w-3.5 items-center justify-center'>
          <ItemIndicator>
            <Check className='h-4 w-4' />
          </ItemIndicator>
        </span>
        {IconComponent && <IconComponent className='h-3.5 w-3.5' />}
        {item.label}
      </CheckboxItem>
    );
  }

  // Helper: Render radio group
  function renderRadioGroup(
    item: CommonDropdownRadioGroup,
    isContextMenu: boolean
  ): React.ReactNode {
    const RadioGroup = isContextMenu
      ? ContextMenuPrimitive.RadioGroup
      : DropdownMenuPrimitive.RadioGroup;

    const RadioItem = isContextMenu
      ? ContextMenuPrimitive.RadioItem
      : DropdownMenuPrimitive.RadioItem;

    const ItemIndicator = isContextMenu
      ? ContextMenuPrimitive.ItemIndicator
      : DropdownMenuPrimitive.ItemIndicator;

    return (
      <RadioGroup
        key={item.id}
        value={item.value}
        onValueChange={item.onValueChange}
      >
        {item.items.map(radioItem => {
          const IconComponent = radioItem.icon;

          return (
            <RadioItem
              key={radioItem.id}
              value={radioItem.value}
              disabled={radioItem.disabled}
              className={cn(CHECKBOX_RADIO_BASE, radioItem.className)}
            >
              <span className='absolute left-2 flex h-3.5 w-3.5 items-center justify-center'>
                <ItemIndicator>
                  <Circle className='h-2 w-2 fill-current' />
                </ItemIndicator>
              </span>
              {IconComponent &&
                (typeof IconComponent === 'function' ? (
                  <IconComponent className='h-3.5 w-3.5' />
                ) : (
                  IconComponent
                ))}
              {radioItem.label}
            </RadioItem>
          );
        })}
      </RadioGroup>
    );
  }

  // Helper: Render submenu
  function renderSubmenu(
    item: CommonDropdownSubmenu,
    isContextMenu: boolean
  ): React.ReactNode {
    if (isContextMenu) {
      const IconComponent = item.icon;

      return (
        <ContextMenuPrimitive.Sub key={item.id}>
          <ContextMenuPrimitive.SubTrigger
            disabled={item.disabled}
            className={cn(MENU_ITEM_BASE, item.className)}
          >
            {IconComponent && <IconComponent className='h-3.5 w-3.5' />}
            {item.label}
            <ChevronRight className='ml-auto' />
          </ContextMenuPrimitive.SubTrigger>
          <ContextMenuPrimitive.Portal>
            <ContextMenuPrimitive.SubContent
              className={cn(
                CONTEXT_CONTENT_BASE,
                GLASS_BASE_TRANSITIONS,
                GLASS_POSITIONING
              )}
            >
              {renderItems(item.items, true)}
            </ContextMenuPrimitive.SubContent>
          </ContextMenuPrimitive.Portal>
        </ContextMenuPrimitive.Sub>
      );
    }

    const IconComponent = item.icon;

    return (
      <DropdownMenuPrimitive.Sub key={item.id}>
        <DropdownMenuPrimitive.SubTrigger
          disabled={item.disabled}
          className={cn(MENU_ITEM_BASE, item.className)}
        >
          {IconComponent && <IconComponent className='h-3.5 w-3.5' />}
          {item.label}
          <ChevronRight className='ml-auto' />
        </DropdownMenuPrimitive.SubTrigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.SubContent
            className={cn(
              DROPDOWN_CONTENT_BASE,
              GLASS_BASE_TRANSITIONS,
              GLASS_POSITIONING
            )}
          >
            {renderItems(item.items, false)}
          </DropdownMenuPrimitive.SubContent>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Sub>
    );
  }
}

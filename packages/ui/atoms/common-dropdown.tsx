'use client';

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronDown, MoreVertical } from 'lucide-react';
import * as React from 'react';

import {
  contextMenuContentClasses,
  contextMenuContentCompactClasses,
  dropdownMenuContentClasses,
  dropdownMenuContentCompactClasses,
  MENU_ICON_TRIGGER_BASE,
  MENU_ITEM_BASE,
  MENU_ITEM_COMPACT,
  SELECT_TRIGGER_BASE,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';
import {
  type MenuPrimitiveKind,
  type MenuRenderContext,
  renderItem,
  renderRootBody,
  SearchableContent,
} from './common-dropdown-renderer';
import type {
  CommonDropdownItem,
  CommonDropdownProps,
} from './common-dropdown-types';
import { filterItems, getContentStyle } from './common-dropdown-utils';

/**
 * CommonDropdown - Unified dropdown component supporting action, context,
 * nested, searchable, loading, selected, and destructive menu states.
 */
export function CommonDropdown(props: CommonDropdownProps) {
  const {
    variant = 'dropdown',
    size = 'default',
    items,
    trigger,
    defaultTriggerType = 'button',
    triggerIcon: TriggerIcon = MoreVertical,
    align = 'end',
    side = 'bottom',
    sideOffset = 4,
    open,
    onOpenChange,
    modal = true,
    disablePortal = false,
    portalProps,
    contentClassName,
    triggerClassName,
    'aria-label': ariaLabel,
    searchable = false,
    searchPlaceholder = 'Search...',
    onSearch,
    onSearchChange,
    searchMode = 'root',
    filterItem,
    resetSearchOnClose = true,
    isLoading = false,
    emptyMessage = 'No items found',
    disabled = false,
    minWidth,
    maxHeight,
    children,
  } = props;

  const isCompact = size === 'compact';
  const itemBase = isCompact ? MENU_ITEM_COMPACT : MENU_ITEM_BASE;
  const dropdownContentBase = isCompact
    ? dropdownMenuContentCompactClasses
    : dropdownMenuContentClasses;
  const contextContentBase = isCompact
    ? contextMenuContentCompactClasses
    : contextMenuContentClasses;

  const [searchQuery, setSearchQuery] = React.useState('');
  const searchQueryRef = React.useRef('');
  const didMountRef = React.useRef(false);

  const filteredItems = React.useMemo(
    () => filterItems(items, searchQuery, searchMode, filterItem),
    [filterItem, items, searchMode, searchQuery]
  );

  const handleSearchChange = React.useCallback(
    (query: string) => {
      if (searchQueryRef.current === query) {
        return;
      }

      searchQueryRef.current = query;
      setSearchQuery(query);
      onSearchChange?.(query);
      if (query) {
        onSearch?.(query);
      }
    },
    [onSearch, onSearchChange]
  );

  const clearSearch = React.useCallback(() => {
    handleSearchChange('');
  }, [handleSearchChange]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && resetSearchOnClose) {
        clearSearch();
      }
      onOpenChange?.(nextOpen);
    },
    [clearSearch, onOpenChange, resetSearchOnClose]
  );

  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (open === false && resetSearchOnClose) {
      clearSearch();
    }
  }, [clearSearch, open, resetSearchOnClose]);

  const renderItems = React.useCallback(
    (itemsToRender: readonly CommonDropdownItem[], kind: MenuPrimitiveKind) => {
      const context: MenuRenderContext = {
        kind,
        itemBase,
        disablePortal,
        portalProps,
      };

      return itemsToRender.map(item => renderItem(item, context));
    },
    [disablePortal, itemBase, portalProps]
  );

  if (variant === 'context') {
    return (
      <ContextMenuPrimitive.Root onOpenChange={handleOpenChange}>
        <ContextMenuPrimitive.Trigger asChild disabled={disabled}>
          {children}
        </ContextMenuPrimitive.Trigger>
        {renderContextMenuContent()}
      </ContextMenuPrimitive.Root>
    );
  }

  return (
    <DropdownMenuPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      modal={modal}
    >
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

  function renderDefaultTrigger() {
    if (defaultTriggerType === 'select') {
      return (
        <button
          type='button'
          className={cn(SELECT_TRIGGER_BASE, triggerClassName)}
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
        className={cn(MENU_ICON_TRIGGER_BASE, triggerClassName)}
        aria-label={ariaLabel || 'More actions'}
        onClick={event => event.stopPropagation()}
      >
        <TriggerIcon className='h-4 w-4' />
      </button>
    );
  }

  function renderDropdownContent() {
    const content = (
      <DropdownMenuPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        data-menu-surface='toolbar'
        className={cn(dropdownContentBase, contentClassName)}
        style={getContentStyle(minWidth, maxHeight)}
        onEscapeKeyDown={event => {
          if (searchQuery) {
            event.preventDefault();
            clearSearch();
          }
        }}
      >
        {searchable ? (
          <SearchableContent
            query={searchQuery}
            placeholder={searchPlaceholder}
            onQueryChange={handleSearchChange}
            onClear={clearSearch}
          />
        ) : null}
        {renderRootBody({
          isLoading,
          items: filteredItems,
          emptyMessage,
          renderItems: itemsToRender => renderItems(itemsToRender, 'dropdown'),
        })}
      </DropdownMenuPrimitive.Content>
    );

    if (disablePortal) {
      return content;
    }

    return (
      <DropdownMenuPrimitive.Portal
        {...(portalProps as React.ComponentPropsWithoutRef<
          typeof DropdownMenuPrimitive.Portal
        >)}
      >
        {content}
      </DropdownMenuPrimitive.Portal>
    );
  }

  function renderContextMenuContent() {
    const content = (
      <ContextMenuPrimitive.Content
        data-menu-surface='toolbar'
        className={cn(contextContentBase, contentClassName)}
        style={getContentStyle(minWidth, maxHeight)}
        onEscapeKeyDown={event => {
          if (searchQuery) {
            event.preventDefault();
            clearSearch();
          }
        }}
      >
        {searchable ? (
          <SearchableContent
            query={searchQuery}
            placeholder={searchPlaceholder}
            onQueryChange={handleSearchChange}
            onClear={clearSearch}
          />
        ) : null}
        {renderRootBody({
          isLoading,
          items: filteredItems,
          emptyMessage,
          renderItems: itemsToRender => renderItems(itemsToRender, 'context'),
        })}
      </ContextMenuPrimitive.Content>
    );

    if (disablePortal) {
      return content;
    }

    return (
      <ContextMenuPrimitive.Portal
        {...(portalProps as React.ComponentPropsWithoutRef<
          typeof ContextMenuPrimitive.Portal
        >)}
      >
        {content}
      </ContextMenuPrimitive.Portal>
    );
  }
}

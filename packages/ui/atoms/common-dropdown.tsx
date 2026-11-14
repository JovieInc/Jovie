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
  OVERLAY_COLLISION_PADDING,
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
import {
  filterItems,
  flattenMenuItems,
  getContentStyle,
  MENU_MAX_SUBMENU_DEPTH,
  menuNeedsSearch,
  menuSubmenuDepth,
} from './common-dropdown-utils';

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
    dir,
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
    searchable: requestedSearchable = false,
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
    scrollBody,
    motion,
    children,
  } = props;
  const deepMenu = menuSubmenuDepth(items) > MENU_MAX_SUBMENU_DEPTH;
  const menuItems = React.useMemo(
    () => (deepMenu ? flattenMenuItems(items) : items),
    [deepMenu, items]
  );
  const searchable =
    requestedSearchable || deepMenu || menuNeedsSearch(menuItems);

  const isCompact = size === 'compact';
  const itemBase = isCompact ? MENU_ITEM_COMPACT : MENU_ITEM_BASE;
  const dropdownContentBase = isCompact
    ? dropdownMenuContentCompactClasses
    : dropdownMenuContentClasses;
  const contextContentBase = isCompact
    ? contextMenuContentCompactClasses
    : contextMenuContentClasses;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(Boolean(open));
  const searchQueryRef = React.useRef('');
  const rootSearchInputRef = React.useRef<HTMLInputElement>(null);
  const didMountRef = React.useRef(false);

  const filteredItems = React.useMemo(
    () => filterItems(menuItems, searchQuery, searchMode, filterItem),
    [filterItem, menuItems, searchMode, searchQuery]
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
      setIsOpen(nextOpen);
      if (!nextOpen && resetSearchOnClose) {
        clearSearch();
      }
      onOpenChange?.(nextOpen);
    },
    [clearSearch, onOpenChange, resetSearchOnClose]
  );

  React.useEffect(() => {
    if (typeof open === 'boolean') {
      setIsOpen(open);
    }
  }, [open]);

  React.useEffect(() => {
    if (!searchable || !isOpen) return;

    const focusTimer = globalThis.setTimeout(() => {
      rootSearchInputRef.current?.focus();
    }, 0);

    return () => globalThis.clearTimeout(focusTimer);
  }, [isOpen, searchable]);

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
      <ContextMenuPrimitive.Root dir={dir} onOpenChange={handleOpenChange}>
        <ContextMenuPrimitive.Trigger
          asChild
          disabled={disabled}
          data-slot='common-dropdown-trigger'
        >
          {children}
        </ContextMenuPrimitive.Trigger>
        {renderContextMenuContent()}
      </ContextMenuPrimitive.Root>
    );
  }

  return (
    <DropdownMenuPrimitive.Root
      dir={dir}
      open={open}
      onOpenChange={handleOpenChange}
      modal={modal}
    >
      <DropdownMenuPrimitive.Trigger
        asChild
        disabled={disabled}
        data-slot='common-dropdown-trigger'
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
          data-slot='common-dropdown-trigger-control'
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
        data-slot='common-dropdown-trigger-control'
        aria-label={ariaLabel || 'More actions'}
        onClick={event => event.stopPropagation()}
      >
        <TriggerIcon className='h-4 w-4' />
      </button>
    );
  }

  function renderDropdownContent() {
    const dropdownBody = renderRootBody({
      isLoading,
      items: filteredItems,
      emptyMessage,
      renderItems: itemsToRender => renderItems(itemsToRender, 'dropdown'),
    });
    const content = (
      <DropdownMenuPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={OVERLAY_COLLISION_PADDING}
        data-menu-surface='toolbar'
        data-slot='common-dropdown-content'
        aria-busy={isLoading || undefined}
        /* A text input is not an allowed child of role="menu" (axe
           aria-required-children), so a searchable menu presents its
           surface as a group and keeps the item rows in an inner menu.
           Radix hardcodes aria-orientation on the content; orientation is
           not an allowed aria-* attribute on role="group" (axe
           aria-allowed-attr), so strip it in the group form. */
        role={searchable ? 'group' : 'menu'}
        aria-orientation={searchable ? undefined : 'vertical'}
        data-scroll-body={scrollBody ? 'true' : undefined}
        data-motion={motion?.name ?? 'fade'}
        className={cn(
          dropdownContentBase,
          scrollBody?.contentClassName,
          motion?.className,
          contentClassName
        )}
        style={
          scrollBody
            ? scrollBody.getContentStyle(minWidth, maxHeight)
            : getContentStyle(minWidth, maxHeight, 'dropdown')
        }
        onKeyDown={
          searchable && scrollBody
            ? event =>
                scrollBody.redirectTyping(
                  event,
                  rootSearchInputRef.current,
                  searchQueryRef.current,
                  handleSearchChange
                )
            : undefined
        }
        onEscapeKeyDown={event => {
          if (searchQuery) {
            event.preventDefault();
            clearSearch();
          }
        }}
      >
        {searchable ? (
          <SearchableContent
            inputRef={rootSearchInputRef}
            query={searchQuery}
            placeholder={searchPlaceholder}
            onQueryChange={handleSearchChange}
            onClear={clearSearch}
          />
        ) : null}
        {scrollBody ? (
          <scrollBody.Body>
            {searchable ? <div role='menu'>{dropdownBody}</div> : dropdownBody}
          </scrollBody.Body>
        ) : searchable ? (
          <div role='menu'>{dropdownBody}</div>
        ) : (
          dropdownBody
        )}
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
        collisionPadding={OVERLAY_COLLISION_PADDING}
        data-menu-surface='toolbar'
        data-slot='common-dropdown-content'
        aria-busy={isLoading || undefined}
        /* Same searchable group/menu split as the dropdown content above.
           Radix hardcodes aria-orientation; it is not allowed on
           role="group" (axe aria-allowed-attr). */
        role={searchable ? 'group' : 'menu'}
        aria-orientation={searchable ? undefined : 'vertical'}
        className={cn(contextContentBase, contentClassName)}
        style={getContentStyle(minWidth, maxHeight, 'context')}
        onEscapeKeyDown={event => {
          if (searchQuery) {
            event.preventDefault();
            clearSearch();
          }
        }}
      >
        {searchable ? (
          <SearchableContent
            inputRef={rootSearchInputRef}
            query={searchQuery}
            placeholder={searchPlaceholder}
            onQueryChange={handleSearchChange}
            onClear={clearSearch}
          />
        ) : null}
        {searchable ? (
          <div role='menu'>
            {renderRootBody({
              isLoading,
              items: filteredItems,
              emptyMessage,
              renderItems: itemsToRender =>
                renderItems(itemsToRender, 'context'),
            })}
          </div>
        ) : (
          renderRootBody({
            isLoading,
            items: filteredItems,
            emptyMessage,
            renderItems: itemsToRender => renderItems(itemsToRender, 'context'),
          })
        )}
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

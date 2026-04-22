'use client';

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronRight, Loader2, Search, X } from 'lucide-react';
import * as React from 'react';

import {
  CONTEXT_TRANSFORM_ORIGIN,
  DROPDOWN_TRANSFORM_ORIGIN,
  MENU_EMPTY_STATE_BASE,
  MENU_LEADING_SLOT_BASE,
  MENU_LOADING_STATE_BASE,
  MENU_SEARCH_HEADER_BASE,
  MENU_SEARCH_INPUT_BASE,
  subMenuContentClasses,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';
import {
  renderActionItem,
  renderCheckboxItem,
  renderIcon,
  renderLabel,
  renderRadioGroup,
  renderSeparator,
} from './common-dropdown-item-renderers';
import type {
  CommonDropdownItem,
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
import { filterItems, getContentStyle } from './common-dropdown-utils';

export type MenuPrimitiveKind = 'dropdown' | 'context';

export interface MenuRenderContext {
  readonly kind: MenuPrimitiveKind;
  readonly itemBase: string;
  readonly disablePortal: boolean;
  readonly portalProps?: Record<string, unknown>;
}

interface SearchableContentProps {
  readonly query: string;
  readonly placeholder: string;
  readonly onQueryChange: (query: string) => void;
  readonly onClear: () => void;
  readonly inputRef?: React.Ref<HTMLInputElement>;
}

interface SubmenuGroupContextValue {
  readonly activeSubmenuId: string | null;
  readonly setActiveSubmenuId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
}

const SubmenuGroupContext =
  React.createContext<SubmenuGroupContextValue | null>(null);

function SubmenuGroupProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [activeSubmenuId, setActiveSubmenuId] = React.useState<string | null>(
    null
  );
  const value = React.useMemo(
    () => ({ activeSubmenuId, setActiveSubmenuId }),
    [activeSubmenuId]
  );

  return (
    <SubmenuGroupContext.Provider value={value}>
      {children}
    </SubmenuGroupContext.Provider>
  );
}

function focusSiblingMenuItem(
  input: HTMLInputElement | null,
  placement: 'first' | 'last'
): HTMLElement | undefined {
  const menu = input?.closest('[role="menu"]');
  if (!menu) return undefined;

  const menuItems = Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'
    )
  ).filter(
    item =>
      item.dataset.disabled === undefined &&
      item.getAttribute('aria-disabled') !== 'true'
  );

  const nextItem = placement === 'first' ? menuItems.at(0) : menuItems.at(-1);
  nextItem?.focus();
  return nextItem;
}

export function SearchableContent({
  query,
  placeholder,
  onQueryChange,
  onClear,
  inputRef,
}: SearchableContentProps) {
  const localInputRef = React.useRef<HTMLInputElement | null>(null);
  const setInputRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      localInputRef.current = node;

      if (typeof inputRef === 'function') {
        inputRef(node);
        return;
      }

      if (inputRef) {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current =
          node;
      }
    },
    [inputRef]
  );

  return (
    <div data-menu-header className={MENU_SEARCH_HEADER_BASE}>
      <div className='relative'>
        <Search className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--linear-text-tertiary)' />
        <input
          ref={setInputRef}
          type='text'
          placeholder={placeholder}
          aria-label={placeholder}
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              return;
            }

            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              focusSiblingMenuItem(
                localInputRef.current,
                event.key === 'ArrowDown' ? 'first' : 'last'
              );
              return;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              focusSiblingMenuItem(localInputRef.current, 'first')?.click();
              return;
            }

            event.stopPropagation();
          }}
          className={MENU_SEARCH_INPUT_BASE}
        />
        {query ? (
          <button
            type='button'
            onMouseDown={event => event.preventDefault()}
            onClick={() => {
              onClear();
              localInputRef.current?.focus();
            }}
            className='absolute right-1.5 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-(--linear-app-radius-item) text-(--linear-text-tertiary) hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:bg-(--linear-bg-surface-2)'
            aria-label='Clear search'
          >
            <X className='h-3 w-3' />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div role='status' aria-live='polite' className={MENU_LOADING_STATE_BASE}>
      <Loader2
        aria-hidden='true'
        className='h-4 w-4 animate-spin motion-reduce:animate-none'
      />
      <span className='sr-only'>Loading menu items</span>
    </div>
  );
}

function EmptyState({ message }: { readonly message: string }) {
  return <div className={MENU_EMPTY_STATE_BASE}>{message}</div>;
}

export function renderRootBody({
  isLoading,
  items,
  emptyMessage,
  renderItems,
}: {
  readonly isLoading: boolean;
  readonly items: readonly CommonDropdownItem[];
  readonly emptyMessage: string;
  readonly renderItems: (
    itemsToRender: readonly CommonDropdownItem[]
  ) => React.ReactNode;
}) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return <SubmenuGroupProvider>{renderItems(items)}</SubmenuGroupProvider>;
}

export function renderItem(
  item: CommonDropdownItem,
  context: MenuRenderContext
): React.ReactNode {
  if (isSeparator(item)) {
    return renderSeparator(item, context.kind);
  }

  if (isLabel(item)) {
    return renderLabel(item, context.kind);
  }

  if (isActionItem(item)) {
    return renderActionItem(item, context);
  }

  if (isCheckboxItem(item)) {
    return renderCheckboxItem(item, context);
  }

  if (isRadioGroup(item)) {
    return renderRadioGroup(item, context);
  }

  if (isSubmenu(item)) {
    return (
      <CommonDropdownSubmenuRenderer
        key={item.id}
        item={item}
        context={context}
      />
    );
  }

  if (isCustomItem(item)) {
    return <React.Fragment key={item.id}>{item.render()}</React.Fragment>;
  }

  return null;
}

function CommonDropdownSubmenuRenderer({
  item,
  context,
}: {
  readonly item: CommonDropdownSubmenu;
  readonly context: MenuRenderContext;
}) {
  const submenuGroup = React.useContext(SubmenuGroupContext);
  const [localOpen, setLocalOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [measuredMinWidth, setMeasuredMinWidth] = React.useState<
    string | undefined
  >(undefined);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const Sub =
    context.kind === 'context'
      ? ContextMenuPrimitive.Sub
      : DropdownMenuPrimitive.Sub;
  const SubTrigger =
    context.kind === 'context'
      ? ContextMenuPrimitive.SubTrigger
      : DropdownMenuPrimitive.SubTrigger;
  const Portal =
    context.kind === 'context'
      ? ContextMenuPrimitive.Portal
      : DropdownMenuPrimitive.Portal;
  const SubContent =
    context.kind === 'context'
      ? ContextMenuPrimitive.SubContent
      : DropdownMenuPrimitive.SubContent;
  const transformOrigin =
    context.kind === 'context'
      ? CONTEXT_TRANSFORM_ORIGIN
      : DROPDOWN_TRANSFORM_ORIGIN;
  const open = submenuGroup
    ? submenuGroup.activeSubmenuId === item.id
    : localOpen;
  const filteredItems = React.useMemo(
    () => filterItems(item.items, query, 'recursive', item.filterItem),
    [item.filterItem, item.items, query]
  );

  React.useEffect(() => {
    if (!open || !item.searchable) return;

    const timer = globalThis.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => globalThis.clearTimeout(timer);
  }, [item.searchable, open]);

  const handleQueryChange = React.useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      item.onSearchChange?.(nextQuery);
    },
    [item]
  );

  const clearQuery = React.useCallback(() => {
    handleQueryChange('');
  }, [handleQueryChange]);

  React.useEffect(() => {
    if (!open && query) {
      clearQuery();
    }
  }, [clearQuery, open, query]);

  const measureTriggerWidth = React.useCallback(() => {
    if (item.minWidth !== undefined || !triggerRef.current) {
      return;
    }

    const nextWidth = Math.round(
      triggerRef.current.getBoundingClientRect().width
    );
    setMeasuredMinWidth(nextWidth > 0 ? `${nextWidth}px` : undefined);
  }, [item.minWidth]);

  const content = (
    <SubContent
      ref={contentRef}
      data-menu-surface='toolbar'
      className={cn(subMenuContentClasses, transformOrigin)}
      style={getContentStyle(item.minWidth ?? measuredMinWidth, item.maxHeight)}
      onFocusOutside={event => {
        if (contentRef.current?.contains(event.target as Node)) {
          event.preventDefault();
        }
      }}
      onPointerDownOutside={event => {
        if (contentRef.current?.contains(event.target as Node)) {
          event.preventDefault();
        }
      }}
      onEscapeKeyDown={event => {
        if (query) {
          event.preventDefault();
          clearQuery();
        }
      }}
    >
      {item.searchable ? (
        <SearchableContent
          query={query}
          placeholder={item.searchPlaceholder ?? `Search ${item.label}`}
          onQueryChange={handleQueryChange}
          onClear={clearQuery}
          inputRef={inputRef}
        />
      ) : null}
      {renderRootBody({
        isLoading: item.isLoading ?? false,
        items: filteredItems,
        emptyMessage: item.emptyMessage ?? 'No items found',
        renderItems: itemsToRender =>
          itemsToRender.map(child => renderItem(child, context)),
      })}
    </SubContent>
  );

  return (
    <Sub
      key={item.id}
      open={open}
      onOpenChange={nextOpen => {
        if (nextOpen) {
          measureTriggerWidth();
        }
        if (submenuGroup) {
          submenuGroup.setActiveSubmenuId(currentId => {
            if (nextOpen) {
              return item.id;
            }

            return currentId === item.id ? null : currentId;
          });
        } else {
          setLocalOpen(nextOpen);
        }
        if (!nextOpen && query) {
          clearQuery();
        }
      }}
    >
      <SubTrigger
        ref={triggerRef}
        disabled={item.disabled}
        data-menu-row=''
        className={cn(context.itemBase, item.className)}
      >
        <span className={MENU_LEADING_SLOT_BASE}>
          {renderIcon(item.icon, 'h-4 w-4')}
        </span>
        <span className='min-w-0 flex-1 truncate'>{item.label}</span>
        <ChevronRight className='ml-auto h-3.5 w-3.5' />
      </SubTrigger>
      {context.disablePortal ? (
        content
      ) : (
        <Portal
          {...(context.portalProps as React.ComponentPropsWithoutRef<
            typeof DropdownMenuPrimitive.Portal
          >)}
        >
          {content}
        </Portal>
      )}
    </Sub>
  );
}

'use client';

/**
 * SearchableSubmenu - A submenu component with integrated search
 *
 * Features:
 * - Search input at top of submenu that auto-focuses on open
 * - Instant filtering as user types
 * - Menu stays open while typing (proper focus handling)
 * - Full keyboard navigation (Arrow keys, Enter, Escape)
 * - Section headers for organized results
 * - Empty state when no results match
 *
 * This component is designed to be used within Radix UI dropdown/context menus
 * as a submenu replacement for searchable lists.
 */

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronRight, Loader2, Search, X } from 'lucide-react';
import * as React from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DROPDOWN_CONTENT_BASE,
  DROPDOWN_SHADOW,
  DROPDOWN_SLIDE_ANIMATIONS,
  DROPDOWN_TRANSITIONS,
  MENU_ITEM_BASE,
  MENU_LABEL_BASE,
  MENU_SEPARATOR_BASE,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchableSubmenuItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Optional description shown below label */
  description?: string;
  /** Optional icon component */
  icon?: React.ReactNode;
  /** Optional badge text (e.g., usage count) */
  badge?: string;
  /** Optional keyboard shortcut hint */
  shortcut?: string;
  /** Whether the item is disabled */
  disabled?: boolean;
}

export interface SearchableSubmenuSection {
  /** Section identifier */
  id: string;
  /** Section header label */
  label: string;
  /** Items in this section */
  items: SearchableSubmenuItem[];
}

export interface SearchableSubmenuProps {
  /** Custom trigger element (if not provided, uses triggerLabel + triggerIcon) */
  trigger?: React.ReactNode;
  /** Trigger label for accessibility and default trigger */
  triggerLabel: string;
  /** Optional trigger icon */
  triggerIcon?: React.ReactNode;
  /** Sections to display (organized groups) */
  sections: SearchableSubmenuSection[];
  /** Callback when an item is selected */
  onSelect: (item: SearchableSubmenuItem) => void;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Empty state message when no results */
  emptyMessage?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Filter function (if not provided, uses default label/description filter) */
  filterFn?: (item: SearchableSubmenuItem, query: string) => boolean;
  /** Callback when search query changes */
  onSearchChange?: (query: string) => void;
  /** Optional footer element (e.g., "Create Custom..." link) */
  footer?: React.ReactNode;
  /** Additional className for the submenu content */
  contentClassName?: string;
  /** Whether the submenu is disabled */
  disabled?: boolean;
}

// ============================================================================
// DEFAULT FILTER FUNCTION
// ============================================================================

function defaultFilterFn(item: SearchableSubmenuItem, query: string): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return true;

  const searchableText = [item.label, item.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SearchableSubmenu({
  trigger,
  triggerLabel,
  triggerIcon,
  sections,
  onSelect,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  isLoading = false,
  filterFn = defaultFilterFn,
  onSearchChange,
  footer,
  contentClassName,
  disabled = false,
}: SearchableSubmenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const searchId = useId();
  const listId = useId();

  // Filter items based on search query
  const filteredSections = useMemo(() => {
    return sections
      .map(section => ({
        ...section,
        items: section.items.filter(item => filterFn(item, searchQuery)),
      }))
      .filter(section => section.items.length > 0);
  }, [sections, searchQuery, filterFn]);

  // Flatten items for keyboard navigation
  const flatItems = useMemo(() => {
    return filteredSections.flatMap(section => section.items);
  }, [filteredSections]);

  const hasResults = flatItems.length > 0;

  // Reset state when submenu opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(0);
      // Focus search input after a brief delay to ensure it's mounted
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset highlighted index when search results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [flatItems.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    const itemRef = itemRefs.current.get(highlightedIndex);
    if (itemRef) {
      itemRef.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex]);

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      onSearchChange?.(value);
    },
    [onSearchChange]
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    onSearchChange?.('');
    searchInputRef.current?.focus();
  }, [onSearchChange]);

  // Handle item selection
  const handleSelectItem = useCallback(
    (item: SearchableSubmenuItem) => {
      if (item.disabled) return;
      onSelect(item);
      setIsOpen(false);
    },
    [onSelect]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (flatItems.length > 0) {
            setHighlightedIndex(prev =>
              prev < flatItems.length - 1 ? prev + 1 : 0
            );
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (flatItems.length > 0) {
            setHighlightedIndex(prev =>
              prev > 0 ? prev - 1 : flatItems.length - 1
            );
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          const item = flatItems[highlightedIndex];
          if (item && !item.disabled) {
            handleSelectItem(item);
          }
          break;
        }
        case 'Escape': {
          if (searchQuery) {
            e.preventDefault();
            e.stopPropagation();
            handleClearSearch();
          }
          // If no search query, let Radix handle the escape to close submenu
          break;
        }
        case 'Home': {
          e.preventDefault();
          setHighlightedIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          setHighlightedIndex(Math.max(0, flatItems.length - 1));
          break;
        }
      }
    },
    [
      flatItems,
      highlightedIndex,
      searchQuery,
      handleSelectItem,
      handleClearSearch,
    ]
  );

  // Track item refs for scrolling
  const setItemRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (el) {
        itemRefs.current.set(index, el);
      } else {
        itemRefs.current.delete(index);
      }
    },
    []
  );

  // Build content classes
  const contentClasses = cn(
    DROPDOWN_CONTENT_BASE,
    DROPDOWN_SHADOW,
    DROPDOWN_TRANSITIONS,
    DROPDOWN_SLIDE_ANIMATIONS,
    'min-w-[280px] max-w-[320px]',
    'max-h-[400px] overflow-hidden flex flex-col',
    contentClassName
  );

  let globalIndex = 0;

  return (
    <DropdownMenuPrimitive.Sub open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuPrimitive.SubTrigger
        disabled={disabled}
        className={cn(MENU_ITEM_BASE)}
      >
        {triggerIcon}
        <span className='flex-1'>{triggerLabel}</span>
        <ChevronRight className='ml-auto h-4 w-4' />
      </DropdownMenuPrimitive.SubTrigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.SubContent
          ref={contentRef}
          className={contentClasses}
          sideOffset={2}
          alignOffset={-5}
          onKeyDown={handleKeyDown}
          // Prevent closing when clicking inside (important for search input)
          onPointerDownOutside={e => {
            // Allow clicking inside the content
            if (contentRef.current?.contains(e.target as Node)) {
              e.preventDefault();
            }
          }}
          // Prevent focus from leaving the submenu
          onFocusOutside={e => {
            // Keep focus inside when interacting with search
            if (contentRef.current?.contains(e.target as Node)) {
              e.preventDefault();
            }
          }}
          // Prevent escape from bubbling when search has content
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
              <Search className='absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary-token' />
              <input
                ref={searchInputRef}
                id={searchId}
                type='text'
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={handleSearchChange}
                className={cn(
                  'w-full rounded-lg border border-subtle bg-surface-2 py-2 pl-9 pr-8 text-sm',
                  'text-primary-token placeholder:text-tertiary-token',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                )}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                aria-autocomplete='list'
                role='combobox'
                aria-expanded={isOpen}
                aria-activedescendant={
                  flatItems[highlightedIndex]
                    ? `item-${flatItems[highlightedIndex].id}`
                    : undefined
                }
              />
              {searchQuery && (
                <button
                  type='button'
                  onClick={handleClearSearch}
                  className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-tertiary-token hover:bg-surface-1 hover:text-primary-token'
                  aria-label='Clear search'
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div
            id={listId}
            role='listbox'
            className='flex-1 overflow-y-auto overflow-x-hidden p-1.5 pt-0'
          >
            {isLoading ? (
              <div className='flex items-center justify-center py-8'>
                <Loader2 className='h-5 w-5 animate-spin text-tertiary-token' />
              </div>
            ) : !hasResults ? (
              <div className='py-8 text-center text-sm text-tertiary-token'>
                {emptyMessage}
              </div>
            ) : (
              filteredSections.map((section, sectionIndex) => (
                <div key={section.id}>
                  {sectionIndex > 0 && (
                    <div className={cn(MENU_SEPARATOR_BASE, 'my-1.5')} />
                  )}

                  <div className={cn(MENU_LABEL_BASE, 'mt-1.5')}>
                    {section.label}
                  </div>

                  {section.items.map(item => {
                    const currentIndex = globalIndex++;
                    const isHighlighted = currentIndex === highlightedIndex;

                    return (
                      <div
                        key={item.id}
                        id={`item-${item.id}`}
                        ref={setItemRef(currentIndex)}
                        role='option'
                        tabIndex={-1}
                        aria-selected={isHighlighted}
                        aria-disabled={item.disabled}
                        data-highlighted={isHighlighted || undefined}
                        data-disabled={item.disabled || undefined}
                        onClick={() => handleSelectItem(item)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectItem(item);
                          }
                        }}
                        onMouseEnter={() => setHighlightedIndex(currentIndex)}
                        className={cn(
                          MENU_ITEM_BASE,
                          'cursor-pointer',
                          item.disabled && 'pointer-events-none opacity-50'
                        )}
                      >
                        {item.icon && (
                          <span className='flex h-4 w-4 items-center justify-center text-tertiary-token'>
                            {item.icon}
                          </span>
                        )}
                        <div className='flex flex-1 flex-col gap-0.5'>
                          <span className='truncate'>{item.label}</span>
                          {item.description && (
                            <span className='truncate text-xs text-tertiary-token'>
                              {item.description}
                            </span>
                          )}
                        </div>
                        {item.badge && (
                          <span className='text-[10px] text-tertiary-token'>
                            {item.badge}
                          </span>
                        )}
                        {item.shortcut && (
                          <span className='ml-auto text-[10px] tracking-wider text-tertiary-token/70'>
                            {item.shortcut}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer (e.g., "Create Custom..." link) */}
          {footer && (
            <>
              <div className={cn(MENU_SEPARATOR_BASE, 'mx-1.5')} />
              <div className='p-1.5 pt-0'>{footer}</div>
            </>
          )}
        </DropdownMenuPrimitive.SubContent>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Sub>
  );
}

// ============================================================================
// SIMPLE SEARCHABLE LIST (non-submenu version)
// ============================================================================

export interface SearchableListProps {
  /** Items to display */
  items: SearchableSubmenuItem[];
  /** Callback when an item is selected */
  onSelect: (item: SearchableSubmenuItem) => void;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Empty state message when no results */
  emptyMessage?: string;
  /** Filter function */
  filterFn?: (item: SearchableSubmenuItem, query: string) => boolean;
  /** Optional header element */
  header?: React.ReactNode;
  /** Optional footer element */
  footer?: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * A standalone searchable list component (not a submenu)
 * Useful for embedding in popovers or modals
 */
export function SearchableList({
  items,
  onSelect,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  filterFn = defaultFilterFn,
  header,
  footer,
  className,
}: SearchableListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const filteredItems = useMemo(() => {
    return items.filter(item => filterFn(item, searchQuery));
  }, [items, searchQuery, filterFn]);

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredItems.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    const itemRef = itemRefs.current.get(highlightedIndex);
    if (itemRef) {
      itemRef.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev =>
            prev < filteredItems.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev =>
            prev > 0 ? prev - 1 : filteredItems.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          const item = filteredItems[highlightedIndex];
          if (item && !item.disabled) {
            onSelect(item);
          }
          break;
      }
    },
    [filteredItems, highlightedIndex, onSelect]
  );

  const setItemRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (el) {
        itemRefs.current.set(index, el);
      } else {
        itemRefs.current.delete(index);
      }
    },
    []
  );

  return (
    <div
      className={cn('flex flex-col', className)}
      role='listbox'
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {header}

      {/* Search Input */}
      <div className='relative p-2'>
        <Search className='absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary-token' />
        <input
          ref={searchInputRef}
          type='text'
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className={cn(
            'w-full rounded-lg border border-subtle bg-surface-2 py-2 pl-9 pr-3 text-sm',
            'text-primary-token placeholder:text-tertiary-token',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          )}
        />
      </div>

      {/* Items */}
      <div className='flex-1 overflow-y-auto p-1.5 pt-0'>
        {filteredItems.length === 0 ? (
          <div className='py-8 text-center text-sm text-tertiary-token'>
            {emptyMessage}
          </div>
        ) : (
          filteredItems.map((item, index) => (
            <div
              key={item.id}
              ref={setItemRef(index)}
              role='option'
              tabIndex={-1}
              aria-selected={index === highlightedIndex}
              aria-disabled={item.disabled}
              data-highlighted={index === highlightedIndex || undefined}
              data-disabled={item.disabled || undefined}
              onClick={() => !item.disabled && onSelect(item)}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ' ') && !item.disabled) {
                  e.preventDefault();
                  onSelect(item);
                }
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                MENU_ITEM_BASE,
                'cursor-pointer',
                item.disabled && 'pointer-events-none opacity-50'
              )}
            >
              {item.icon && (
                <span className='flex h-4 w-4 items-center justify-center text-tertiary-token'>
                  {item.icon}
                </span>
              )}
              <div className='flex flex-1 flex-col gap-0.5'>
                <span className='truncate'>{item.label}</span>
                {item.description && (
                  <span className='truncate text-xs text-tertiary-token'>
                    {item.description}
                  </span>
                )}
              </div>
              {item.badge && (
                <span className='text-[10px] text-tertiary-token'>
                  {item.badge}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {footer}
    </div>
  );
}

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
  MENU_BADGE_BASE,
  MENU_EMPTY_STATE_BASE,
  MENU_ITEM_BASE,
  MENU_ITEM_DESCRIPTION_BASE,
  MENU_LABEL_BASE,
  MENU_LEADING_SLOT_BASE,
  MENU_LOADING_STATE_BASE,
  MENU_SEARCH_CLEAR_BUTTON_BASE,
  MENU_SEARCH_HEADER_BASE,
  MENU_SEARCH_ICON_BASE,
  MENU_SEARCH_INPUT_BASE,
  MENU_SEPARATOR_BASE,
  MENU_SHORTCUT_BASE,
  searchableSubMenuContentClasses,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchableSubmenuItem {
  /** Unique identifier */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Optional description shown below label */
  readonly description?: string;
  /** Optional icon component */
  readonly icon?: React.ReactNode;
  /** Optional badge text (e.g., usage count) */
  readonly badge?: string;
  /** Optional keyboard shortcut hint */
  readonly shortcut?: string;
  /** Whether the item is disabled */
  readonly disabled?: boolean;
}

export interface SearchableSubmenuSection {
  /** Section identifier */
  readonly id: string;
  /** Section header label */
  readonly label: string;
  /** Items in this section */
  readonly items: SearchableSubmenuItem[];
}

export interface SearchableSubmenuProps {
  /** Custom trigger element (if not provided, uses triggerLabel + triggerIcon) */
  readonly trigger?: React.ReactNode;
  /** Trigger label for accessibility and default trigger */
  readonly triggerLabel: string;
  /** Optional trigger icon */
  readonly triggerIcon?: React.ReactNode;
  /** Sections to display (organized groups) */
  readonly sections: SearchableSubmenuSection[];
  /** Callback when an item is selected */
  readonly onSelect: (item: SearchableSubmenuItem) => void;
  /** Search placeholder text */
  readonly searchPlaceholder?: string;
  /** Empty state message when no results */
  readonly emptyMessage?: string;
  /** Loading state */
  readonly isLoading?: boolean;
  /** Filter function (if not provided, uses default label/description filter) */
  readonly filterFn?: (item: SearchableSubmenuItem, query: string) => boolean;
  /** Callback when search query changes */
  readonly onSearchChange?: (query: string) => void;
  /** Optional footer element (e.g., "Create Custom..." link) */
  readonly footer?: React.ReactNode;
  /** Additional className for the submenu content */
  readonly contentClassName?: string;
  /** Whether the submenu is disabled */
  readonly disabled?: boolean;
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
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
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
      itemRef.scrollIntoView({ block: 'nearest', behavior: 'auto' });
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
    (index: number) => (el: HTMLButtonElement | null) => {
      if (el) {
        itemRefs.current.set(index, el);
      } else {
        itemRefs.current.delete(index);
      }
    },
    []
  );

  // Build content classes
  const contentClasses = cn(searchableSubMenuContentClasses, contentClassName);

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
          <div className={MENU_SEARCH_HEADER_BASE}>
            <div className='relative'>
              <Search className={MENU_SEARCH_ICON_BASE} />
              <input
                ref={searchInputRef}
                id={searchId}
                type='text'
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={handleSearchChange}
                className={MENU_SEARCH_INPUT_BASE}
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
                  className={MENU_SEARCH_CLEAR_BUTTON_BASE}
                  aria-label='Clear search'
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </div>

          <select
            id={listId}
            className='sr-only'
            size={Math.min(flatItems.length, 8) || 1}
            aria-label={`${triggerLabel} results`}
            value={flatItems[highlightedIndex]?.id ?? ''}
            onChange={event => {
              const selectedItem = flatItems.find(
                item => item.id === event.target.value
              );
              if (selectedItem) {
                handleSelectItem(selectedItem);
              }
            }}
          >
            <option value='' disabled>
              Select an item
            </option>
            {filteredSections.map(section => (
              <optgroup key={section.id} label={section.label}>
                {section.items.map(item => (
                  <option key={item.id} id={`item-${item.id}`} value={item.id}>
                    {item.label}
                    {item.description ? ` — ${item.description}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Scrollable Content */}
          <div
            className='flex-1 overflow-y-auto overflow-x-hidden p-1.5 pt-0'
            aria-hidden='true'
          >
            {isLoading && (
              <div className={MENU_LOADING_STATE_BASE}>
                <Loader2 className='h-5 w-5 animate-spin text-tertiary-token' />
              </div>
            )}
            {!isLoading && !hasResults && (
              <div className={MENU_EMPTY_STATE_BASE}>{emptyMessage}</div>
            )}
            {!isLoading &&
              hasResults &&
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
                      <button
                        key={item.id}
                        ref={setItemRef(currentIndex)}
                        type='button'
                        tabIndex={-1}
                        data-highlighted={isHighlighted || undefined}
                        data-disabled={item.disabled || undefined}
                        onClick={() => handleSelectItem(item)}
                        onMouseEnter={() => setHighlightedIndex(currentIndex)}
                        disabled={item.disabled}
                        className={cn(
                          MENU_ITEM_BASE,
                          'cursor-pointer',
                          item.disabled && 'pointer-events-none opacity-50'
                        )}
                      >
                        {item.icon && (
                          <span className={MENU_LEADING_SLOT_BASE}>
                            {item.icon}
                          </span>
                        )}
                        <div className='flex flex-1 flex-col gap-0.5'>
                          <span className='truncate'>{item.label}</span>
                          {item.description && (
                            <span className={MENU_ITEM_DESCRIPTION_BASE}>
                              {item.description}
                            </span>
                          )}
                        </div>
                        {item.badge && (
                          <span className={MENU_BADGE_BASE}>{item.badge}</span>
                        )}
                        {item.shortcut && (
                          <span className={MENU_SHORTCUT_BASE}>
                            {item.shortcut}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
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
  readonly items: SearchableSubmenuItem[];
  /** Callback when an item is selected */
  readonly onSelect: (item: SearchableSubmenuItem) => void;
  /** Search placeholder text */
  readonly searchPlaceholder?: string;
  /** Empty state message when no results */
  readonly emptyMessage?: string;
  /** Filter function */
  readonly filterFn?: (item: SearchableSubmenuItem, query: string) => boolean;
  /** Optional header element */
  readonly header?: React.ReactNode;
  /** Optional footer element */
  readonly footer?: React.ReactNode;
  /** Additional className */
  readonly className?: string;
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
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const listId = useId();

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
      itemRef.scrollIntoView({ block: 'nearest', behavior: 'auto' });
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
        case 'Enter': {
          e.preventDefault();
          const item = filteredItems[highlightedIndex];
          if (item && !item.disabled) {
            onSelect(item);
          }
          break;
        }
      }
    },
    [filteredItems, highlightedIndex, onSelect]
  );

  const setItemRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      if (el) {
        itemRefs.current.set(index, el);
      } else {
        itemRefs.current.delete(index);
      }
    },
    []
  );

  return (
    <div className={cn('flex flex-col', className)} tabIndex={-1}>
      {header}

      {/* Search Input */}
      <div className={MENU_SEARCH_HEADER_BASE}>
        <div className='relative'>
          <Search className={MENU_SEARCH_ICON_BASE} />
          <input
            ref={searchInputRef}
            type='text'
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={MENU_SEARCH_INPUT_BASE}
          />
        </div>
      </div>

      <select
        id={listId}
        className='sr-only'
        size={Math.min(filteredItems.length, 8) || 1}
        aria-label='Search results'
        value={filteredItems[highlightedIndex]?.id ?? ''}
        onChange={event => {
          const selectedItem = filteredItems.find(
            item => item.id === event.target.value
          );
          if (selectedItem && !selectedItem.disabled) {
            onSelect(selectedItem);
          }
        }}
      >
        <option value='' disabled>
          Select an item
        </option>
        {filteredItems.map(item => (
          <option key={item.id} id={`item-${item.id}`} value={item.id}>
            {item.label}
            {item.description ? ` — ${item.description}` : ''}
          </option>
        ))}
      </select>

      {/* Items */}
      <div className='flex-1 overflow-y-auto p-1.5 pt-0' aria-hidden='true'>
        {filteredItems.length === 0 ? (
          <div className={MENU_EMPTY_STATE_BASE}>{emptyMessage}</div>
        ) : (
          filteredItems.map((item, index) => (
            <button
              key={item.id}
              ref={setItemRef(index)}
              data-highlighted={index === highlightedIndex || undefined}
              data-disabled={item.disabled || undefined}
              onClick={() => !item.disabled && onSelect(item)}
              onMouseEnter={() => setHighlightedIndex(index)}
              type='button'
              tabIndex={-1}
              disabled={item.disabled}
              className={cn(
                MENU_ITEM_BASE,
                'cursor-pointer',
                item.disabled && 'pointer-events-none opacity-50'
              )}
            >
              {item.icon && (
                <span className={MENU_LEADING_SLOT_BASE}>{item.icon}</span>
              )}
              <div className='flex flex-1 flex-col gap-0.5'>
                <span className='truncate'>{item.label}</span>
                {item.description && (
                  <span className={MENU_ITEM_DESCRIPTION_BASE}>
                    {item.description}
                  </span>
                )}
              </div>
              {item.badge && (
                <span className={MENU_BADGE_BASE}>{item.badge}</span>
              )}
            </button>
          ))
        )}
      </div>

      {footer}
    </div>
  );
}

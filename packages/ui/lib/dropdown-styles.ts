/**
 * Centralized dropdown/menu styling constants
 *
 * This module provides standardized styling for all dropdown-like components:
 * - DropdownMenu
 * - ContextMenu
 * - Popover
 * - Select
 * - CommonDropdown
 *
 * Size variants:
 * - default: Standard menus (user menu, bulk actions, notifications)
 *   Content padding: p-1, Item: px-2 py-1.5 text-[13px] leading-[20px]
 * - compact: Dense menus (table actions, context menus, sidebars)
 *   Content padding: p-0.5, Item: px-2 py-1 text-[12.5px] leading-[16px]
 *
 * Design tokens used:
 * - Border radius: rounded-lg (8px)
 * - Background: bg-surface-0 / dark:bg-surface-2 (elevated)
 * - Border: border-subtle (uses design token for both modes)
 * - Shadow: consistent across all variants
 * - Transition: duration-150 ease-out
 */

// ============================================================================
// ANIMATION CONSTANTS
// ============================================================================

/**
 * Base fade animations for open/close states
 */
export const DROPDOWN_TRANSITIONS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

/**
 * Slide-in animations based on dropdown position
 */
export const DROPDOWN_SLIDE_ANIMATIONS =
  'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 ' +
  'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';

// ============================================================================
// CONTENT (CONTAINER) STYLES
// ============================================================================

/**
 * Base styles for dropdown/popover content containers
 * Used by: DropdownMenuContent, ContextMenuContent, PopoverContent, SelectContent
 *
 * Border uses design token (--color-border-default) for consistency across themes
 */
export const DROPDOWN_CONTENT_BASE =
  'z-50 min-w-[10.5rem] overflow-hidden rounded-lg border border-subtle bg-surface-0 dark:bg-surface-2 p-1 text-primary-token';

/**
 * Shadow effect for elevated appearance
 */
export const DROPDOWN_SHADOW =
  'shadow-[0_4px_24px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)]';

/**
 * Transform origin for dropdown menus (Radix specific)
 */
export const DROPDOWN_TRANSFORM_ORIGIN =
  'origin-[--radix-dropdown-menu-content-transform-origin]';

/**
 * Transform origin for context menus (Radix specific)
 */
export const CONTEXT_TRANSFORM_ORIGIN =
  'origin-[--radix-context-menu-content-transform-origin]';

/**
 * Transform origin for select menus (Radix specific)
 */
export const SELECT_TRANSFORM_ORIGIN =
  'origin-[--radix-select-content-transform-origin]';

/**
 * Transform origin for popovers (Radix specific)
 */
export const POPOVER_TRANSFORM_ORIGIN =
  'origin-[--radix-popover-content-transform-origin]';

/**
 * Max height constraint for dropdown menu content (scrollable)
 */
export const DROPDOWN_MAX_HEIGHT =
  'max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overflow-x-hidden';

/**
 * Max height constraint for context menu content (scrollable)
 */
export const CONTEXT_MAX_HEIGHT =
  'max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto overflow-x-hidden';

/**
 * Max height constraint for select content (scrollable)
 */
export const SELECT_MAX_HEIGHT = 'max-h-96';

// ============================================================================
// FULL CONTENT CLASS COMPOSITIONS
// ============================================================================

/**
 * Complete DropdownMenu content classes
 */
export const dropdownMenuContentClasses = [
  DROPDOWN_CONTENT_BASE,
  DROPDOWN_MAX_HEIGHT,
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
  DROPDOWN_TRANSFORM_ORIGIN,
].join(' ');

/**
 * Complete ContextMenu content classes
 */
export const contextMenuContentClasses = [
  DROPDOWN_CONTENT_BASE,
  CONTEXT_MAX_HEIGHT,
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
  CONTEXT_TRANSFORM_ORIGIN,
].join(' ');

/**
 * Complete Popover content classes
 */
export const popoverContentClasses = [
  DROPDOWN_CONTENT_BASE,
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
  POPOVER_TRANSFORM_ORIGIN,
  // Motion reduce support
  'motion-reduce:transition-opacity motion-reduce:transform-none',
].join(' ');

/**
 * Complete Select content classes — unified with dropdown design
 */
export const selectContentClasses = [
  'relative',
  DROPDOWN_CONTENT_BASE,
  SELECT_MAX_HEIGHT,
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
  SELECT_TRANSFORM_ORIGIN,
].join(' ');

// ============================================================================
// MENU ITEM STYLES
// ============================================================================

/**
 * Base styles for all menu items (action items)
 * Used by: DropdownMenuItem, ContextMenuItem, SelectItem
 */
export const MENU_ITEM_BASE =
  'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium leading-[20px] outline-none ' +
  'transition-colors duration-150 ease-out ' +
  'text-primary-token hover:bg-interactive-hover hover:text-primary-token ' +
  'data-highlighted:bg-interactive-hover data-highlighted:text-primary-token ' +
  'data-disabled:pointer-events-none data-disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:bg-interactive-hover ' +
  '[&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-tertiary-token ' +
  'hover:[&_svg]:text-secondary-token data-highlighted:[&_svg]:text-secondary-token';

/**
 * Destructive variant for menu items (delete, remove actions)
 */
export const MENU_ITEM_DESTRUCTIVE =
  'text-destructive hover:text-destructive hover:bg-destructive/10 ' +
  'data-highlighted:text-destructive data-highlighted:bg-destructive/10 ' +
  'focus-visible:ring-destructive [&_svg]:text-destructive';

/**
 * Checkbox and radio item styles (with left indicator space)
 */
export const CHECKBOX_RADIO_ITEM_BASE =
  'relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-[13px] font-medium leading-[20px] outline-none ' +
  'transition-colors duration-150 ease-out ' +
  'text-primary-token hover:bg-interactive-hover hover:text-primary-token ' +
  'data-highlighted:bg-interactive-hover data-highlighted:text-primary-token ' +
  'data-disabled:pointer-events-none data-disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:bg-interactive-hover';

/**
 * Select item base — unified with MENU_ITEM_BASE hover/focus behavior
 */
export const SELECT_ITEM_BASE =
  'relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-[13px] font-medium leading-[20px] outline-none ' +
  'transition-colors duration-150 ease-out ' +
  'text-primary-token ' +
  'focus-visible:bg-interactive-hover focus-visible:text-primary-token ' +
  'data-highlighted:bg-interactive-hover data-highlighted:text-primary-token ' +
  'data-disabled:pointer-events-none data-disabled:opacity-50';

// ============================================================================
// COMPACT SIZE VARIANT (table actions, context menus, sidebar menus)
// ============================================================================

/**
 * Compact menu item — smaller padding & font for dense UIs (tables, sidebars)
 */
export const MENU_ITEM_COMPACT =
  'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-[12.5px] font-medium leading-[16px] outline-none ' +
  'transition-colors duration-150 ease-out ' +
  'text-primary-token hover:bg-interactive-hover hover:text-primary-token ' +
  'data-highlighted:bg-interactive-hover data-highlighted:text-primary-token ' +
  'data-disabled:pointer-events-none data-disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:bg-interactive-hover ' +
  '[&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-tertiary-token ' +
  'hover:[&_svg]:text-secondary-token data-highlighted:[&_svg]:text-secondary-token';

/**
 * Compact destructive variant
 */
export const MENU_ITEM_COMPACT_DESTRUCTIVE =
  'text-destructive hover:text-destructive hover:bg-destructive/10 ' +
  'data-highlighted:text-destructive data-highlighted:bg-destructive/10 ' +
  'focus-visible:ring-destructive [&_svg]:text-destructive';

// ============================================================================
// LABEL, SEPARATOR, AND SHORTCUT STYLES
// ============================================================================

/**
 * Menu label styles (group headers)
 */
export const MENU_LABEL_BASE =
  'px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-tertiary-token/80';

/**
 * Menu separator styles
 * Uses design token for border consistency
 */
export const MENU_SEPARATOR_BASE =
  '-mx-0.5 my-1 h-px bg-black/[0.06] dark:bg-white/[0.06]';

/**
 * Keyboard shortcut indicator styles
 */
export const MENU_SHORTCUT_BASE =
  'ml-auto text-[12px] tracking-normal text-neutral-500';

// ============================================================================
// TRIGGER STYLES
// ============================================================================

/**
 * Select trigger button styles
 */
export const SELECT_TRIGGER_BASE =
  'flex h-10 w-full items-center justify-between rounded-xl border border-subtle bg-surface-1 px-3 py-2 ' +
  'text-sm text-primary-token ' +
  'placeholder:text-tertiary-token ' +
  'focus-visible:outline-none focus-visible:border-interactive ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  '[&>span]:line-clamp-1';

// ============================================================================
// SUB-CONTENT STYLES
// ============================================================================

/**
 * Sub-menu content classes (no max-height constraint)
 */
export const subMenuContentClasses = [
  DROPDOWN_CONTENT_BASE,
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
].join(' ');

// ============================================================================
// COMPACT CONTENT CLASS COMPOSITIONS
// ============================================================================

/**
 * Compact base — same surface/border/animation but tighter padding
 */
export const DROPDOWN_CONTENT_COMPACT_BASE =
  'z-50 min-w-[10.5rem] overflow-hidden rounded-lg border border-subtle bg-surface-0 dark:bg-surface-2 p-0.5 text-primary-token';

/**
 * Complete compact DropdownMenu content classes
 */
export const dropdownMenuContentCompactClasses = [
  DROPDOWN_CONTENT_COMPACT_BASE,
  DROPDOWN_MAX_HEIGHT,
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
  DROPDOWN_TRANSFORM_ORIGIN,
].join(' ');

/**
 * Complete compact ContextMenu content classes
 */
export const contextMenuContentCompactClasses = [
  DROPDOWN_CONTENT_COMPACT_BASE,
  CONTEXT_MAX_HEIGHT,
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
  CONTEXT_TRANSFORM_ORIGIN,
].join(' ');

// ============================================================================
// VIEWPORT STYLES
// ============================================================================

/**
 * Select viewport padding
 */
export const SELECT_VIEWPORT_BASE = 'p-1';

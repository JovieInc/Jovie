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
 * - Border radius: rounded-(--linear-app-radius-menu) / rounded-(--linear-app-radius-item)
 * - Background: bg-(--linear-bg-surface-0) (elevated)
 * - Border: border-(--linear-border-default) (uses design token for both modes)
 * - Shadow: consistent across all variants
 * - Transition: duration-normal ease-interactive
 */

// ============================================================================
// ANIMATION CONSTANTS
// ============================================================================

/**
 * Base fade + subtle scale animations for open/close states (ease-interactive)
 */
export const DROPDOWN_TRANSITIONS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
  'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

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
 * Border uses --linear-border-default (slightly more opaque than --linear-border-subtle used by separators)
 */
export const DROPDOWN_CONTENT_BASE =
  'z-[70] min-w-[184px] overflow-hidden rounded-(--linear-app-radius-menu) border border-(--linear-border-default) bg-(--linear-bg-surface-0) p-0.5 text-(--linear-text-primary) shadow-(--linear-shadow-card-elevated)';

/**
 * Shadow effect for elevated appearance
 */
export const DROPDOWN_SHADOW = ''; // Now included directly in base for better composition

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
  'relative flex cursor-default select-none items-center gap-1.5 rounded-(--linear-app-radius-item) px-2 py-1 text-[12.5px] font-[400] leading-4 outline-none ' +
  'transition-colors duration-normal ease-interactive ' +
  'text-(--linear-text-secondary) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) ' +
  'data-[highlighted]:bg-(--linear-bg-surface-1) data-[highlighted]:text-(--linear-text-primary) ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-[0.46] ' +
  'focus-visible:outline-none focus-visible:bg-(--linear-bg-surface-1) ' +
  '[&_svg]:pointer-events-none [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0 [&_svg]:[stroke-width:1.5] [&_svg]:text-(--linear-text-tertiary) ' +
  'hover:[&_svg]:text-(--linear-text-primary) data-[highlighted]:[&_svg]:text-(--linear-text-primary)';

/**
 * Destructive variant for menu items (delete, remove actions)
 */
export const MENU_ITEM_DESTRUCTIVE =
  'text-(--linear-error) hover:text-(--linear-error) hover:bg-(--linear-error)/10 ' +
  'data-[highlighted]:text-(--linear-error) data-[highlighted]:bg-(--linear-error)/10 ' +
  'focus-visible:ring-(--linear-error) ' +
  '[&_svg]:text-(--linear-error) hover:[&_svg]:text-(--linear-error) data-[highlighted]:[&_svg]:text-(--linear-error)';

/**
 * Selected/active item state for menus with current choices
 */
export const MENU_ITEM_SELECTED =
  'bg-(--linear-bg-surface-1) text-(--linear-text-primary) [&_svg]:text-(--linear-text-primary)';

/**
 * Checkbox and radio item styles (with left indicator space)
 */
export const CHECKBOX_RADIO_ITEM_BASE =
  'relative flex cursor-default select-none items-center rounded-(--linear-app-radius-item) py-1 pl-7 pr-2 text-[12.5px] font-[400] leading-4 outline-none ' +
  'transition-colors duration-normal ease-interactive ' +
  'text-(--linear-text-secondary) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) ' +
  'data-[highlighted]:bg-(--linear-bg-surface-1) data-[highlighted]:text-(--linear-text-primary) ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-[0.46] ' +
  'focus-visible:outline-none focus-visible:bg-(--linear-bg-surface-1)';

/**
 * Select item base — unified with MENU_ITEM_BASE hover/focus behavior
 */
export const SELECT_ITEM_BASE =
  'relative flex w-full cursor-default select-none items-center rounded-(--linear-app-radius-item) py-1.5 pl-8 pr-2 text-[13px] font-[400] leading-5 outline-none ' +
  'transition-colors duration-normal ease-interactive ' +
  'text-(--linear-text-secondary) ' +
  'focus-visible:bg-(--linear-bg-surface-1) focus-visible:text-(--linear-text-primary) ' +
  'data-[highlighted]:bg-(--linear-bg-surface-1) data-[highlighted]:text-(--linear-text-primary) ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-[0.46]';

// ============================================================================
// COMPACT SIZE VARIANT (table actions, context menus, sidebar menus)
// ============================================================================

/**
 * Compact menu item — smaller padding & font for dense UIs (tables, sidebars)
 */
export const MENU_ITEM_COMPACT =
  'relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-(--linear-app-radius-item) px-2.5 py-1 text-[12.5px] font-[400] leading-4 outline-none ' +
  'transition-colors duration-normal ease-interactive ' +
  'text-(--linear-text-secondary) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) ' +
  'data-[highlighted]:bg-(--linear-bg-surface-1) data-[highlighted]:text-(--linear-text-primary) ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-[0.46] ' +
  'focus-visible:outline-none focus-visible:bg-(--linear-bg-surface-1) ' +
  '[&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:[stroke-width:1.5] [&_svg]:text-(--linear-text-tertiary) ' +
  'hover:[&_svg]:text-(--linear-text-primary) data-[highlighted]:[&_svg]:text-(--linear-text-primary)';

/**
 * @deprecated Use MENU_ITEM_DESTRUCTIVE instead — identical styles.
 */
export const MENU_ITEM_COMPACT_DESTRUCTIVE = MENU_ITEM_DESTRUCTIVE;

// ============================================================================
// LABEL, SEPARATOR, AND SHORTCUT STYLES
// ============================================================================

/**
 * Menu label styles (group headers)
 */
export const MENU_LABEL_BASE =
  'px-2 py-1 text-[11px] font-medium text-(--linear-text-tertiary)';

/**
 * Menu separator styles
 * Uses design token for border consistency
 */
export const MENU_SEPARATOR_BASE =
  '-mx-0.5 my-px h-px bg-(--linear-border-subtle)';

/**
 * Keyboard shortcut indicator styles
 */
export const MENU_SHORTCUT_BASE =
  'ml-auto text-[10.5px] font-medium text-(--linear-text-tertiary)';

/**
 * Shared leading/trailing slots for structured menu rows
 */
export const MENU_LEADING_SLOT_BASE =
  'flex h-4 w-4 shrink-0 items-center justify-center text-(--linear-text-tertiary)';

export const MENU_TRAILING_SLOT_BASE =
  'ml-auto inline-flex min-w-4 shrink-0 items-center justify-end gap-1 text-(--linear-text-tertiary)';

/**
 * Secondary line inside a structured menu row
 */
export const MENU_ITEM_DESCRIPTION_BASE =
  'truncate text-[11px] leading-3 text-(--linear-text-tertiary)';

/**
 * Small count/status badge used in menu rows
 */
export const MENU_BADGE_BASE =
  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-(--linear-app-radius-item) border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-1.5 text-[10.5px] font-medium tabular-nums text-(--linear-text-tertiary)';

/**
 * Search header and input styles shared by root menus and searchable submenus
 */
export const MENU_SEARCH_HEADER_BASE =
  'border-b border-(--linear-border-subtle) px-2 py-2';

export const MENU_SEARCH_INPUT_BASE =
  'h-7 w-full rounded-(--linear-app-radius-item) border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) py-1 pl-7 pr-7 text-[12px] text-(--linear-text-primary) placeholder:text-(--linear-text-tertiary) focus-visible:outline-none focus-visible:border-(--linear-border-focus)';

/**
 * Empty and loading states inside menu surfaces
 */
export const MENU_EMPTY_STATE_BASE =
  'px-3 py-6 text-center text-[12px] text-(--linear-text-tertiary)';

export const MENU_LOADING_STATE_BASE =
  'flex items-center justify-center px-3 py-6 text-(--linear-text-tertiary)';

// ============================================================================
// TRIGGER STYLES
// ============================================================================

/**
 * Select trigger button styles
 */
export const SELECT_TRIGGER_BASE =
  'flex h-8 w-full items-center justify-between rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 py-1.5 ' +
  'text-[13px] font-[400] tracking-[-0.011em] text-(--linear-text-primary) ' +
  'placeholder:text-(--linear-text-tertiary) ' +
  'transition-colors duration-normal ' +
  'hover:border-(--linear-border-default) ' +
  'focus-visible:outline-none focus-visible:border-(--color-accent) ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  '[&>span]:line-clamp-1';

// ============================================================================
// SUB-CONTENT STYLES
// ============================================================================

/**
 * Sub-menu content classes.
 * Supports both DropdownMenu.SubContent and ContextMenu.SubContent Radix vars.
 */
export const subMenuContentClasses = [
  DROPDOWN_CONTENT_BASE,
  'max-h-[min(var(--radix-dropdown-menu-content-available-height,var(--radix-context-menu-content-available-height,320px)),320px)] overflow-y-auto overflow-x-hidden',
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
].join(' ');

// ============================================================================
// COMPACT CONTENT CLASS COMPOSITIONS
// ============================================================================

/**
 * Compact base — currently equivalent to DROPDOWN_CONTENT_BASE; retained for future divergence
 */
export const DROPDOWN_CONTENT_COMPACT_BASE =
  'z-[70] min-w-[184px] overflow-hidden rounded-(--linear-app-radius-menu) border border-(--linear-border-default) bg-(--linear-bg-surface-0) p-0.5 text-(--linear-text-primary) shadow-(--linear-shadow-card-elevated)';

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

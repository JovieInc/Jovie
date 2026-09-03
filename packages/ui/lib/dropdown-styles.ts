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
 *   Content padding: p-1, Item: px-2.5 py-1.5 text-app leading-5
 * - compact: Dense menus (table actions, context menus, sidebars)
 *   Content padding: p-0.5, Item: px-2.5 py-1 text-xs leading-4
 *
 * Design tokens used:
 * - Border radius: concentric overlay surfaces/rows, rounded-full triggers
 * - Background: bg-surface-elevated (floating menus/popovers; shell remaps
 *   under [data-app-shell-frame] for Noir Ion D)
 * - Border: border-default (uses design token for both modes)
 * - Shadow: consistent across all variants
 * - Transition: duration-fast ease-interactive
 */

// ============================================================================
// ANIMATION CONSTANTS
// ============================================================================

/**
 * Base opacity-only animations for open/close states.
 */
export const DROPDOWN_TRANSITIONS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
  'motion-reduce:animate-none motion-reduce:data-[state=closed]:animate-none';

/**
 * @deprecated Positional slide/zoom motion is intentionally disabled.
 */
export const DROPDOWN_SLIDE_ANIMATIONS = '';

/** Default gap between a floating surface and its trigger/anchor. */
export const OVERLAY_SIDE_OFFSET = 4;

/** Viewport breathing room shared by all collision-aware floating surfaces. */
export const OVERLAY_COLLISION_PADDING = 8;

// ============================================================================
// CONTENT (CONTAINER) STYLES
// ============================================================================

/**
 * Base styles for dropdown/popover content containers
 * Used by: DropdownMenuContent, ContextMenuContent, PopoverContent, SelectContent
 *
 * Border uses --color-border-default (slightly more opaque than --color-border-subtle used by separators)
 * Background uses --color-bg-elevated so overlays lift above recessed wells/content.
 */
export const OVERLAY_SURFACE_BASE =
  'border border-default bg-surface-elevated text-primary-token shadow-popover';

/**
 * Tooltip surface — floating elevation (shell remaps --color-bg-tooltip).
 * Radius rules stay on the component (compact pill vs rich rectangle).
 */
export const TOOLTIP_SURFACE_BASE =
  'border border-default bg-surface-tooltip text-primary-token shadow-popover';

/**
 * The shared rounded rectangle used by wrapped overlay content.
 */
export const OVERLAY_CONTENT_RADIUS = 'rounded-(--system-b-radius-overlay)';

/**
 * Rows inset by the overlay's `p-1` use the matching inner radius so their
 * corner arc shares the overlay's center.
 */
export const OVERLAY_ITEM_RADIUS = 'rounded-(--system-b-radius-overlay-inner)';

/** Shared keyboard-focus treatment kept inside the concentric row radius. */
export const OVERLAY_ITEM_FOCUS =
  'focus-visible:outline-none focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus/35';

/** Shared disabled affordance for Radix menu/select rows. */
const MENU_ITEM_DISABLED_STATE =
  'data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

export const DROPDOWN_CONTENT_BASE = `z-50 min-w-48 overflow-hidden ${OVERLAY_CONTENT_RADIUS} ${OVERLAY_SURFACE_BASE} p-1`;

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
export const DROPDOWN_MAX_HEIGHT = 'max-h-96 overflow-y-auto overflow-x-hidden';

/**
 * Max height constraint for context menu content (scrollable)
 */
export const CONTEXT_MAX_HEIGHT = 'max-h-96 overflow-y-auto overflow-x-hidden';

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
 * Destructive variant for menu items (delete, remove actions)
 */
export const MENU_ITEM_DESTRUCTIVE =
  'text-error hover:text-error hover:bg-error-subtle ' +
  'data-[highlighted]:text-error data-[highlighted]:bg-error-subtle ' +
  'focus-visible:ring-error ' +
  '[&_svg]:text-error hover:[&_svg]:text-error data-[highlighted]:[&_svg]:text-error';

/**
 * Selected/active item state for menus with current choices
 */
export const MENU_ITEM_SELECTED =
  'bg-surface-1 text-primary-token [&_svg]:text-primary-token';

const MENU_ITEM_SELECTED_STATE =
  'data-[selected=true]:bg-surface-1 data-[selected=true]:text-primary-token data-[selected=true]:[&_svg]:text-primary-token ' +
  'data-[state=checked]:bg-surface-1 data-[state=checked]:text-primary-token data-[state=checked]:[&_svg]:text-primary-token';

const MENU_ROW_INTERACTION_STATES = `${MENU_ITEM_SELECTED_STATE} ${MENU_ITEM_DISABLED_STATE}`;

/**
 * Base styles for all menu items (action items)
 * Used by: DropdownMenuItem, ContextMenuItem, SelectItem
 */
export const MENU_ITEM_BASE =
  `relative flex min-h-8 cursor-default select-none items-center gap-2 ${OVERLAY_ITEM_RADIUS} px-2.5 py-1.5 text-app font-normal leading-5 outline-none ` +
  'transition-colors duration-fast ease-interactive ' +
  'text-secondary-token hover:bg-surface-1 hover:text-primary-token ' +
  'data-[highlighted]:bg-surface-1 data-[highlighted]:text-primary-token ' +
  `${MENU_ROW_INTERACTION_STATES} ` +
  `${OVERLAY_ITEM_FOCUS} ` +
  '[&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-tertiary-token ' +
  'hover:[&_svg]:text-primary-token data-[highlighted]:[&_svg]:text-primary-token';

/**
 * Checkbox and radio item styles (with left indicator space)
 */
export const CHECKBOX_RADIO_ITEM_BASE =
  `relative flex min-h-8 cursor-default select-none items-center ${OVERLAY_ITEM_RADIUS} py-1 pl-7 pr-2 text-xs font-normal leading-4 outline-none ` +
  'transition-colors duration-fast ease-interactive ' +
  'text-secondary-token hover:bg-surface-1 hover:text-primary-token ' +
  'data-[highlighted]:bg-surface-1 data-[highlighted]:text-primary-token ' +
  `${MENU_ROW_INTERACTION_STATES} ` +
  OVERLAY_ITEM_FOCUS;

/**
 * Select item base — unified with MENU_ITEM_BASE hover/focus behavior
 */
export const SELECT_ITEM_BASE =
  `relative flex min-h-8 w-full cursor-default select-none items-center ${OVERLAY_ITEM_RADIUS} py-1.5 pl-8 pr-2 text-app font-normal leading-5 outline-none ` +
  'transition-colors duration-fast ease-interactive ' +
  'text-secondary-token ' +
  `${OVERLAY_ITEM_FOCUS} focus-visible:text-primary-token ` +
  'data-[highlighted]:bg-surface-1 data-[highlighted]:text-primary-token ' +
  MENU_ROW_INTERACTION_STATES;

// ============================================================================
// COMPACT SIZE VARIANT (table actions, context menus, sidebar menus)
// ============================================================================

/**
 * Compact menu item — smaller padding & font for dense UIs (tables, sidebars)
 */
export const MENU_ITEM_COMPACT =
  `relative flex min-h-8 cursor-default select-none items-center gap-2 ${OVERLAY_ITEM_RADIUS} px-2.5 py-1 text-xs font-normal leading-4 outline-none ` +
  'transition-colors duration-fast ease-interactive ' +
  'text-secondary-token hover:bg-surface-1 hover:text-primary-token ' +
  'data-[highlighted]:bg-surface-1 data-[highlighted]:text-primary-token ' +
  `${MENU_ROW_INTERACTION_STATES} ` +
  `${OVERLAY_ITEM_FOCUS} ` +
  '[&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-tertiary-token ' +
  'hover:[&_svg]:text-primary-token data-[highlighted]:[&_svg]:text-primary-token';

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
  'px-2.5 pb-1 pt-1.5 text-2xs font-medium text-tertiary-token';

/**
 * Menu separator styles
 * Uses design token for border consistency
 */
export const MENU_SEPARATOR_BASE = '-mx-1 my-1 h-px border-t border-subtle';

/**
 * Keyboard shortcut indicator styles
 */
export const MENU_SHORTCUT_BASE =
  'ml-auto text-3xs font-medium text-tertiary-token';

/**
 * Shared leading/trailing slots for structured menu rows
 */
export const MENU_LEADING_SLOT_BASE =
  'flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token';

export const MENU_TRAILING_SLOT_BASE =
  'ml-auto inline-flex min-w-4 shrink-0 items-center justify-end gap-1 text-tertiary-token';

/**
 * Secondary line inside a structured menu row
 */
export const MENU_ITEM_DESCRIPTION_BASE =
  'truncate text-2xs leading-3 text-tertiary-token';

/**
 * Small count/status badge used in menu rows
 */
export const MENU_BADGE_BASE =
  'inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-subtle bg-surface-1 px-1.5 text-3xs font-medium tabular-nums text-tertiary-token';

/**
 * Search header and input styles shared by root menus and searchable submenus
 */
export const MENU_SEARCH_HEADER_BASE = 'border-b border-subtle px-2 py-2';

export const MENU_SEARCH_ICON_BASE =
  'pointer-events-none absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-tertiary-token';

export const MENU_SEARCH_INPUT_BASE =
  'h-7 w-full rounded-full border border-subtle bg-surface-1 py-1 pl-7 pr-7 text-xs text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25';

export const MENU_SEARCH_CLEAR_BUTTON_BASE =
  'absolute inset-y-0 right-1.5 my-auto inline-flex h-4 w-4 items-center justify-center rounded-full text-tertiary-token transition-colors duration-fast ease-interactive hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:bg-surface-2 focus-visible:ring-1 focus-visible:ring-focus/35';

/**
 * Empty and loading states inside menu surfaces
 */
export const MENU_EMPTY_STATE_BASE =
  'px-3 py-6 text-center text-xs text-tertiary-token';

export const MENU_LOADING_STATE_BASE =
  'flex items-center justify-center px-3 py-6 text-tertiary-token';

// ============================================================================
// TRIGGER STYLES
// ============================================================================

/**
 * Select trigger button styles
 */
export const SELECT_TRIGGER_BASE =
  'flex h-8 w-full items-center justify-between rounded-full border border-subtle bg-surface-1 px-3 py-1.5 ' +
  'text-app font-normal tracking-normal text-primary-token ' +
  'placeholder:text-tertiary-token ' +
  'transition-colors duration-fast ' +
  'hover:border-default ' +
  'focus-visible:outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  '[&>span]:line-clamp-1';

/**
 * Icon-only action trigger for menu controls.
 */
export const MENU_ICON_TRIGGER_BASE =
  'inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent bg-transparent text-tertiary-token transition-colors duration-fast ease-interactive hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-focus/50';

// ============================================================================
// SUB-CONTENT STYLES
// ============================================================================

/**
 * Sub-menu content classes.
 * Supports both DropdownMenu.SubContent and ContextMenu.SubContent Radix vars.
 */
export const subMenuContentClasses = [
  DROPDOWN_CONTENT_BASE,
  'max-h-96 overflow-y-auto overflow-x-hidden',
  DROPDOWN_SHADOW,
  DROPDOWN_TRANSITIONS,
  DROPDOWN_SLIDE_ANIMATIONS,
].join(' ');

/**
 * Searchable submenu content classes.
 * Keeps the search header fixed while the result body scrolls.
 */
export const searchableSubMenuContentClasses = [
  DROPDOWN_CONTENT_BASE,
  'flex max-h-96 min-w-72 max-w-xs flex-col overflow-hidden',
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
  'z-50 min-w-48 overflow-hidden rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-0.5 text-primary-token shadow-popover';

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

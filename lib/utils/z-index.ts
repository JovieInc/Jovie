/**
 * Centralized z-index scale for Jovie dashboard
 *
 * Usage:
 * - Import: `import { zIndex } from '@/lib/utils/z-index'`
 * - Apply: `className={cn('fixed', zIndex.sticky)}`
 *
 * Prevents stacking context conflicts by providing a consistent layering system.
 *
 * @see CLAUDE.md - Component Architecture guidelines
 */

export const zIndex = {
  /** Base layer (z-0) - default stacking context */
  base: 'z-0',

  /** Dropdown menus, select options (z-10) */
  dropdown: 'z-10',

  /** Sticky headers, floating toolbars (z-20) */
  sticky: 'z-20',

  /** Modal dialogs, drawer overlays (z-30) */
  modal: 'z-30',

  /** Popovers, context menus (z-40) */
  popover: 'z-40',

  /** Tooltips, toasts (z-50) */
  tooltip: 'z-50',
} as const;

/**
 * Numeric z-index values for style objects
 * Use these when you need inline styles or CSS-in-JS
 */
export const zIndexNumeric = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  modal: 30,
  popover: 40,
  tooltip: 50,
} as const;

export type ZIndexLayer = keyof typeof zIndex;

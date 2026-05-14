/**
 * Shared key → action mapping for all table keyboard navigation.
 *
 * Single source of truth so that every table (UnifiedTable rows,
 * admin container-level nav, global listeners) responds to the
 * exact same keystrokes.
 */

import { isFormElement } from '@/lib/utils/keyboard';

export { isFormElement } from '@/lib/utils/keyboard';

export type TableNavAction =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'activate'
  | 'toggle'
  | 'close'
  | null;

/**
 * Maps a keyboard event key to a table navigation action.
 * Returns null if the key should be ignored.
 *
 * All navigation keys return null when target is a form element
 * so they don't conflict with typing in search inputs.
 * Escape is always available for closing drawers/panels.
 */
export function resolveTableNavAction(
  key: string,
  target: EventTarget | null
): TableNavAction {
  if (key === 'Escape') return 'close';

  if (isFormElement(target)) return null;

  switch (key) {
    case 'ArrowDown':
    case 'j':
      return 'next';
    case 'ArrowUp':
    case 'k':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Enter':
      return 'activate';
    case ' ':
    case 'Spacebar':
      return 'toggle';
    default:
      return null;
  }
}

/**
 * True when the event target is inside an overlay surface that owns its own
 * keyboard navigation — Radix dropdown menu, popover, dialog, alert dialog,
 * combobox listbox, etc. Ambient list-level J/K/Arrow handlers should bail
 * out when this returns true so they don't steal keys from the overlay.
 *
 * Form elements are intentionally NOT included here; callers can compose
 * with `isFormElement` if they need to suppress for inputs as well.
 */
export function isInteractiveOverlayTarget(
  target: EventTarget | null
): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="menubar"]',
        '[role="combobox"][aria-expanded="true"]',
        '[data-radix-popper-content-wrapper]',
        '[data-radix-menu-content]',
        '[data-radix-popover-content]',
        '[data-radix-dialog-content]',
        '[data-radix-alert-dialog-content]',
      ].join(', ')
    )
  );
}

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

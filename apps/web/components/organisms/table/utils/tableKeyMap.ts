/**
 * Shared key → action mapping for all table keyboard navigation.
 *
 * Single source of truth so that every table (UnifiedTable rows,
 * admin container-level nav, global listeners) responds to the
 * exact same keystrokes.
 */

import { isFormElement } from '@/lib/utils/keyboard';

export { isFormElement };

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
 * j/k return null when target is a form element so they
 * don't conflict with typing in search inputs.
 */
export function resolveTableNavAction(
  key: string,
  target: EventTarget | null
): TableNavAction {
  switch (key) {
    case 'ArrowDown':
      return 'next';
    case 'ArrowUp':
      return 'prev';
    case 'j':
      return isFormElement(target) ? null : 'next';
    case 'k':
      return isFormElement(target) ? null : 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Enter':
      return 'activate';
    case ' ':
    case 'Spacebar':
      return 'toggle';
    case 'Escape':
      return 'close';
    default:
      return null;
  }
}

/**
 * Arrow-key roving for the left navigation (flyout and pinned alike).
 * Pure so the key map is unit-testable; the DOM adapter below only collects
 * focusable rows. Tab order is untouched: arrows are an accelerator.
 */
export type SidebarNavKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function nextSidebarNavIndex(
  count: number,
  current: number,
  key: string
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : Math.min(count - 1, current + 1);
    case 'ArrowUp':
      return current < 0 ? count - 1 : Math.max(0, current - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

const NAV_ROW_SELECTOR =
  'nav a[href], nav button:not([disabled]), [role="menuitem"]:not([aria-disabled="true"])';

/** Move focus within the sidebar nav rows; returns true when it handled the key. */
export function moveSidebarNavFocus(
  root: HTMLElement,
  event: Pick<
    KeyboardEvent,
    'key' | 'target' | 'altKey' | 'metaKey' | 'ctrlKey'
  >
): boolean {
  if (event.altKey || event.metaKey || event.ctrlKey) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  // Text fields and open menus own their arrows.
  if (
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="menu"]'
    )
  )
    return false;
  const rows = Array.from(
    root.querySelectorAll<HTMLElement>(NAV_ROW_SELECTOR)
  ).filter(row => !row.closest('[hidden], [inert], [aria-hidden="true"]'));
  const current = rows.findIndex(row => row === target || row.contains(target));
  if (current < 0) return false;
  const next = nextSidebarNavIndex(rows.length, current, event.key);
  if (next === null) return false;
  rows[next]?.focus();
  return true;
}

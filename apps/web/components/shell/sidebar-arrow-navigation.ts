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

const NAV_ROW_SELECTOR = 'nav a, nav button';

type NavKeyEvent = {
  readonly key: string;
  readonly target: EventTarget | null;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
};

function hasAncestor(
  element: HTMLElement,
  test: (node: HTMLElement) => boolean
) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement)
    if (test(node)) return true;
  return false;
}

const isHiddenFromNav = (node: HTMLElement) =>
  Boolean(node.hidden) ||
  node.hasAttribute('inert') ||
  node.getAttribute('aria-hidden') === 'true';

const ownsArrows = (node: HTMLElement) =>
  node.isContentEditable ||
  node.tagName === 'INPUT' ||
  node.tagName === 'TEXTAREA' ||
  node.tagName === 'SELECT' ||
  node.getAttribute('role') === 'menu';

const isNavRow = (row: HTMLElement) =>
  (row instanceof HTMLButtonElement
    ? !row.disabled
    : row.hasAttribute('href')) && !hasAncestor(row, isHiddenFromNav);

/** Move focus within the sidebar nav rows; returns true when it handled the key. */
export function moveSidebarNavFocus(
  root: HTMLElement,
  event: NavKeyEvent
): boolean {
  if (event.altKey || event.metaKey || event.ctrlKey) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  // Text fields and open menus own their arrows.
  if (hasAncestor(target, ownsArrows)) return false;
  const rows = Array.from(
    root.querySelectorAll<HTMLElement>(NAV_ROW_SELECTOR)
  ).filter(isNavRow);
  const current = rows.findIndex(row => row === target || row.contains(target));
  if (current < 0) return false;
  const next = nextSidebarNavIndex(rows.length, current, event.key);
  if (next === null) return false;
  rows[next]?.focus();
  return true;
}

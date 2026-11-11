import type { DogfoodSample } from './dogfood-scanners';

/** Read-only browser adapter. Call inside page.evaluate; it never navigates or sends chat.
 * The caller supplies the expected route label from its existing route registry.
 * Hidden subtrees, scripts, and editable content are excluded from visible copy.
 */
export function collectDogfoodDocument(input: {
  readonly id: string;
  readonly navLabel: string;
  readonly brand: string;
}): DogfoodSample {
  const visible = (element: Element) => {
    if (element.closest('script, style, [hidden], [aria-hidden="true"]'))
      return false;
    let current: Element | null = element;
    while (current) {
      const style = getComputedStyle(current);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      )
        return false;
      current = current.parentElement;
    }
    return element.getClientRects().length > 0;
  };
  const elements = (selector: string) =>
    [...document.querySelectorAll(selector)].filter(visible);
  const visibleCopy = (element: Element) =>
    visible(element) &&
    !element.closest('input, textarea, [contenteditable="true"]');
  const text = (element: Element): string => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement && visibleCopy(node.parentElement))
        parts.push(node.textContent ?? '');
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const visibleText: string[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      node.parentElement &&
      visibleCopy(node.parentElement) &&
      node.textContent?.trim()
    )
      visibleText.push(node.textContent.trim());
  }
  const buttons = elements('button, [role="button"]');
  return {
    id: input.id,
    source: location.pathname,
    visibleText,
    route: {
      navLabel: input.navLabel,
      heading: elements('h1')[0] ? text(elements('h1')[0]) : '',
      documentTitle: document.title,
      brand: input.brand,
    },
    buttons: buttons.map(button => ({
      text: text(button),
      height: button.getBoundingClientRect().height,
    })),
    labels: elements('h1, h2, h3, button, [role="button"], th').map(
      element => ({ text: text(element), casing: 'title' })
    ),
    columns: elements('table').flatMap(table => {
      const rows = [...table.querySelectorAll('tbody tr')].filter(visible);
      return [...table.querySelectorAll('thead th')]
        .filter(visible)
        .map(header => {
          const index = (header as HTMLTableCellElement).cellIndex;
          return {
            name: text(header),
            cells: rows.map(row => {
              const cell = (row as HTMLTableRowElement).cells[index];
              // An icon-only action is meaningful data, not an empty schema slot.
              return cell &&
                [
                  ...cell.querySelectorAll(
                    'button, a, input, select, [role="button"]'
                  ),
                ].some(visible)
                ? 'interactive'
                : cell
                  ? text(cell)
                  : null;
            }),
          };
        });
    }),
  };
}

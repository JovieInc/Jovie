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
    return (
      getComputedStyle(element).display === 'contents' ||
      element.getClientRects().length > 0
    );
  };
  const editable = (element: Element): boolean => {
    if (document.designMode?.toLowerCase() === 'on') return true;
    // Keep even non-editable widgets inside an editor private. The attribute
    // fallback also supports DOM test environments without isContentEditable.
    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    ) {
      if (current instanceof HTMLElement && current.isContentEditable)
        return true;
      const value = current.getAttribute('contenteditable')?.toLowerCase();
      if (value === '' || value === 'true' || value === 'plaintext-only')
        return true;
    }
    return false;
  };
  const visibleCopy = (element: Element) =>
    visible(element) &&
    !element.closest('input, textarea') &&
    !editable(element);
  const elements = (selector: string) =>
    [...document.querySelectorAll(selector)].filter(visibleCopy);
  const observations = (root: Element): string[] => {
    const result: string[] = [];
    let run = '';
    const flush = () => {
      const value = run.replace(/\s+/g, ' ').trim();
      if (value) result.push(value);
      run = '';
    };
    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        run += node.textContent ?? '';
        return;
      }
      if (!(node instanceof Element)) return;
      if (!visibleCopy(node)) {
        flush();
        return;
      }
      const display = getComputedStyle(node).display;
      // Inline spans share one observation, preserving the original whitespace.
      // Blocks, atomic inline boxes and explicit breaks delimit observations.
      const boundary =
        node.tagName === 'BR' ||
        (display !== '' && display !== 'inline' && display !== 'contents');
      if (boundary) flush();
      for (const child of node.childNodes) visit(child);
      if (boundary) flush();
    };
    visit(root);
    flush();
    return result;
  };
  const text = (element: Element): string => observations(element).join(' ');
  const visibleText = observations(document.body);
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

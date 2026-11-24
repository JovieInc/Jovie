import type { Page } from '@playwright/test';

export interface ColumnGapViolation {
  readonly code: 'large_column_gap';
  readonly detail: string;
}

/**
 * Empty space inside one narrow column. The page-wide gap check in
 * viewport-sweep-audit.ts measures bands across the whole viewport, so a tall
 * neighbouring column (the desktop hero card) hides a column whose rows were
 * stretched apart: on jov.ie/tim at 1440 the side rail split Get updates from
 * Pay by about 280px and no check noticed. Here the same band check runs
 * inside every grid or flex container narrower than 60% of the viewport (a
 * column, not the page), over the content blocks that container holds.
 */
export async function auditColumnGaps(
  page: Page,
  maxGapPx = 160
): Promise<readonly ColumnGapViolation[]> {
  return page.evaluate(maxGap => {
    const violations: ColumnGapViolation[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const describe = (element: Element) => {
      const testId = element.getAttribute('data-testid');
      return testId
        ? `[data-testid=${testId}]`
        : `<${element.tagName.toLowerCase()}> "${(element.textContent || '').trim().slice(0, 40)}"`;
    };
    const shown = (element: Element): boolean => {
      for (
        let current: Element | null = element;
        current && current !== document.documentElement;
        current = current.parentElement
      ) {
        const style = getComputedStyle(current);
        if (
          current.getAttribute('aria-hidden') === 'true' ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number.parseFloat(style.opacity || '1') < 0.02 ||
          style.position === 'fixed' ||
          style.position === 'sticky'
        ) {
          return false;
        }
      }
      return true;
    };
    const blocks = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter(element => {
        const ownText = Array.from(element.childNodes).some(
          node => node.nodeType === 3 && (node.textContent || '').trim() !== ''
        );
        const media = ['IMG', 'VIDEO', 'CANVAS', 'BUTTON', 'INPUT'].includes(
          element.tagName.toUpperCase()
        );
        return (ownText || media) && shown(element);
      })
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(
        ({ rect }) =>
          rect.width > 1 &&
          rect.height > 1 &&
          rect.bottom > 0 &&
          rect.top < vh &&
          rect.right > 0 &&
          rect.left < vw
      )
      .sort((a, b) => a.rect.top - b.rect.top);

    const columnMaxWidth = vw * 0.6;
    const columns = Array.from(
      document.querySelectorAll<HTMLElement>('body *')
    ).filter(column => {
      if (column.children.length < 2 || !shown(column)) return false;
      if (!/grid|flex/.test(getComputedStyle(column).display)) return false;
      const width = column.getBoundingClientRect().width;
      return width > 0 && width <= columnMaxWidth;
    });
    // A pinned bar outside the column's scroller (the compact tab bar) is
    // chrome: blocks are only compared with blocks in the same scroller.
    const scrollerOf = (element: Element): Element | null => {
      for (
        let current = element.parentElement;
        current && current !== document.body;
        current = current.parentElement
      ) {
        const overflowY = getComputedStyle(current).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return current;
      }
      return null;
    };
    const reported = new Set<Element>();
    for (const column of columns) {
      const groups = new Map<Element | null, typeof blocks>();
      for (const block of blocks) {
        if (!column.contains(block.element)) continue;
        const key = scrollerOf(block.element);
        groups.set(key, [...(groups.get(key) ?? []), block]);
      }
      for (const inside of groups.values()) {
        if (inside.length < 2) continue;
        let covered = inside[0].rect.bottom;
        let coveredBy = inside[0].element;
        for (const { element, rect } of inside.slice(1)) {
          const gap = rect.top - covered;
          if (gap > maxGap && !reported.has(element)) {
            reported.add(element);
            violations.push({
              code: 'large_column_gap',
              detail: `${Math.round(gap)}px of empty space inside ${describe(column)} between ${describe(coveredBy)} (bottom y=${Math.round(covered)}) and ${describe(element)} (top y=${Math.round(rect.top)}) (max ${maxGap}px)`,
            });
          }
          if (rect.bottom > covered) {
            covered = rect.bottom;
            coveredBy = element;
          }
        }
      }
    }
    return violations;
  }, maxGapPx);
}

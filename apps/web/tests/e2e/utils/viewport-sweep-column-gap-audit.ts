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
 * Pay by about 280px and no check noticed. Here every content block is
 * measured against the content above it that it overlaps horizontally, and a
 * gap is reported when both sit in the same grid or flex container narrower
 * than 60% of the viewport (a column, not the page).
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
    for (const [index, { element, rect }] of blocks.entries()) {
      let above: (typeof blocks)[number] | null = null;
      for (const candidate of blocks.slice(0, index)) {
        const overlap =
          Math.min(candidate.rect.right, rect.right) -
          Math.max(candidate.rect.left, rect.left);
        if (overlap <= 8 || candidate.rect.top >= rect.top) continue;
        if (!above || candidate.rect.bottom > above.rect.bottom) {
          above = candidate;
        }
      }
      if (!above) continue;
      const gap = rect.top - above.rect.bottom;
      if (gap <= maxGap) continue;
      let column: Element | null = above.element.parentElement;
      while (column && !column.contains(element)) {
        column = column.parentElement;
      }
      if (!column) continue;
      if (
        column.getBoundingClientRect().width > columnMaxWidth ||
        !/grid|flex/.test(getComputedStyle(column).display)
      ) {
        continue;
      }
      violations.push({
        code: 'large_column_gap',
        detail: `${Math.round(gap)}px of empty space inside ${describe(column)} between ${describe(above.element)} (bottom y=${Math.round(above.rect.bottom)}) and ${describe(element)} (top y=${Math.round(rect.top)}) (max ${maxGap}px)`,
      });
    }
    return violations;
  }, maxGapPx);
}

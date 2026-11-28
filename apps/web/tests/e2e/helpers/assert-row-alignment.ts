import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Geometric row-alignment gate (JOV-14762).
 *
 * Measures each visible cell's content box against the row center (±1px),
 * asserts identical row heights, no hover layout shift, and right-aligned
 * numeric cells. Deterministic — no pixel-diff, no AI review.
 */

export interface RowAlignmentOptions {
  /** Row locator. Defaults to `[data-app-table-row="true"]`. */
  readonly rows?: Locator;
  /** Max |contentCenterY − rowCenterY| in CSS pixels. */
  readonly centerTolerancePx?: number;
  /** Max |rowHeight − expected| when expectedHeightPx is set. */
  readonly heightTolerancePx?: number;
  /** When set, every row must match this height (±heightTolerancePx). */
  readonly expectedHeightPx?: number;
  /** Selector for numeric cells within a row (right-edge check). */
  readonly numericCellSelector?: string;
  /** Hover the first row and assert height + cell x positions stay put. */
  readonly assertHoverStability?: boolean;
}

export interface RowAlignmentViolation {
  readonly kind:
    | 'center'
    | 'height'
    | 'height-mismatch'
    | 'hover-shift'
    | 'numeric-align';
  readonly detail: string;
}

type GeometrySnapshot = {
  readonly count: number;
  readonly heights: number[];
  readonly violations: RowAlignmentViolation[];
  readonly firstRowCells: Array<{ left: number; width: number }>;
  readonly firstRowHeight: number;
};

async function measureRows(
  rows: Locator,
  options: {
    readonly centerTolerancePx: number;
    readonly heightTolerancePx: number;
    readonly expectedHeightPx?: number;
    readonly numericCellSelector: string;
  }
): Promise<GeometrySnapshot> {
  return rows.evaluateAll(
    (elements, opts) => {
      const violations: Array<{ kind: string; detail: string }> = [];
      const heights: number[] = [];
      let firstRowCells: Array<{ left: number; width: number }> = [];
      let firstRowHeight = 0;

      for (let index = 0; index < elements.length; index++) {
        const row = elements[index];
        if (!row) continue;
        const rowBox = row.getBoundingClientRect();
        if (rowBox.height < 1 || rowBox.width < 1) continue;

        heights.push(rowBox.height);
        const rowCenterY = rowBox.top + rowBox.height / 2;

        if (
          opts.expectedHeightPx != null &&
          Math.abs(rowBox.height - opts.expectedHeightPx) >
            opts.heightTolerancePx
        ) {
          violations.push({
            kind: 'height',
            detail: `row[${index}] height ${rowBox.height.toFixed(2)} ≠ ${opts.expectedHeightPx}`,
          });
        }

        const contentHosts = [
          ...row.querySelectorAll('[data-table-cell-content="stable"]'),
        ];
        // Shell list rows (no <td>): measure direct media/action/text markers.
        if (contentHosts.length === 0) {
          contentHosts.push(
            ...row.querySelectorAll(
              ':scope > [data-app-table-cell], :scope > *'
            )
          );
        }

        const measured = new Set<Element>();
        for (const host of contentHosts) {
          if (measured.has(host)) continue;
          measured.add(host);
          const box = host.getBoundingClientRect();
          if (box.height < 1 || box.width < 1) continue;
          const contentCenterY = box.top + box.height / 2;
          if (Math.abs(contentCenterY - rowCenterY) > opts.centerTolerancePx) {
            violations.push({
              kind: 'center',
              detail: `row[${index}] cell center Δ=${(contentCenterY - rowCenterY).toFixed(2)}px`,
            });
          }
        }

        for (const numeric of row.querySelectorAll(opts.numericCellSelector)) {
          const box = numeric.getBoundingClientRect();
          const parent =
            numeric.closest('[data-table-cell-content="stable"]') ??
            numeric.parentElement;
          if (!parent) continue;
          const parentBox = parent.getBoundingClientRect();
          const rightGap = parentBox.right - box.right;
          const leftGap = box.left - parentBox.left;
          // Right-aligned (or near-centered short glyphs like —): left gap
          // must be ≥ right gap within tolerance.
          if (leftGap + opts.centerTolerancePx >= rightGap) continue;
          violations.push({
            kind: 'numeric-align',
            detail: `row[${index}] numeric not right-aligned (leftGap=${leftGap.toFixed(1)} rightGap=${rightGap.toFixed(1)})`,
          });
        }

        if (index === 0) {
          firstRowHeight = rowBox.height;
          firstRowCells = [
            ...row.querySelectorAll('td, [data-app-table-cell]'),
          ].map(cell => {
            const box = cell.getBoundingClientRect();
            return { left: box.left, width: box.width };
          });
        }
      }

      if (heights.length > 1) {
        const first = heights[0] ?? 0;
        for (let i = 1; i < heights.length; i++) {
          const height = heights[i] ?? 0;
          if (Math.abs(height - first) > opts.heightTolerancePx) {
            violations.push({
              kind: 'height-mismatch',
              detail: `row[0]=${first.toFixed(2)} row[${i}]=${height.toFixed(2)}`,
            });
          }
        }
      }

      return {
        count: heights.length,
        heights,
        violations,
        firstRowCells,
        firstRowHeight,
      };
    },
    {
      centerTolerancePx: options.centerTolerancePx,
      heightTolerancePx: options.heightTolerancePx,
      expectedHeightPx: options.expectedHeightPx,
      numericCellSelector: options.numericCellSelector,
    }
  );
}

/**
 * Assert vertical centers, equal row heights, numeric alignment, and (optionally)
 * hover layout stability for every visible app table/list row.
 */
export async function assertRowAlignment(
  pageOrRows: Page | Locator,
  options: RowAlignmentOptions = {}
): Promise<void> {
  const centerTolerancePx = options.centerTolerancePx ?? 1;
  const heightTolerancePx = options.heightTolerancePx ?? 1;
  const numericCellSelector =
    options.numericCellSelector ?? '[data-app-table-cell="numeric"]';
  const rows =
    options.rows ??
    ('locator' in pageOrRows
      ? pageOrRows
      : pageOrRows.locator('[data-app-table-row="true"]'));

  await expect(rows.first()).toBeVisible();

  const before = await measureRows(rows, {
    centerTolerancePx,
    heightTolerancePx,
    expectedHeightPx: options.expectedHeightPx,
    numericCellSelector,
  });

  expect(
    before.violations,
    `row alignment violations: ${JSON.stringify(before.violations)}`
  ).toEqual([]);
  expect(before.count).toBeGreaterThan(0);

  if (options.assertHoverStability === false) return;

  const first = rows.first();
  await first.hover();
  const after = await measureRows(rows, {
    centerTolerancePx,
    heightTolerancePx,
    expectedHeightPx: options.expectedHeightPx,
    numericCellSelector,
  });

  expect(
    Math.abs(after.firstRowHeight - before.firstRowHeight)
  ).toBeLessThanOrEqual(heightTolerancePx);

  const pairCount = Math.min(
    before.firstRowCells.length,
    after.firstRowCells.length
  );
  for (let i = 0; i < pairCount; i++) {
    const afterCell = after.firstRowCells[i];
    const beforeCell = before.firstRowCells[i];
    if (!afterCell || !beforeCell) continue;
    expect(Math.abs(afterCell.left - beforeCell.left)).toBeLessThanOrEqual(1);
  }

  expect(
    after.violations,
    `row alignment after hover: ${JSON.stringify(after.violations)}`
  ).toEqual([]);
}

import { describe, expect, it } from 'vitest';
import {
  collectWebProductSource,
  formatViolations,
  lineOf,
  read,
  repoPath,
  type Violation,
} from './blocking-ui-invariants';

/**
 * column-heading-line-clamp-1-v1 (Tim lock 2026-08-30,
 * gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * Column headings clamp to 1 line.
 *
 * Detector (source contract, fail closed): every `<th>` element in the
 * product web surfaces must carry a one-line bound somewhere between its
 * opening tag and its matching `</th>` — `line-clamp-1`, `truncate`,
 * `whitespace-nowrap`, or `sr-only`. A `<th>` without one lets column
 * headings wrap to two lines, which is exactly the miss this invariant
 * bans. This includes the canonical table header-cell atoms: if the shared
 * cell doesn't clamp, every table built on it is broken.
 *
 * Pricing's mobile row descriptions use an explicit feature-label contract:
 * they preserve the full feature name while actual column headings remain
 * one line. The exception requires the owning file, row scope, and marker on
 * the opening th; a marker on a column or child cannot exempt a heading.
 */

const ONE_LINE_BOUND = /(line-clamp-1|truncate|whitespace-nowrap|sr-only)/;
const TH_OPEN = /<th(?=[\s/>])/g;

function hasWrappedPricingRowContract(file: string, cell: string): boolean {
  const opening = cell.slice(0, cell.indexOf('>') + 1);
  return (
    file ===
      'apps/web/components/features/pricing/PricingComparisonChart.tsx' &&
    /\bscope=['"]row['"]/.test(opening) &&
    /\bdata-wrap=['"]feature-label['"]/.test(opening) &&
    !ONE_LINE_BOUND.test(cell)
  );
}

describe('column-heading-line-clamp-1-v1', () => {
  it('permits only the marked pricing row description to wrap', () => {
    const file =
      'apps/web/components/features/pricing/PricingComparisonChart.tsx';
    const cell =
      "<th scope='row' data-wrap='feature-label'>Contact / subscriber capture";
    expect(hasWrappedPricingRowContract(file, cell)).toBe(true);
    for (const invalid of [
      cell.replace("scope='row'", "scope='col'"),
      cell.replace("scope='row'", ''),
      cell.replace("data-wrap='feature-label'", ''),
      "<th scope='row'><span data-wrap='feature-label'>Feature",
      cell.replace(
        "data-wrap='feature-label'",
        "data-wrap='feature-label' className='truncate'"
      ),
    ]) {
      expect(hasWrappedPricingRowContract(file, invalid)).toBe(false);
    }
    expect(
      hasWrappedPricingRowContract('apps/web/components/Table.tsx', cell)
    ).toBe(false);
  });

  it('every <th> column heading carries a one-line clamp', {
    timeout: 60_000,
  }, () => {
    const files = collectWebProductSource().filter(file =>
      /<th[\s/>]/.test(read(file))
    );
    expect(
      files.length,
      'zero <th> column headings found in product surfaces — detector is blind, failing closed'
    ).toBeGreaterThan(0);

    const violations: Violation[] = [];
    for (const file of files) {
      const source = read(file);
      let match: RegExpExecArray | null = TH_OPEN.exec(source);
      while (match) {
        const start = match.index;
        const selfClosingEnd = source.indexOf('/>', start);
        const closeTag = source.indexOf('</th>', start);
        const end =
          closeTag !== -1 &&
          (selfClosingEnd === -1 || closeTag < selfClosingEnd)
            ? closeTag
            : selfClosingEnd;
        const cell =
          end === -1 ? source.slice(start) : source.slice(start, end);
        if (
          !ONE_LINE_BOUND.test(cell) &&
          !hasWrappedPricingRowContract(repoPath(file), cell)
        ) {
          violations.push({
            file: repoPath(file),
            detail: `<th> at L${lineOf(source, start)} has no line-clamp-1/truncate/whitespace-nowrap — column heading can wrap`,
          });
        }
        match = TH_OPEN.exec(source);
      }
      TH_OPEN.lastIndex = 0;
    }

    expect
      .soft(
        violations,
        formatViolations('column-heading-line-clamp-1-v1', violations)
      )
      .toEqual([]);
    expect(violations).toHaveLength(0);
  });
});

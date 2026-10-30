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
 * No baseline, no allowlist. Violations are red until the cells are fixed
 * in follow-up PRs.
 */

const ONE_LINE_BOUND = /(line-clamp-1|truncate|whitespace-nowrap|sr-only)/;
const TH_OPEN = /<th(?=[\s/>])/g;

describe('column-heading-line-clamp-1-v1', () => {
  it('every <th> column heading carries a one-line clamp', () => {
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
        if (!ONE_LINE_BOUND.test(cell)) {
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

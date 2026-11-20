import { expect, it } from 'vitest';
import {
  evaluateChangedLineCoverage,
  formatChangedLineCoverage,
} from '../changed-test-coverage.mjs';

it('identifies the largest uncovered files when patch coverage fails', () => {
  const path = 'apps/web/lib/example.ts';
  const result = evaluateChangedLineCoverage({
    changedLines: new Map([[path, new Set([2, 3, 4])]]),
    coverage: {
      [`/repo/${path}`]: {
        statementMap: {
          0: { start: { line: 2 }, end: { line: 2 } },
          1: { start: { line: 3 }, end: { line: 3 } },
          2: { start: { line: 4 }, end: { line: 4 } },
        },
        s: { 0: 1, 1: 0, 2: 0 },
      },
    },
    repoRoot: '/repo',
  });
  expect(formatChangedLineCoverage(result)).toContain(
    `Uncovered changed lines: ${path} (2/3)`
  );
});

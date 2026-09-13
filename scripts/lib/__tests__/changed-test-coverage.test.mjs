import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateChangedLineCoverage,
  isCoverageSourcePath,
  parseChangedLines,
} from '../changed-test-coverage.mjs';

const path = 'apps/web/lib/example.ts';

function coverage(hits = [1, 1, 1]) {
  return {
    [`/repo/${path}`]: {
      statementMap: {
        0: { start: { line: 2 }, end: { line: 2 } },
        1: { start: { line: 3 }, end: { line: 3 } },
        2: { start: { line: 4 }, end: { line: 4 } },
      },
      s: { 0: hits[0], 1: hits[1], 2: hits[2] },
    },
  };
}

describe('changed test coverage', () => {
  it('parses exact new-side lines from zero-context Git hunks', () => {
    const changed = parseChangedLines(`diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1,0 +2,2 @@
+one
+two
@@ -9 +11 @@
-old
+new
`);
    expect([...changed.get(path)]).toEqual([2, 3, 11]);
  });

  it('deliberate red: rejects changed lines below the existing 60% patch floor', () => {
    const result = evaluateChangedLineCoverage({
      changedLines: new Map([[path, new Set([2, 3, 4])]]),
      coverage: coverage([1, 0, 0]),
      repoRoot: '/repo',
    });
    expect(result).toMatchObject({
      ok: false,
      applicable: true,
      coveredLines: 1,
      coverableLines: 3,
      percentage: 33.3,
      minimum: 60,
    });
  });

  it('deliberate red: fails closed when changed product code is absent from coverage', () => {
    const result = evaluateChangedLineCoverage({
      changedLines: new Map([[path, new Set([2])]]),
      coverage: {},
      repoRoot: '/repo',
    });
    expect(result).toMatchObject({ ok: false, missingFiles: [path] });
  });

  it('accepts meaningful coverage at or above the patch floor', () => {
    const result = evaluateChangedLineCoverage({
      changedLines: new Map([[path, new Set([2, 3, 4])]]),
      coverage: coverage([1, 1, 0]),
      repoRoot: '/repo',
    });
    expect(result).toMatchObject({ ok: true, percentage: 66.7 });
  });

  it('records an explicit non-applicable receipt for non-product changes', () => {
    expect(isCoverageSourcePath('apps/web/proxy.ts')).toBe(true);
    expect(isCoverageSourcePath('apps/web/workflows/example.ts')).toBe(true);
    expect(isCoverageSourcePath('apps/web/vitest.config.fast.mts')).toBe(false);
    expect(isCoverageSourcePath('apps/web/lib/example.test.ts')).toBe(false);
    expect(isCoverageSourcePath('scripts/lib/example.mjs')).toBe(false);
    expect(
      evaluateChangedLineCoverage({
        changedLines: new Map([
          ['apps/web/vitest.config.fast.mts', new Set([1])],
          ['scripts/lib/example.mjs', new Set([1])],
        ]),
        coverage: {},
      })
    ).toMatchObject({ ok: true, applicable: false });
  });

  it('deliberate red: requires exact-head coverage before source or merge promotion', () => {
    const workflow = readFileSync(
      resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
      'utf8'
    );
    const coverage = workflow.slice(
      workflow.indexOf('  ci-exact-head-coverage:'),
      workflow.indexOf('  ci-a11y:')
    );
    expect(coverage).toContain("github.event_name == 'pull_request'");
    expect(coverage).toContain("github.event_name == 'merge_group'");
    expect(coverage).toContain('github.event.pull_request.head.sha');
    expect(coverage).toContain('github.event.merge_group.head_sha');
    expect(coverage).toContain(
      'test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"'
    );
    expect(coverage).toContain('has_web_coverage_changes');
    expect(coverage).toContain('pnpm --filter @jovie/web test:coverage');
    expect(coverage).toContain('scripts/check-changed-test-coverage.mjs');
    expect(coverage).toContain(String.raw`--base \"\$COVERAGE_BASE\"`);
    expect(coverage).toContain(String.raw`--head \"\$EXPECTED_HEAD\"`);
    expect(coverage).not.toContain('test:coverage:diff');
    expect(coverage).not.toContain('exact-head-coverage-baseline.json');
    expect(coverage).toContain("trap 'stop_coverage; exit 143' TERM");
    expect(coverage).not.toContain('secrets.CODECOV_TOKEN');
    const mergeReady = workflow.slice(
      workflow.indexOf('  ci-merge-group-ready:'),
      workflow.indexOf('  ci-pr-ready:')
    );
    const sourceReady = workflow.slice(
      workflow.indexOf('  ci-pr-ready:'),
      workflow.indexOf('  ci-summary:')
    );
    for (const aggregate of [mergeReady, sourceReady]) {
      expect(aggregate).toContain('ci-exact-head-coverage');
      expect(aggregate).toContain('needs.ci-exact-head-coverage.result');
    }
    expect(mergeReady).toContain('Exact-head Coverage:$COVERAGE_RESULT');
    expect(sourceReady).toContain('COVERAGE_RESULT" != "success"');
  });
});

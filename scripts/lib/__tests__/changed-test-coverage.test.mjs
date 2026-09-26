import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rewriteVitestArgs } from '../../../apps/web/scripts/vitest-wrapper.mjs';
import {
  EXACT_HEAD_COVERAGE_JOB_TIMEOUT_MINUTES,
  EXACT_HEAD_COVERAGE_STEP_TIMEOUT,
  evaluateChangedLineCoverage,
  findReferencingTests,
  isCoverageSourcePath,
  parseChangedLines,
  planChangedLineCoverage,
  resolveTestSpecifierCandidates,
  toWebCoverageIncludePaths,
} from '../changed-test-coverage.mjs';
import { NATIVE_QUEUE_POLICY } from '../merge-queue-guard.mjs';

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

  it('maps coverable web sources to Vitest coverage.include paths', () => {
    expect(toWebCoverageIncludePaths([path])).toEqual(['lib/example.ts']);
    expect(() =>
      toWebCoverageIncludePaths(['apps/web/lib/example.test.ts'])
    ).toThrow(/Not a coverable web product path/);
  });

  it('serializes coverageInclude as an array from the shipped planner, never null', () => {
    const emptyPlan = planChangedLineCoverage({ files: [] });
    const emptySerialized = JSON.parse(JSON.stringify(emptyPlan));
    expect(emptyPlan.applicable).toBe(false);
    expect(emptySerialized.coverageInclude).toEqual([]);

    expect(emptySerialized.relatedTests).toEqual([]);

    const applicablePlan = planChangedLineCoverage({
      files: [path],
      testFiles: [],
    });
    const applicableSerialized = JSON.parse(JSON.stringify(applicablePlan));
    expect(applicablePlan.applicable).toBe(true);
    expect(applicableSerialized.coverageInclude).toEqual(
      toWebCoverageIncludePaths([path])
    );
    expect(applicableSerialized.relatedTests).toEqual([]);
  });

  // Regression: PR #18559 reported 50% because Vitest's `related` graph did
  // not select the createRequire() test for an ESLint rule, so its changed
  // lines were "uncovered" although an existing test executes them.
  it('plans tests that load a changed source outside the Vite module graph', () => {
    const page = 'apps/web/app/(auth)/auth/native-complete/page.tsx';
    const rule = 'apps/web/eslint-rules/no-hardcoded-theme-colors.js';
    const plan = planChangedLineCoverage({
      files: [page, rule],
      testFiles: [
        {
          path: 'apps/web/tests/unit/app/native-complete-page.test.tsx',
          source: `const { default: Page } = await import(
      '../../../app/(auth)/auth/native-complete/page'
    );`,
        },
        {
          path: 'apps/web/eslint-rules/no-hardcoded-theme-colors.test.ts',
          source: `const require = createRequire(import.meta.url);
const rule = require('./no-hardcoded-theme-colors.js');`,
        },
        {
          path: 'apps/web/tests/unit/customer-facing-vendor-copy.test.ts',
          source: `const FILES = ['app/(auth)/auth/native-complete/page.tsx'];`,
        },
        {
          path: 'apps/web/eslint-rules/other-rule.test.ts',
          source: `const rule = require('./other-rule.js');`,
        },
      ],
    });
    expect(plan.relatedTests).toEqual([
      'eslint-rules/no-hardcoded-theme-colors.test.ts',
      'tests/unit/app/native-complete-page.test.tsx',
    ]);
  });

  it.each([
    ["import { x } from '@/lib/example';", 'apps/web/tests/unit/a.test.ts'],
    ["import '../../lib/example';", 'apps/web/tests/unit/a.test.ts'],
    [
      "export { x } from '../../lib/example.ts';",
      'apps/web/tests/unit/a.test.ts',
    ],
    ["vi.mock('@/lib/example', () => ({}));", 'apps/web/tests/unit/a.test.ts'],
    ["await vi.importActual('@/lib/example')", 'apps/web/tests/unit/a.test.ts'],
    ["vi.doMock(\n  '@/lib/example'\n)", 'apps/web/tests/unit/a.test.ts'],
    ["require.resolve('./example.js')", 'apps/web/lib/example.test.ts'],
  ])(
    'selects a test referencing a changed source via %s',
    (source, testPath) => {
      expect(
        findReferencingTests({
          changedFiles: [path],
          testFiles: [{ path: testPath, source }],
        })
      ).toEqual([testPath.slice('apps/web/'.length)]);
    }
  );

  it.each([
    [
      "import { x } from '@/lib/example-other';",
      'apps/web/tests/unit/a.test.ts',
    ],
    ["import { x } from 'lib/example';", 'apps/web/tests/unit/a.test.ts'],
    ["import { x } from '../lib/example';", 'apps/web/tests/unit/a.test.ts'],
    ["const p = '@/lib/example';", 'apps/web/tests/unit/a.test.ts'],
    ["import { x } from '@/lib/example';", 'apps/web/lib/example.helper.ts'],
    [
      "import { x } from '../../../../lib/example';",
      'apps/web/tests/unit/a.test.ts',
    ],
  ])('does not select a test for %s', (source, testPath) => {
    expect(
      findReferencingTests({
        changedFiles: [path],
        testFiles: [{ path: testPath, source }],
      })
    ).toEqual([]);
  });

  it('resolves @/ specifiers through the apps/web Vitest aliases', () => {
    const testPath = 'apps/web/tests/unit/a.test.ts';
    expect(
      resolveTestSpecifierCandidates(testPath, '@/features/foo/Bar')
    ).toContain('apps/web/components/features/foo/Bar.tsx');
    expect(
      resolveTestSpecifierCandidates(testPath, '@/app/(shell)/page')
    ).toContain('apps/web/app/app/(shell)/page.tsx');
    expect(resolveTestSpecifierCandidates(testPath, '@/lib/dir')).toContain(
      'apps/web/lib/dir/index.ts'
    );
    expect(resolveTestSpecifierCandidates(testPath, 'react')).toEqual([]);
  });

  it('plans related tests from the real checkout for a createRequire rule', () => {
    const plan = planChangedLineCoverage({
      files: ['apps/web/eslint-rules/no-hardcoded-theme-colors.js'],
    });
    expect(plan.relatedTests).toContain(
      'eslint-rules/no-hardcoded-theme-colors.test.ts'
    );
  });

  it('records an explicit non-applicable receipt for non-product changes', () => {
    expect(isCoverageSourcePath('apps/web/proxy.ts')).toBe(true);
    expect(isCoverageSourcePath('apps/web/workflows/example.ts')).toBe(true);
    expect(isCoverageSourcePath('apps/web/vitest.config.fast.mts')).toBe(false);
    expect(isCoverageSourcePath('apps/web/lib/example.test.ts')).toBe(false);
    expect(
      isCoverageSourcePath('apps/web/components/atoms/example.stories.tsx')
    ).toBe(false);
    expect(isCoverageSourcePath('scripts/lib/example.mjs')).toBe(false);
    expect(isCoverageSourcePath('apps/web/scripts/vitest-wrapper.mjs')).toBe(
      false
    );
    expect(
      evaluateChangedLineCoverage({
        changedLines: new Map([
          ['apps/web/vitest.config.fast.mts', new Set([1])],
          ['scripts/lib/example.mjs', new Set([1])],
          ['apps/web/scripts/vitest-wrapper.mjs', new Set([1])],
        ]),
        coverage: {},
      })
    ).toMatchObject({ ok: true, applicable: false });
  });

  it('treats a stories-only diff as a non-applicable coverage receipt', () => {
    expect(
      evaluateChangedLineCoverage({
        changedLines: new Map([
          ['apps/web/components/atoms/example.stories.tsx', new Set([1, 2, 3])],
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
    const webPkg = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../../../apps/web/package.json'),
        'utf8'
      )
    );
    // pnpm forwards a leading "--" into test:coverage; vitest then treats
    // --changed as a filter and Exact-head runs the full tree (~1267 files).
    expect(webPkg.scripts['test:coverage']).toContain('vitest-wrapper.mjs');
    expect(webPkg.scripts['test:coverage']).toContain('--coverage');
    expect(webPkg.scripts['test:coverage']).not.toBe('vitest run --coverage');
    const wrapper = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../apps/web/scripts/vitest-wrapper.mjs'
      ),
      'utf8'
    );
    expect(wrapper).toContain("rawArgs[0] === '--'");
    expect(wrapper).toContain('JOVIE_COVERAGE_INCLUDE');
    expect(wrapper).toContain("args[index] === '--changed'");
    expect(wrapper).toContain("'related'");
    expect(coverage).toContain('pnpm --filter @jovie/web test:coverage');
    expect(coverage).toContain(
      'pnpm --filter @jovie/web test:coverage --changed'
    );
    expect(coverage).not.toContain(
      'pnpm --filter @jovie/web test:coverage -- --changed'
    );
    expect(coverage).toContain('scripts/check-changed-test-coverage.mjs');
    expect(coverage).toContain(String.raw`--base \"\$COVERAGE_BASE\"`);
    expect(coverage).toContain(String.raw`--head \"\$EXPECTED_HEAD\"`);
    expect(coverage).toContain(String.raw`--changed \"\$COVERAGE_BASE\"`);
    expect(coverage).not.toContain(
      String.raw`test:coverage -- --changed \"\$COVERAGE_BASE\"`
    );
    expect(coverage).toContain(
      String.raw`test:coverage --changed \"\$COVERAGE_BASE\"`
    );
    const coverageRun = coverage.slice(
      coverage.indexOf('Run exact-head coverage and changed-behavior ratchet')
    );
    const runBody = coverageRun.slice(coverageRun.indexOf('        run: |'));
    expect(runBody).not.toMatch(/^\s+#.*`/m);
    expect(coverage).toContain('--bail 1');
    expect(coverage).toContain('JOVIE_COVERAGE_INCLUDE');
    expect(coverage).toContain('.coverageInclude // [] | .[]');
    expect(coverage).toContain('.relatedTests // [] | .[]');
    expect(coverage).toContain('JOVIE_COVERAGE_RELATED_TESTS');
    expect(wrapper).toContain('JOVIE_COVERAGE_RELATED_TESTS');
    expect(coverage).toContain(
      'Applicable exact-head coverage plan produced no include paths.'
    );
    expect(EXACT_HEAD_COVERAGE_STEP_TIMEOUT).toBe('17m');
    expect(coverage).toContain(
      `timeout --kill-after=20s ${EXACT_HEAD_COVERAGE_STEP_TIMEOUT}`
    );
    const jobTimeout = Number(coverage.match(/timeout-minutes:\s*(\d+)/)?.[1]);
    expect(jobTimeout).toBe(EXACT_HEAD_COVERAGE_JOB_TIMEOUT_MINUTES);
    expect(jobTimeout).toBeLessThan(
      NATIVE_QUEUE_POLICY.check_response_timeout_minutes
    );
    expect(coverage).not.toContain('timeout-minutes: 60');
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

  it('passes planned related tests to the hosted repair coverage run', () => {
    const workflow = readFileSync(
      new URL(
        '../../../.github/workflows/rolling-ci-dispatch.yml',
        import.meta.url
      ),
      'utf8'
    );
    const coverageStep = workflow.slice(
      workflow.indexOf('.coveragePlan.coverageInclude | .[]')
    );
    const runEnd = coverageStep.indexOf('test:coverage --changed');
    expect(runEnd).toBeGreaterThan(0);
    const beforeRun = coverageStep.slice(0, runEnd);
    expect(beforeRun).toContain('.coveragePlan.relatedTests // [] | .[]');
    expect(beforeRun).toContain('export JOVIE_COVERAGE_RELATED_TESTS=');
  });

  it('maps Exact-head --changed onto planned related files only', () => {
    expect(
      rewriteVitestArgs(
        ['run', '--coverage', '--changed', 'abc123', '--bail', '1'],
        'constants/plans.ts\ndata/marketingPricingPlans.ts'
      )
    ).toEqual([
      'related',
      'constants/plans.ts',
      'data/marketingPricingPlans.ts',
      '--run',
      '--coverage',
      '--bail',
      '1',
    ]);
    expect(rewriteVitestArgs(['--', 'run', '--coverage'], '')).toEqual([
      'run',
      '--coverage',
    ]);
  });

  it('adds planned related tests to the same related coverage run (union)', () => {
    expect(
      rewriteVitestArgs(
        ['run', '--coverage', '--changed', 'abc123', '--bail', '1'],
        String.raw`app/\(auth\)/auth/native-complete/page.tsx`,
        'eslint-rules/no-hardcoded-theme-colors.test.ts\ntests/unit/app/(auth)/page.test.tsx\n'
      )
    ).toEqual([
      'related',
      String.raw`app/\(auth\)/auth/native-complete/page.tsx`,
      'eslint-rules/no-hardcoded-theme-colors.test.ts',
      String.raw`tests/unit/app/\(auth\)/page.test.tsx`,
      '--run',
      '--coverage',
      '--bail',
      '1',
    ]);
    // Related tests never widen an unplanned run.
    expect(
      rewriteVitestArgs(['run', '--coverage'], '', 'lib/example.test.ts')
    ).toEqual(['run', '--coverage']);
  });

  it.each([
    '../outside.test.ts',
    '/abs/example.test.ts',
    '--config=evil.test.ts',
    'lib/example.ts',
  ])('rejects unsafe related coverage test path %s', relatedTest => {
    expect(() =>
      rewriteVitestArgs(
        ['run', '--coverage', '--changed', 'abc123'],
        'lib/example.ts',
        relatedTest
      )
    ).toThrow(/Invalid related coverage test path/);
  });

  it.each([
    [
      'rewritten exact-head coverage',
      ['run', '--coverage', '--changed', 'abc123'],
      'lib/example.ts',
      true,
      4,
      true,
    ],
    [
      'legacy exact-head coverage',
      ['run', '--coverage', '--changed', 'abc123'],
      '',
      true,
      4,
      true,
    ],
    [
      'ordinary changed tests',
      ['run', '--changed', 'abc123'],
      '',
      true,
      1,
      false,
    ],
    [
      'unscoped related coverage',
      ['related', 'lib/example.ts', '--run', '--coverage'],
      '',
      true,
      2,
      false,
    ],
    ['ordinary full coverage', ['run', '--coverage'], '', true, 2, false],
    [
      'local scoped coverage',
      ['run', '--coverage', '--changed', 'abc123'],
      'lib/example.ts',
      false,
      undefined,
      true,
    ],
  ])(
    'loads real fast config for %s',
    async (_name, args, include, ci, workers, parallel) => {
      const repoRoot = resolve(import.meta.dirname, '../../..');
      const require = createRequire(import.meta.url);
      const { loadConfigFromFile } = await import(
        pathToFileURL(
          require.resolve('vite', {
            paths: [resolve(repoRoot, 'apps/web')],
          })
        ).href
      );
      const previousArgv = process.argv;
      const previousCI = process.env.CI;
      const previousInclude = process.env.JOVIE_COVERAGE_INCLUDE;
      try {
        process.argv = [
          process.execPath,
          'vitest',
          ...rewriteVitestArgs(args, include),
        ];
        process.env.CI = String(ci);
        process.env.JOVIE_COVERAGE_INCLUDE = include;
        const loaded = await loadConfigFromFile(
          { command: 'serve', mode: 'test' },
          resolve(repoRoot, 'apps/web/vitest.config.fast.mts')
        );
        expect(loaded).not.toBeNull();
        expect(loaded.config.test.maxWorkers).toBe(workers);
        expect(loaded.config.test.fileParallelism).toBe(parallel);
        expect(loaded.config.test.coverage.provider).toBe('v8');
        expect(loaded.config.test.coverage.include).toEqual(
          include ? [include] : undefined
        );
        if (include && args.includes('--coverage')) {
          expect(loaded.config.test.bail).toBe(1);
          expect(loaded.config.test.coverage.reporter).toEqual([
            'text',
            'json',
          ]);
        }
      } finally {
        process.argv = previousArgv;
        for (const [key, value] of [
          ['CI', previousCI],
          ['JOVIE_COVERAGE_INCLUDE', previousInclude],
        ]) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  );
});

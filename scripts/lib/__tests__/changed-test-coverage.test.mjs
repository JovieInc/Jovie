import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rewriteVitestArgs } from '../../../apps/web/scripts/vitest-wrapper.mjs';
import {
  EXACT_HEAD_COVERAGE_JOB_TIMEOUT_MINUTES,
  EXACT_HEAD_COVERAGE_STEP_TIMEOUT,
  evaluateChangedLineCoverage,
  findReferencingTests,
  isCoverageSourcePath,
  mergeCoverageMaps,
  parseChangedLines,
  planChangedLineCoverage,
  resolveTestSpecifierCandidates,
  runChangedLineCoverageCheck,
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

  it('merges vitest --shard coverage maps like one unsharded run', () => {
    // Shard 1 ran the test covering line 2; shard 2 only saw the file through
    // coverage.all (zero hits) plus a test covering line 4.
    const merged = mergeCoverageMaps([
      coverage([1, 0, 0]),
      coverage([0, 0, 2]),
    ]);
    expect(merged[`/repo/${path}`].s).toEqual({ 0: 1, 1: 0, 2: 2 });
    expect(
      evaluateChangedLineCoverage({
        changedLines: new Map([[path, new Set([2, 3, 4])]]),
        coverage: merged,
        repoRoot: '/repo',
      })
    ).toMatchObject({ ok: true, coveredLines: 2, coverableLines: 3 });
  });

  it('deliberate red: merged shards stay below the floor when no shard covers the lines', () => {
    const result = evaluateChangedLineCoverage({
      changedLines: new Map([[path, new Set([2, 3, 4])]]),
      coverage: mergeCoverageMaps([coverage([1, 0, 0]), coverage([0, 0, 0])]),
      repoRoot: '/repo',
    });
    expect(result).toMatchObject({ ok: false, coveredLines: 1 });
  });

  it('merges shard statements by source location, not statement id', () => {
    const shifted = {
      [`/repo/${path}`]: {
        statementMap: {
          0: { start: { line: 3 }, end: { line: 3 } },
          1: { start: { line: 5 }, end: { line: 5 } },
        },
        s: { 0: 4, 1: 0 },
      },
    };
    const merged = mergeCoverageMaps([coverage([0, 0, 0]), shifted]);
    const file = merged[`/repo/${path}`];
    const hitsByLine = Object.fromEntries(
      Object.entries(file.statementMap).map(([id, location]) => [
        location.start.line,
        file.s[id],
      ])
    );
    expect(hitsByLine).toEqual({ 2: 0, 3: 4, 4: 0, 5: 0 });
  });

  it('keeps statements without a source location distinct instead of collapsing them', () => {
    const unmapped = {
      [`/repo/${path}`]: {
        statementMap: {
          0: { start: { line: 2 }, end: { line: 2 } },
          1: { start: null, end: null },
          2: {},
        },
        s: { 0: 1, 1: 3, 2: 5 },
      },
    };
    const file = mergeCoverageMaps([unmapped, unmapped])[`/repo/${path}`];
    expect(Object.values(file.s)).toEqual([2, 6, 10]);
  });

  it('deliberate red: a changed file absent from every shard stays missing', () => {
    const result = evaluateChangedLineCoverage({
      changedLines: new Map([[path, new Set([2])]]),
      coverage: mergeCoverageMaps([{}, {}]),
      repoRoot: '/repo',
    });
    expect(result).toMatchObject({ ok: false, missingFiles: [path] });
    expect(() => mergeCoverageMaps([])).toThrow(/At least one coverage map/);
  });

  it('merges every --coverage shard report in the ratchet check', () => {
    const repo = mkdtempSync(join(tmpdir(), 'changed-coverage-cli-'));
    const git = (...args) =>
      execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.email', 'ci@example.com');
    git('config', 'user.name', 'CI');
    git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(repo, 'apps/web/lib'), { recursive: true });
    writeFileSync(join(repo, 'apps/web/lib/example.ts'), 'export {};\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(
      join(repo, 'apps/web/lib/example.ts'),
      'export {};\nconst a = 1;\nconst b = 2;\nconst c = 3;\n'
    );
    git('commit', '-qam', 'head');
    const head = git('rev-parse', 'HEAD');
    const shard = hits => {
      const file = join(repo, `shard-${hits.join('')}.json`);
      const report = coverage(hits)[`/repo/${path}`];
      writeFileSync(file, JSON.stringify({ [join(repo, path)]: report }));
      return file;
    };
    const check = coveragePaths =>
      runChangedLineCoverageCheck({
        base,
        head,
        repoRoot: repo,
        coveragePaths,
      });
    const first = shard([1, 0, 0]);
    const second = shard([0, 1, 0]);
    expect(check([first])).toMatchObject({ ok: false, coveredLines: 1 });
    expect(check([first, second])).toMatchObject({
      ok: true,
      coveredLines: 2,
      coverableLines: 3,
    });
    const cli = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../check-changed-test-coverage.mjs'),
        '--base',
        base,
        '--head',
        head,
        '--coverage',
      ],
      { encoding: 'utf8' }
    );
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('Missing value for --coverage argument.');
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
    // The V8 run is sharded; the gate job merges the shards and ratchets.
    const shard = workflow.slice(
      workflow.indexOf('  ci-exact-head-coverage-shard:'),
      workflow.indexOf('  ci-exact-head-coverage:')
    );
    const coverage = workflow.slice(
      workflow.indexOf('  ci-exact-head-coverage:'),
      workflow.indexOf('  ci-a11y:')
    );
    for (const job of [shard, coverage]) {
      expect(job).toContain("github.event_name == 'pull_request'");
      expect(job).toContain("github.event_name == 'merge_group'");
      expect(job).toContain('github.event.pull_request.head.sha');
      expect(job).toContain('github.event.merge_group.head_sha');
      expect(job).toContain('test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"');
      expect(job).toContain('has_web_coverage_changes');
    }
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
    expect(shard).toContain('pnpm --filter @jovie/web test:coverage');
    expect(shard).toContain('pnpm --filter @jovie/web test:coverage --changed');
    for (const job of [shard, coverage]) {
      expect(job).not.toContain(
        'pnpm --filter @jovie/web test:coverage -- --changed'
      );
      expect(job).toContain('scripts/check-changed-test-coverage.mjs');
      expect(job).not.toContain(
        String.raw`test:coverage -- --changed \"\$COVERAGE_BASE\"`
      );
    }
    expect(shard).toContain(String.raw`--base \"\$COVERAGE_BASE\"`);
    expect(shard).toContain(String.raw`--head \"\$EXPECTED_HEAD\"`);
    expect(shard).toContain(String.raw`--changed \"\$COVERAGE_BASE\"`);
    expect(shard).toContain(
      String.raw`test:coverage --changed \"\$COVERAGE_BASE\" --bail 1 --shard \"\$COVERAGE_SHARD\"`
    );
    const shardRun = shard.slice(
      shard.indexOf('Run exact-head coverage shard')
    );
    const runBody = shardRun.slice(shardRun.indexOf('        run: |'));
    expect(runBody).not.toMatch(/^\s+#.*`/m);
    expect(shard).toContain('--bail 1');
    expect(shard).toContain('JOVIE_COVERAGE_INCLUDE');
    expect(shard).toContain('.coverageInclude // [] | .[]');
    expect(shard).toContain('.relatedTests // [] | .[]');
    expect(shard).toContain('JOVIE_COVERAGE_RELATED_TESTS');
    expect(wrapper).toContain('JOVIE_COVERAGE_RELATED_TESTS');
    expect(shard).toContain(
      'Applicable exact-head coverage plan produced no include paths.'
    );
    expect(EXACT_HEAD_COVERAGE_STEP_TIMEOUT).toBe('17m');
    expect(shard).toContain(
      `timeout --kill-after=20s ${EXACT_HEAD_COVERAGE_STEP_TIMEOUT}`
    );
    for (const job of [shard, coverage]) {
      const jobTimeout = Number(job.match(/timeout-minutes:\s*(\d+)/)?.[1]);
      expect(jobTimeout).toBe(EXACT_HEAD_COVERAGE_JOB_TIMEOUT_MINUTES);
      expect(jobTimeout).toBeLessThan(
        NATIVE_QUEUE_POLICY.check_response_timeout_minutes
      );
      expect(job).not.toContain('timeout-minutes: 60');
      expect(job).not.toContain('test:coverage:diff');
      expect(job).not.toContain('exact-head-coverage-baseline.json');
      expect(job).not.toContain('secrets.CODECOV_TOKEN');
    }
    expect(shard).toContain("trap 'stop_coverage; exit 143' TERM");
    // The gate job never runs Vitest: it requires every shard to pass,
    // merges exactly one report per shard, and ratchets the exact diff.
    expect(coverage).not.toContain('test:coverage --changed');
    expect(coverage).toContain(
      'needs: [ci-path-changes, ci-exact-head-coverage-shard]'
    );
    expect(coverage).toContain(
      'SHARD_RESULT: ${{ needs.ci-exact-head-coverage-shard.result }}'
    );
    expect(coverage).toContain(`if [[ "$SHARD_RESULT" != 'success' ]]; then`);
    expect(coverage).toContain('--base "$COVERAGE_BASE"');
    expect(coverage).toContain('--head "$EXPECTED_HEAD"');
    expect(coverage).toContain('"${coverage_args[@]}"');
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

  it('deliberate red: the gate merges exactly one coverage report per shard', () => {
    const workflow = readFileSync(
      resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
      'utf8'
    );
    const shard = workflow.slice(
      workflow.indexOf('  ci-exact-head-coverage-shard:'),
      workflow.indexOf('  ci-exact-head-coverage:')
    );
    const coverage = workflow.slice(
      workflow.indexOf('  ci-exact-head-coverage:'),
      workflow.indexOf('  ci-a11y:')
    );
    const matrix = shard.match(/^ {8}shard: \[([^\]]+)\]$/m)?.[1];
    const shards = matrix?.split(',').map(value => Number(value.trim()));
    expect(shards).toEqual([1, 2, 3, 4]);
    const count = shards.length;
    expect(shard).toContain('fail-fast: true');
    expect(shard).toContain(`COVERAGE_SHARD: \${{ matrix.shard }}/${count}`);
    expect(shard).toContain(
      'COVERAGE_REPORT: exact-head-coverage/coverage-final.${{ matrix.shard }}.json'
    );
    // Every applicable shard fails closed without its report and uploads it.
    expect(shard).toContain(
      String.raw`cp apps/web/coverage/coverage-final.json \"\$COVERAGE_REPORT\"`
    );
    expect(shard).toContain(
      "if: steps.coverage-shard.outputs.applicable == 'true'"
    );
    expect(shard).toContain(
      'name: exact-head-coverage-${{ github.run_id }}-${{ matrix.shard }}'
    );
    expect(shard).toContain('if-no-files-found: error');
    expect(coverage).toContain(
      'pattern: exact-head-coverage-${{ github.run_id }}-*'
    );
    expect(coverage).toContain(`for shard in ${shards.join(' ')}; do`);
    expect(coverage).toContain(`if [[ "$report_count" -ne ${count} ]]; then`);
    expect(coverage).toContain('coverage_args+=(--coverage "$report")');
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

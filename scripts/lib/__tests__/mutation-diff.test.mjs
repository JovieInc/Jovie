import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  createTestSelector,
  findRelatedTests,
  HIGH_RISK_PREFIXES,
  readExecutedTests,
  readModuleSource,
  readTargetExecution,
  renderSummary,
  resolveSpecifier,
  scoreMutants,
  selectHighRiskSources,
} from '../mutation-diff.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

/** @typedef {{ name?: string, id?: string, run?: string, env?: Record<string, string> }} WorkflowStep */
const workflow =
  /** @type {{ on: { push: { paths: string[] } }, jobs: { mutate: { steps: WorkflowStep[] } } }} */ (
    load(
      readFileSync(
        join(repoRoot, '.github/workflows/mutation-diff.yml'),
        'utf8'
      )
    )
  );

/**
 * @param {string} status
 * @param {number} [line]
 */
const mutant = (status, line = 1) => ({
  status,
  mutatorName: 'ConditionalExpression',
  replacement: 'true',
  location: { start: { line } },
});

describe('selectHighRiskSources', () => {
  it.each([
    '// Only comments\n',
    'export type AuthMethod = "email" | "google"; export interface Actor { id: string }',
    'import type { Actor } from "./actor"; export type { Actor };',
    'import type Actor = require("./actor");',
    'export declare const actor: string; declare global { interface Window { actor: string } }',
    'export declare function allowed(value: string): boolean;',
    'export declare class Actor { id: string }',
    'export declare enum Role { Admin }',
    'export {}; ;',
  ])('skips source containing only erased declarations: %s', contents => {
    expect(
      selectHighRiskSources(['apps/web/lib/auth/types.ts'], () => contents)
    ).toEqual([]);
  });

  it.each([
    'export type Actor = string; export const allowed = true;',
    'import "./setup"; export interface Actor { id: string }',
    'import {} from "./setup";',
    'import { type Actor } from "./actor";',
    'export { type Actor } from "./actor";',
    'export {} from "./setup";',
    'export { allowed } from "./policy";',
    'export * from "./policy";',
    'export enum Role { Admin }',
    'export namespace Roles { export const admin = true; }',
    'export abstract class Actor {}',
    'export type Broken = ;',
    'declare export { allowed } from "./policy";',
    null,
  ])('retains runtime or unknown source: %s', contents => {
    expect(
      selectHighRiskSources(['apps/web/lib/auth/policy.ts'], () => contents)
    ).toEqual(['lib/auth/policy.ts']);
  });

  it('keeps changed high-risk apps/web source and drops everything else', () => {
    expect(
      selectHighRiskSources([
        'apps/web/lib/entitlements/registry.ts',
        'apps/web/lib/entitlements/registry.ts',
        'apps/web/lib/auth/gate.ts',
        'apps/web/proxy.ts',
        'apps/web/app/api/stripe/webhooks/route.ts',
        'apps/web/lib/auth/gate.test.ts',
        'apps/web/lib/auth/types.d.ts',
        'apps/web/lib/billing/Plan.stories.tsx',
        'apps/web/lib/billing/__tests__/helper.ts',
        'apps/web/lib/billing/notes.md',
        'apps/web/lib/cron/other.ts',
        'apps/web/components/Button.tsx',
        'lib/auth/gate.ts',
      ])
    ).toEqual([
      'app/api/stripe/webhooks/route.ts',
      'lib/auth/gate.ts',
      'lib/entitlements/registry.ts',
      'proxy.ts',
    ]);
  });
});

describe('resolveSpecifier', () => {
  it.each([
    ['@/lib/cron/auth', 'tests/unit/a.test.ts', 'lib/cron/auth'],
    ['@/lib/cron/auth.ts', 'tests/unit/a.test.ts', 'lib/cron/auth'],
    ['@/features/x/y', 'tests/unit/a.test.ts', 'components/features/x/y'],
    ['@/app/(shell)/page', 'tests/a.test.ts', 'app/app/(shell)/page'],
    ['./auth', 'lib/cron/auth.test.ts', 'lib/cron/auth'],
    ['../../lib/stripe/x.js', 'tests/unit/a.test.ts', 'lib/stripe/x'],
    ['../../../outside', 'tests/unit/a.test.ts', null],
    ['vitest', 'tests/unit/a.test.ts', null],
  ])('resolves %s from %s', (specifier, testPath, expected) => {
    expect(resolveSpecifier(specifier, testPath)).toBe(expected);
  });
});

describe('findRelatedTests', () => {
  it('finds static, dynamic, and importActual importers but not mock-only tests', () => {
    const tests = new Map([
      ['lib/cron/auth.test.ts', "const m = await import('@/lib/cron/auth');"],
      ['tests/unit/static.test.ts', "import { x } from '../../lib/cron/auth';"],
      [
        'tests/unit/actual.test.ts',
        "await vi.importActual<typeof M>('@/lib/cron/auth');",
      ],
      ['tests/unit/mocked.test.ts', "vi.mock('@/lib/cron/auth', () => ({}));"],
      ['tests/unit/other.test.ts', "import '@/lib/cron/authz';"],
    ]);

    expect(
      findRelatedTests(
        'lib/cron/auth.ts',
        tests,
        new Map([['lib/cron/auth.ts', 'export const x = 1;']])
      )
    ).toEqual([
      'lib/cron/auth.test.ts',
      'tests/unit/actual.test.ts',
      'tests/unit/static.test.ts',
    ]);
  });

  it('matches directory imports to index files', () => {
    const tests = new Map([
      ['tests/unit/e.test.ts', "import { e } from '@/lib/entitlements';"],
    ]);

    expect(
      findRelatedTests(
        'lib/entitlements/index.ts',
        tests,
        new Map([['lib/entitlements/index.ts', 'export const e = 1;']])
      )
    ).toEqual(['tests/unit/e.test.ts']);
  });
});

describe('scoreMutants', () => {
  it('counts timeouts as detected and no-coverage as undetected', () => {
    expect(
      scoreMutants([
        mutant('Killed'),
        mutant('Killed'),
        mutant('Timeout'),
        mutant('Survived'),
        mutant('NoCoverage'),
        mutant('CompileError'),
      ])
    ).toEqual({ detected: 3, undetected: 2, valid: 5, score: 60 });
  });

  it('returns a null score when no mutant is valid', () => {
    expect(scoreMutants([mutant('CompileError')]).score).toBeNull();
  });
});

describe('renderSummary', () => {
  it('reports scores, flags low files, and caps survivors', () => {
    const summary = renderSummary({
      sources: ['lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/d.ts'],
      results: [
        {
          file: 'lib/a.ts',
          tests: ['a.test.ts'],
          mutants: [
            mutant('Killed'),
            mutant('Survived', 7),
            mutant('Survived', 9),
          ],
        },
        { file: 'lib/b.ts', tests: ['b.test.ts'], mutants: [mutant('Killed')] },
      ],
      untested: ['lib/c.ts'],
      skipped: ['lib/d.ts'],
      lowScore: 60,
      survivorsPerFile: 1,
    });

    expect(summary).toContain('| `lib/a.ts` | 33.3% (low) | 1 | 2 | 1 |');
    expect(summary).toContain('| `lib/b.ts` | 100% | 1 | 0 | 1 |');
    expect(summary).toContain('- L7 ConditionalExpression → `true`');
    expect(summary).not.toContain('L9');
    expect(summary).toContain('…and 1 more');
    expect(summary).not.toContain('Survivors in `lib/b.ts`');
    expect(summary).toContain(
      '### Selection failed: no runtime test import path\n\n- `lib/c.ts`'
    );
    expect(summary).toContain('### Skipped (file cap)\n\n- `lib/d.ts`');
  });

  it('says so when nothing high-risk changed', () => {
    expect(
      renderSummary({
        sources: [],
        results: [],
        untested: [],
        skipped: [],
        lowScore: 60,
      })
    ).toContain('Skipped: no applicable changed high-risk source files.');
  });
});

describe('stryker.diff.config.mjs', () => {
  /** @param {string} testFiles */
  function loadConfig(testFiles) {
    const url = pathToFileURL(
      join(repoRoot, 'apps/web/stryker.diff.config.mjs')
    ).href;
    return spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { default: c } = await import(${JSON.stringify(url)}); console.log(JSON.stringify(c));`,
      ],
      {
        env: { ...process.env, STRYKER_TEST_FILES: testFiles },
        encoding: 'utf8',
      }
    );
  }

  it('runs vitest as a command, never through the vitest-runner plugin', () => {
    const run = loadConfig('lib/cron/auth.test.ts');
    expect(run.status, run.stderr).toBe(0);
    const config = JSON.parse(run.stdout);

    expect(config.testRunner).toBe('command');
    expect(config.plugins).toBeUndefined();
    expect(config.commandRunner.command).toMatch(
      /vitest\.mjs run --config vitest\.config\.fast\.mts .* 'lib\/cron\/auth\.test\.ts'$/u
    );
    expect(config.inPlace).toBe(true);
    expect(config.disableTypeChecks).toBe(false);
  });

  it('refuses to run without a test list', () => {
    const run = loadConfig('');

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('STRYKER_TEST_FILES');
  });
});

describe('mutation-diff.yml', () => {
  it('path-filters exactly the high-risk prefixes the CLI mutates', () => {
    const expected = HIGH_RISK_PREFIXES.map(prefix =>
      prefix.endsWith('/') ? `apps/web/${prefix}**` : `apps/web/${prefix}`
    ).sort();

    expect([...workflow.on.push.paths].sort()).toEqual(expected);
  });

  /**
   * Run the "Resolve files to mutate" step with a stub `gh` on PATH. The
   * stub answers the runs query with `lastSuccess` and compare with files.
   * @param {Record<string, string>} env
   * @param {string} [lastSuccess]
   */
  function resolveFiles(env, lastSuccess = '') {
    const step = workflow.jobs.mutate.steps.find(
      candidate => candidate.id === 'files'
    );
    const root = mkdtempSync(join(tmpdir(), 'mutation-diff-'));
    try {
      const bin = join(root, 'bin');
      mkdirSync(bin);
      const calls = join(root, 'calls');
      writeFileSync(
        join(bin, 'gh'),
        [
          '#!/usr/bin/env bash',
          `echo "$*" >> "${calls}"`,
          'case "$*" in',
          `  *actions/workflows/*) echo "${lastSuccess}" ;;`,
          '  *) echo "apps/web/lib/auth/gate.ts apps/web/README.md" ;;',
          'esac',
          '',
        ].join('\n')
      );
      chmodSync(join(bin, 'gh'), 0o755);
      const output = join(root, 'output');
      writeFileSync(output, '');
      const run = spawnSync('bash', ['-e', '-c', step?.run ?? ''], {
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_OUTPUT: output,
          REPO: 'JovieInc/Jovie',
          HEAD_SHA: 'head123',
          BEFORE: '',
          INPUT_FILES: '',
          ...env,
        },
        encoding: 'utf8',
      });
      expect(run.status, run.stderr).toBe(0);
      let ghCalls = '';
      try {
        ghCalls = readFileSync(calls, 'utf8');
      } catch {}
      return {
        output: readFileSync(output, 'utf8'),
        ghCalls,
        stdout: run.stdout,
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('diffs from the last successful push run through the compare API', () => {
    const result = resolveFiles(
      { EVENT: 'push', BEFORE: 'before456' },
      'ok789'
    );

    expect(result.ghCalls).toContain(
      'api repos/JovieInc/Jovie/actions/workflows/mutation-diff.yml/runs?branch=main&event=push&status=success&per_page=1'
    );
    expect(result.ghCalls).toContain(
      'api repos/JovieInc/Jovie/compare/ok789...head123'
    );
    expect(result.output).toBe(
      'files=apps/web/lib/auth/gate.ts apps/web/README.md\n'
    );
  });

  it('falls back to the push before-SHA without a successful run', () => {
    const result = resolveFiles({ EVENT: 'push', BEFORE: 'before456' });

    expect(result.ghCalls).toContain(
      'api repos/JovieInc/Jovie/compare/before456...head123'
    );
  });

  it('skips when there is no baseline commit at all', () => {
    const result = resolveFiles({ EVENT: 'push', BEFORE: '0000000000' });

    expect(result.ghCalls).not.toContain('compare/');
    expect(result.output).toBe('files=\n');
    expect(result.stdout).toContain('No baseline commit');
  });

  it('uses the dispatch input verbatim', () => {
    const result = resolveFiles({
      EVENT: 'workflow_dispatch',
      INPUT_FILES: 'apps/web/lib/cron/auth.ts',
    });

    expect(result.ghCalls).toBe('');
    expect(result.output).toBe('files=apps/web/lib/cron/auth.ts\n');
  });
});

describe('runtime mutation import graph', () => {
  const target = 'lib/auth/policy.ts';
  const modules = new Map([
    [target, 'export const allowed = false;'],
    ['lib/env-rules.ts', "export { allowed } from '@/lib/auth/policy';"],
    ['lib/barrel/index.ts', "export * from '../env-rules';"],
    [
      'lib/cycle.ts',
      "export * from './cycle-two'; export * from './env-rules';",
    ],
    ['lib/cycle-two.ts', "export * from './cycle';"],
  ]);

  it('follows aliased, relative, re-export, index and cyclic runtime paths', () => {
    const tests = new Map([
      ['tests/static.test.ts', "import { allowed } from '@/lib/env-rules';"],
      ['tests/dynamic.test.ts', "await import('../lib/barrel');"],
      ['tests/require.test.ts', "const m = require('../lib/cycle.js');"],
    ]);
    expect(findRelatedTests(target, tests, modules)).toEqual([
      'tests/static.test.ts',
      'tests/dynamic.test.ts',
      'tests/require.test.ts',
    ]);
  });

  it('does not select comments, strings, type imports, or mock-only imports', () => {
    const tests = new Map([
      [
        'tests/comments.test.ts',
        "// import '@/lib/auth/policy';\nconst text = \"import '@/lib/auth/policy'\";",
      ],
      [
        'tests/type.test.ts',
        "import type { allowed } from '@/lib/auth/policy';",
      ],
      [
        'tests/named-type.test.ts',
        "import { type allowed } from '@/lib/auth/policy';",
      ],
      [
        'tests/export-type.test.ts',
        "export type { allowed } from '@/lib/auth/policy';",
      ],
      [
        'tests/mock.test.ts',
        "import { allowed } from '@/lib/auth/policy'; vi.mock('@/lib/auth/policy', () => ({}));",
      ],
      [
        'tests/mock-dynamic.test.ts',
        "vi.mock(import('@/lib/auth/policy'), () => ({}));",
      ],
      [
        'tests/transitive-mock.test.ts',
        "import '@/lib/env-rules'; vi.mock('@/lib/auth/policy', () => ({}));",
      ],
      [
        'tests/facade-mock.test.ts',
        "import '@/lib/env-rules'; vi.mock('@/lib/env-rules', () => ({}));",
      ],
    ]);
    expect(findRelatedTests(target, tests, modules)).toEqual([]);
  });

  it('selects explicit actual imports inside partial mocks, including importOriginal', () => {
    const tests = new Map([
      [
        'tests/actual.test.ts',
        "vi.mock('@/lib/auth/policy', async () => ({ ...await vi.importActual<typeof import('@/lib/auth/policy')>('@/lib/auth/policy') }));",
      ],
      [
        'tests/original.test.ts',
        "vi.mock('@/lib/env-rules', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/env-rules')>(), other: vi.fn() })); import '@/lib/env-rules';",
      ],
    ]);
    expect(findRelatedTests(target, tests, modules)).toEqual([...tests.keys()]);
  });

  it('caches source parsing across selected targets and rejects missing sources', () => {
    const reads = [];
    const select = createTestSelector(
      new Map([['a.test.ts', "import '@/lib/env-rules';"]]),
      path => {
        reads.push(path);
        return modules.get(path) ?? null;
      }
    );
    expect(select(target)).toEqual(['a.test.ts']);
    const prior = reads.length;
    expect(select(target)).toEqual(['a.test.ts']);
    expect(reads.length).toBe(prior);
    expect(() => select('lib/auth/missing.ts')).toThrow(
      'Mutation source is missing'
    );
  });

  it('rejects aliases escaping apps/web', () => {
    expect(resolveSpecifier('@/../../outside', 'test.test.ts')).toBeNull();
  });
});

describe('mutation execution receipts', () => {
  it.each([
    [
      { success: true, numPassedTests: 0, numFailedTests: 0 },
      'zero passing tests',
    ],
    [
      { success: false, numPassedTests: 1, numFailedTests: 1 },
      'baseline failed',
    ],
    [{ success: true, numPassedTests: 2, numFailedTests: 0 }, null],
  ])('requires a passing executed baseline: %j', (receipt, failure) => {
    const root = mkdtempSync(join(tmpdir(), 'mutation-receipt-'));
    try {
      const path = join(root, 'receipt.json');
      writeFileSync(path, JSON.stringify(receipt));
      if (failure) expect(() => readExecutedTests(path)).toThrow(failure);
      else expect(readExecutedTests(path)).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains selected scope when the harness fails before producing results', () => {
    const summary = renderSummary({
      sources: ['lib/stripe/retry.ts'],
      results: [],
      untested: [],
      skipped: [],
      lowScore: 60,
      errors: [
        { file: 'lib/stripe/retry.ts', reason: 'Stryker process failed' },
      ],
    });
    expect(summary).toContain(
      'Selected 1 high-risk source file(s); completed 0.'
    );
    expect(summary).toContain('`lib/stripe/retry.ts`: Stryker process failed');
    expect(summary).not.toContain('no applicable');
  });
});

describe('mutation CLI result semantics', () => {
  /** @param {string} mode @param {string[]} [args] */
  function runFixture(mode, args = []) {
    const root = mkdtempSync(join(tmpdir(), 'mutation-cli-'));
    /** @param {string} path @param {string} text */
    const put = (path, text) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    try {
      for (const path of [
        'scripts/mutation-diff.mjs',
        'scripts/lib/mutation-diff.mjs',
        'scripts/lib/mutation-score-floor.mjs',
        'scripts/lib/mutation-floor-intake.mjs',
        'scripts/lib/linear-issue-intake.mjs',
        'scripts/lib/linear-cooldown.mjs',
        'scripts/lib/ratchet-core.mjs',
        'scripts/mutation-score-baseline.json',
      ]) {
        put(path, readFileSync(join(repoRoot, path), 'utf8'));
      }
      if (mode === 'below-floor' || mode === 'at-floor') {
        const baseline = JSON.parse(
          readFileSync(
            join(root, 'scripts/mutation-score-baseline.json'),
            'utf8'
          )
        );
        baseline.files['lib/auth/policy.ts'] = {
          measured: 100,
          floor: mode === 'at-floor' ? 100 : 1,
          valid: 1,
          runId: 1,
          sha: 'a'.repeat(40),
        };
        put('scripts/mutation-score-baseline.json', JSON.stringify(baseline));
      }
      symlinkSync(
        join(repoRoot, 'node_modules'),
        join(root, 'node_modules'),
        'dir'
      );
      if (mode !== 'missing-source') {
        put(
          'apps/web/lib/auth/policy.ts',
          mode === 'type-only'
            ? 'export type AuthMethod = "email" | "google"; export interface Actor { id: string }'
            : mode === 'malformed-source'
              ? 'export type Broken = ;'
              : mode === 'mixed-unrelated'
                ? 'export type Actor = string; export const allowed = true;'
                : 'export const allowed = true;'
        );
      }
      if (mode === 'distance-cap') {
        put('apps/web/lib/near.ts', "export { allowed } from './auth/policy';");
        put('apps/web/lib/far.ts', "export { allowed } from './near';");
        put(
          'apps/web/app/auth/generic.test.ts',
          "import { allowed } from '@/lib/far';"
        );
        put(
          'apps/web/tests/unit/lib/env/better-auth-origin.test.ts',
          "import { allowed } from '@/lib/near';"
        );
      } else {
        put(
          'apps/web/tests/policy.test.ts',
          mode === 'unrelated' || mode === 'mixed-unrelated'
            ? 'export const nothing = true;'
            : "import '@/lib/auth/policy';"
        );
      }
      put(
        'apps/web/node_modules/vitest/vitest.mjs',
        `
        import { mkdirSync, writeFileSync } from 'node:fs';
        import { resolve } from 'node:path';
        const path = process.argv[process.argv.indexOf('--outputFile') + 1];
        if (process.env.FIXTURE_MODE === 'type-only') throw new Error('type-only source reached harness');
        writeFileSync(path, JSON.stringify({ success: true, numFailedTests: 0,
          numPassedTests: process.env.FIXTURE_MODE === 'empty-tests' ? 0 : 1 }));
        mkdirSync(process.env.STRYKER_COVERAGE_DIR, { recursive: true });
        const count = process.env.FIXTURE_MODE === 'unexecuted-target' ? 0 : 1;
        const coverage = process.env.FIXTURE_MODE === 'missing-target' ? {} : {
          [resolve('lib/auth/policy.ts')]: { s: { 0: count }, f: { 0: count } }
        };
        writeFileSync(resolve(process.env.STRYKER_COVERAGE_DIR, 'coverage-final.json'), JSON.stringify(coverage));
      `
      );
      put(
        'apps/web/node_modules/.bin/stryker',
        `#!/usr/bin/env node
        const fs = require('node:fs');
        if (process.env.FIXTURE_MODE === 'failed') process.exit(1);
        if (process.env.FIXTURE_MODE === 'missing-report') process.exit(0);
        const mutants = process.env.FIXTURE_MODE === 'zero-mutants' ? [] : [{
          status: process.env.FIXTURE_MODE === 'invalid-mutants' ? 'CompileError' : process.env.FIXTURE_MODE === 'at-floor' ? 'Killed' : 'Survived',
          mutatorName: 'BooleanLiteral', replacement: 'false', location: { start: { line: 1 } }
        }];
        fs.writeFileSync(process.env.STRYKER_REPORT_FILE, JSON.stringify({ files: {
          'lib/auth/policy.ts': { mutants }
        }}));
      `
      );
      chmodSync(join(root, 'apps/web/node_modules/.bin/stryker'), 0o755);
      return spawnSync(
        process.execPath,
        [
          join(root, 'scripts/mutation-diff.mjs'),
          '--files',
          'apps/web/lib/auth/policy.ts',
          ...args,
        ],
        {
          env: { ...process.env, FIXTURE_MODE: mode },
          encoding: 'utf8',
        }
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('explicitly skips an inapplicable source without starting the harness', () => {
    const run = runFixture('failed', [
      '--files',
      'apps/web/components/Label.tsx',
    ]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('Skipped: no applicable');
  });

  it('skips a type-only high-risk file before test discovery or harness execution', () => {
    const run = runFixture('type-only');
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('Skipped: no applicable');
    expect(run.stdout).not.toContain('Selected 1');
  });

  it.each([
    ['unrelated', 'Selection failed: no runtime test import path'],
    ['mixed-unrelated', 'Selection failed: no runtime test import path'],
    ['malformed-source', 'Cannot parse mutation import graph'],
    ['missing-source', 'Mutation source is missing'],
    ['empty-tests', 'Vitest baseline executed zero passing tests'],
    [
      'unexecuted-target',
      'V8 reports no executed target statements or functions',
    ],
    ['missing-target', 'V8 did not report the selected target'],
    ['zero-mutants', 'Stryker generated zero mutants'],
    ['invalid-mutants', 'Stryker reported zero valid mutants'],
    ['missing-report', 'Stryker did not report the selected source'],
    ['failed', 'Stryker process failed'],
  ])('fails an incomplete selected run: %s', (mode, reason) => {
    const run = runFixture(mode);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stdout).toContain(reason);
    expect(run.stdout).not.toContain('no applicable');
  });

  it('keeps an unbaselined 0% score advisory and includes actual passed-test count', () => {
    const run = runFixture('survived');
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(
      '| `lib/auth/policy.ts` | 0% (low) | 0 | 1 | 1 | 1 | 1/1 / 1/1 | n/a |'
    );
  });

  it('fails a baselined file that scores under its floor', () => {
    const run = runFixture('below-floor');
    expect(run.status, run.stderr).toBe(1);
    expect(run.stdout).toContain('`lib/auth/policy.ts`: 0% is below floor 1%');
  });

  it('passes a baselined file that meets its floor', () => {
    const run = runFixture('at-floor');
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('| `lib/auth/policy.ts` | 100% | 1 | 0 | 1 |');
    expect(run.stdout).toContain('| 1/1 / 1/1 | 100% |');
    expect(run.stdout).not.toContain('Score floor regressions');
  });

  it('attempts the deduped Linear intake on a floor breach and keeps exit 1 (JOV-8857)', () => {
    // Hermetic: without a key the intake degrades to a logged no-op and
    // never reaches the network or changes the exit code.
    const previousKey = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;
    try {
      const run = runFixture('below-floor');
      expect(run.status, run.stderr).toBe(1);
      expect(run.stdout).toContain(
        '`lib/auth/policy.ts`: 0% is below floor 1%'
      );
      expect(run.stdout).toContain(
        'Linear intake (lib/auth/policy.ts): failed — missing_linear_api_key'
      );
    } finally {
      if (previousKey !== undefined) process.env.LINEAR_API_KEY = previousKey;
    }
  });

  it('keeps the nearest meaningful transitive suite ahead of broad auth routes under a cap', () => {
    const run = runFixture('distance-cap', ['--list-only', '--max-tests', '1']);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(
      'tests/unit/lib/env/better-auth-origin.test.ts'
    );
    expect(run.stdout).not.toContain('app/auth/generic.test.ts');
  });

  it('does not let a zero file cap silently avoid selected work', () => {
    const run = runFixture('survived', ['--max-files', '0']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('--max-files must be a positive integer');
  });
});

describe('selected runtime paths execute the real target', () => {
  it('rejects a planted allow-all defect through every supported import pattern', () => {
    const root = mkdtempSync(join(tmpdir(), 'mutation-graph-runtime-'));
    const target = 'lib/auth/(shell)/[tenant]/policy.ts';
    /** @param {string} path @param {string} text */
    const put = (path, text) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    try {
      symlinkSync(
        join(repoRoot, 'node_modules'),
        join(root, 'node_modules'),
        'dir'
      );
      put('package.json', JSON.stringify({ type: 'module' }));
      put(
        target,
        "export function allowed(value: string) { return value === 'safe'; }"
      );
      put(
        'lib/facade.ts',
        "export { allowed } from './auth/(shell)/[tenant]/policy';"
      );
      put('lib/barrel/index.ts', "export * from '../facade';");
      put(
        'vitest.config.fast.mts',
        `export default {
        root: ${JSON.stringify(root)},
        resolve: { alias: { '@': ${JSON.stringify(root)} } },
        test: { environment: 'node', include: ['tests/*.test.ts'], coverage: { thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } } }
      };`
      );
      put(
        'vitest.config.mutation.mjs',
        readFileSync(
          join(repoRoot, 'apps/web/vitest.config.mutation.mjs'),
          'utf8'
        )
      );
      const check =
        "it('rejects unsafe origin', () => expect(allowed('unsafe')).toBe(false));";
      const imports = new Map([
        [
          'tests/alias.test.ts',
          "import { allowed } from '@/lib/auth/(shell)/[tenant]/policy';",
        ],
        [
          'tests/do-mock.test.ts',
          "import { allowed } from '@/lib/auth/(shell)/[tenant]/policy'; vi.doMock('@/lib/auth/(shell)/[tenant]/policy', () => ({ allowed: () => false }));",
        ],
        [
          'tests/unmock.test.ts',
          "vi.mock('@/lib/auth/(shell)/[tenant]/policy', () => ({ allowed: () => false })); vi.unmock('../lib/auth/(shell)/[tenant]/policy'); import { allowed } from '@/lib/auth/(shell)/[tenant]/policy';",
        ],
        [
          'tests/quoted-spy.test.ts',
          "vi.mock('@/lib/auth/(shell)/[tenant]/policy', { 'spy': true }); import { allowed } from '@/lib/auth/(shell)/[tenant]/policy';",
        ],
        [
          'tests/spy.test.ts',
          "vi.mock('@/lib/auth/(shell)/[tenant]/policy', { spy: true }); import { allowed } from '@/lib/auth/(shell)/[tenant]/policy';",
        ],
        [
          'tests/relative.test.ts',
          "import { allowed } from '../lib/auth/(shell)/[tenant]/policy.js';",
        ],
        ['tests/barrel.test.ts', "import { allowed } from '@/lib/barrel';"],
        [
          'tests/dynamic.test.ts',
          "const { allowed } = await import('@/lib/facade');",
        ],
        [
          'tests/require.test.ts',
          "const { allowed } = require('../lib/auth/(shell)/[tenant]/policy.ts');",
        ],
        [
          'tests/actual.test.ts',
          "vi.mock('@/lib/auth/(shell)/[tenant]/policy', () => ({ allowed: () => false })); const { allowed } = await vi.importActual<typeof import('@/lib/auth/(shell)/[tenant]/policy')>('@/lib/auth/(shell)/[tenant]/policy');",
        ],
        [
          'tests/original.test.ts',
          "vi.mock('@/lib/facade', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/facade')>(), helper: vi.fn() })); import { allowed } from '@/lib/facade';",
        ],
      ]);
      const tests = new Map();
      for (const [path, contents] of imports) {
        const text = `import { expect, it, vi } from 'vitest';\n${contents}\n${check}`;
        tests.set(path, text);
        put(path, text);
      }
      const mockOnly = 'tests/mock-only.test.ts';
      const mockText = `import { expect, it, vi } from 'vitest';
        vi.mock('@/lib/auth/(shell)/[tenant]/policy', () => ({ allowed: () => false }));
        import { allowed } from '@/lib/auth/(shell)/[tenant]/policy'; ${check}`;
      tests.set(mockOnly, mockText);
      put(mockOnly, mockText);
      const selected = createTestSelector(
        tests,
        readModuleSource(root)
      )(target);
      expect([...selected].sort()).toEqual([...imports.keys()].sort());
      const receipt = join(root, 'receipt.json');
      const run = () =>
        spawnSync(
          process.execPath,
          [
            join(repoRoot, 'node_modules/vitest/vitest.mjs'),
            'run',
            '--config',
            join(root, 'vitest.config.mutation.mjs'),
            '--reporter',
            'json',
            '--outputFile',
            receipt,
            ...selected,
          ],
          {
            cwd: root,
            encoding: 'utf8',
            timeout: 30_000,
            env: {
              ...process.env,
              STRYKER_MUTATION_SOURCE: target,
              STRYKER_COVERAGE_DIR: join(root, 'target-coverage'),
            },
          }
        );
      const baseline = run();
      expect(baseline.status, baseline.stderr + baseline.stdout).toBe(0);
      expect(readExecutedTests(receipt)).toBe(imports.size);
      expect(
        readTargetExecution(
          join(root, 'target-coverage/coverage-final.json'),
          join(root, target)
        ).executedFunctions
      ).toBeGreaterThan(0);
      put(target, 'export function allowed(_value: string) { return true; }');
      const defective = run();
      expect(defective.status, defective.stderr + defective.stdout).toBe(1);
      const report = JSON.parse(readFileSync(receipt, 'utf8'));
      expect(report.numFailedTests).toBe(imports.size);
      expect(report.numPassedTests).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('target V8 receipt rejects phantom runtime relationships', () => {
  it.each(['dead-dynamic', 'setup-mock', 'helper-mock'])(
    'does not confuse a passing test with executed target code: %s',
    mode => {
      const root = mkdtempSync(join(tmpdir(), 'mutation-target-execution-'));
      const target = 'lib/auth/policy.ts';
      const put = (path, text) => {
        mkdirSync(join(root, path, '..'), { recursive: true });
        writeFileSync(join(root, path), text);
      };
      try {
        symlinkSync(
          join(repoRoot, 'node_modules'),
          join(root, 'node_modules'),
          'dir'
        );
        put('package.json', JSON.stringify({ type: 'module' }));
        put(
          target,
          "export function allowed(value: string) { return value === 'safe'; }"
        );
        const mock =
          "import { vi } from 'vitest'; vi.mock('@/lib/auth/policy', () => ({ allowed: () => false }));";
        put('tests/helper.ts', mock);
        put('tests/setup.ts', mock);
        put(
          'vitest.config.fast.mts',
          `export default {
        root: ${JSON.stringify(root)}, resolve: { alias: { '@': ${JSON.stringify(root)} } },
        test: { environment: 'node', include: ['tests/*.test.ts'],
          setupFiles: ${JSON.stringify(mode === 'setup-mock' ? [join(root, 'tests/setup.ts')] : [])},
          coverage: { thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } } }
      };`
        );
        put(
          'vitest.config.mutation.mjs',
          readFileSync(
            join(repoRoot, 'apps/web/vitest.config.mutation.mjs'),
            'utf8'
          )
        );
        const text =
          mode === 'dead-dynamic'
            ? "import { expect, it } from 'vitest'; async function neverCalled() { return import('@/lib/auth/policy'); } it('passes unrelated behavior', () => expect(2 + 2).toBe(4));"
            : `import { expect, it } from 'vitest'; ${mode === 'helper-mock' ? "import './helper';" : ''} import { allowed } from '@/lib/auth/policy'; it('observes factory mock', () => expect(allowed('unsafe')).toBe(false));`;
        put('tests/policy.test.ts', text);
        const selected = createTestSelector(
          new Map([['tests/policy.test.ts', text]]),
          readModuleSource(root)
        )(target);
        expect(selected).toEqual(['tests/policy.test.ts']);
        const receipt = join(root, 'tests.json');
        const run = spawnSync(
          process.execPath,
          [
            join(repoRoot, 'node_modules/vitest/vitest.mjs'),
            'run',
            '--config',
            join(root, 'vitest.config.mutation.mjs'),
            '--reporter',
            'json',
            '--outputFile',
            receipt,
            ...selected,
          ],
          {
            cwd: root,
            encoding: 'utf8',
            timeout: 30_000,
            env: {
              ...process.env,
              STRYKER_MUTATION_SOURCE: target,
              STRYKER_COVERAGE_DIR: join(root, 'target-coverage'),
            },
          }
        );
        expect(run.status, run.stderr + run.stdout).toBe(0);
        expect(readExecutedTests(receipt)).toBe(1);
        expect(() =>
          readTargetExecution(
            join(root, 'target-coverage/coverage-final.json'),
            join(root, target)
          )
        ).toThrow(
          /V8 (?:reports no executed target|did not report the selected target)/u
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
});

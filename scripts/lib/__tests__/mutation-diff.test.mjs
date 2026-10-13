import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  findRelatedTests,
  HIGH_RISK_PREFIXES,
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

    expect(findRelatedTests('lib/cron/auth.ts', tests)).toEqual([
      'lib/cron/auth.test.ts',
      'tests/unit/actual.test.ts',
      'tests/unit/static.test.ts',
    ]);
  });

  it('matches directory imports to index files', () => {
    const tests = new Map([
      ['tests/unit/e.test.ts', "import { e } from '@/lib/entitlements';"],
    ]);

    expect(findRelatedTests('lib/entitlements/index.ts', tests)).toEqual([
      'tests/unit/e.test.ts',
    ]);
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
      '### No test imports these files\n\n- `lib/c.ts`'
    );
    expect(summary).toContain('### Skipped (file cap)\n\n- `lib/d.ts`');
  });

  it('says so when nothing high-risk changed', () => {
    expect(
      renderSummary({ results: [], untested: [], skipped: [], lowScore: 60 })
    ).toContain('No changed high-risk source files.');
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
      /vitest\.mjs run --config vitest\.config\.fast\.mts .* lib\/cron\/auth\.test\.ts$/u
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

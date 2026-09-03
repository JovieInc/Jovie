import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASELINE_SCHEMA_VERSION,
  compareWithBaseline,
  compilerRunHasParseableDiagnostics,
  describeUnusableCompilerRun,
  evaluateTypecheckBaseline,
  hasUnparseableTscFailure,
  isSupportedTypecheckNode,
  parseTscOutput,
} from '../../typecheck-scripts.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** Build the ErrorCounts Map shape used by the runner. */
function counts(entries) {
  return new Map(
    Object.entries(entries).map(([file, byCode]) => [
      file,
      new Map(Object.entries(byCode)),
    ])
  );
}

describe('scripts-typecheck: parseTscOutput', () => {
  it('counts errors per (file, code) and normalizes paths repo-relative', () => {
    const output = [
      `${REPO_ROOT}/scripts/a.mjs(3,10): error TS2305: Module '"node:fs"' has no exported member 'chdirSync'.`,
      `${REPO_ROOT}/scripts/a.mjs(9,5): error TS2305: Module '"node:path"' has no exported member 'nope'.`,
      `${REPO_ROOT}/scripts/b.mjs(1,1): error TS2339: Property 'x' does not exist.`,
      "error TS2688: Cannot find type definition file for 'node'.",
      '  The file is in the program because:',
      '    Entry point of type library',
    ].join('\n');
    const { counts: parsed, globalErrors } = parseTscOutput(output);

    expect(parsed.get('scripts/a.mjs')?.get('TS2305')).toBe(2);
    expect(parsed.get('scripts/b.mjs')?.get('TS2339')).toBe(1);
    expect(globalErrors).toHaveLength(1);
    expect(globalErrors[0]).toContain('TS2688');
  });

  it('handles tsc output with no errors', () => {
    const { counts: parsed, globalErrors } = parseTscOutput('');
    expect(parsed.size).toBe(0);
    expect(globalErrors).toHaveLength(0);
  });
});

describe('scripts-typecheck: compilerRunHasParseableDiagnostics', () => {
  it('treats a clean status-0 compile as authoritative even with an empty parse', () => {
    expect(
      compilerRunHasParseableDiagnostics({
        status: 0,
        counts: new Map(),
        globalErrors: [],
      })
    ).toBe(true);
  });

  it('treats parseable file or global diagnostics as authoritative on a nonzero exit', () => {
    expect(
      compilerRunHasParseableDiagnostics({
        status: 1,
        counts: counts({ 'scripts/a.mjs': { TS2305: 1 } }),
        globalErrors: [],
      })
    ).toBe(true);
    expect(
      compilerRunHasParseableDiagnostics({
        status: 1,
        counts: new Map(),
        globalErrors: [
          "error TS2688: Cannot find type definition file for 'node'.",
        ],
      })
    ).toBe(true);
  });

  it('rejects a nonzero compiler exit with no parseable TypeScript diagnostics', () => {
    expect(
      compilerRunHasParseableDiagnostics({
        status: 1,
        counts: new Map(),
        globalErrors: [],
      })
    ).toBe(false);
    expect(
      compilerRunHasParseableDiagnostics({
        status: 137,
        counts: new Map(),
        globalErrors: [],
      })
    ).toBe(false);
    expect(isSupportedTypecheckNode('v22.23.1')).toBe(true);
    expect(isSupportedTypecheckNode('v20.19.0')).toBe(false);
    expect(
      describeUnusableCompilerRun({
        status: 1,
        output: '',
        prefix: 'web-test-typecheck',
      })
    ).toContain('without parseable TypeScript diagnostics');
  });
});

describe('scripts-typecheck: compareWithBaseline', () => {
  it('passes when current errors exactly match the baseline', () => {
    const current = counts({ 'scripts/a.mjs': { TS2305: 1, TS2339: 2 } });
    const baseline = {
      files: { 'scripts/a.mjs': { TS2305: 1, TS2339: 2 } },
    };
    const result = compareWithBaseline(current, baseline);
    expect(result.ok).toBe(true);
    expect(result.newErrors).toHaveLength(0);
    expect(result.staleEntries).toHaveLength(0);
  });

  it('fails on an error in a file not present in the baseline (chdirSync class)', () => {
    const current = counts({ 'scripts/new-monitor.mjs': { TS2305: 1 } });
    const result = compareWithBaseline(current, { files: {} });
    expect(result.ok).toBe(false);
    expect(result.newErrors).toEqual([
      {
        file: 'scripts/new-monitor.mjs',
        code: 'TS2305',
        count: 1,
        baseline: 0,
      },
    ]);
  });

  it('fails when a (file, code) count grows beyond the baseline', () => {
    const current = counts({ 'scripts/a.mjs': { TS2305: 2 } });
    const baseline = { files: { 'scripts/a.mjs': { TS2305: 1 } } };
    const result = compareWithBaseline(current, baseline);
    expect(result.ok).toBe(false);
    expect(result.newErrors).toEqual([
      { file: 'scripts/a.mjs', code: 'TS2305', count: 2, baseline: 1 },
    ]);
  });

  it('fails when the baseline is stale (shrink-only: errors fixed but baseline not regenerated)', () => {
    const current = counts({ 'scripts/a.mjs': { TS2305: 1 } });
    const baseline = {
      files: {
        'scripts/a.mjs': { TS2305: 1 },
        'scripts/fixed.mjs': { TS2339: 3 },
      },
    };
    const result = compareWithBaseline(current, baseline);
    expect(result.ok).toBe(false);
    expect(result.staleEntries).toEqual([
      { file: 'scripts/fixed.mjs', code: 'TS2339', count: 0, baseline: 3 },
    ]);
  });
});

describe('scripts-typecheck: compiler execution contract', () => {
  it('rejects a nonzero compiler exit with no parseable diagnostics', () => {
    expect(
      hasUnparseableTscFailure({
        status: 1,
        counts: counts({}),
        globalErrors: [],
      })
    ).toBe(true);
  });

  it('accepts a clean compiler exit and ordinary type-error diagnostics', () => {
    expect(
      hasUnparseableTscFailure({
        status: 0,
        counts: counts({}),
        globalErrors: [],
      })
    ).toBe(false);
    expect(
      hasUnparseableTscFailure({
        status: 2,
        counts: counts({ 'scripts/a.mjs': { TS2305: 1 } }),
        globalErrors: [],
      })
    ).toBe(false);
  });
});

describe('scripts-typecheck: lane contract', () => {
  it('baseline file is valid, totals match, counts positive', () => {
    const baseline = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, 'scripts/typecheck-baseline.json'),
        'utf8'
      )
    );
    expect(baseline.schemaVersion).toBe(BASELINE_SCHEMA_VERSION);
    expect(baseline.files).toBeTypeOf('object');
    let sum = 0;
    for (const [file, byCode] of Object.entries(baseline.files)) {
      // Keys are repo-root-relative. Besides scripts/ itself, files imported
      // by scripts/ (e.g. apps/web/scripts/*, .github/scripts/*) are covered
      // as part of the dependency graph.
      expect(file.startsWith('/')).toBe(false);
      expect(file.split('/')).not.toContain('..');
      for (const [code, count] of Object.entries(byCode)) {
        expect(code).toMatch(/^TS\d+$/);
        expect(Number.isInteger(count) && count > 0).toBe(true);
        sum += count;
      }
    }
    expect(baseline.totalErrors).toBe(sum);
  });

  it('scripts/tsconfig.json covers every script extension selected by CI', () => {
    // tsconfig.json is JSONC (header comments); strip // lines before parse.
    const raw = readFileSync(
      resolve(REPO_ROOT, 'scripts/tsconfig.json'),
      'utf8'
    );
    const stripped = raw
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
    const config = JSON.parse(stripped);
    expect(config.compilerOptions.allowJs).toBe(true);
    expect(config.compilerOptions.checkJs).toBe(true);
    expect(config.compilerOptions.noEmit).toBe(true);
    expect(config.include).toEqual(
      expect.arrayContaining(['**/*.ts', '**/*.mts', '**/*.mjs', '**/*.cts'])
    );
  });

  it('ci-fast lanes include the scripts-typecheck lane wired to the package script', () => {
    const lanes = readFileSync(
      resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs'),
      'utf8'
    );
    expect(lanes).toContain("id: 'scripts-typecheck'");
    expect(lanes).toContain('pnpm run typecheck:scripts');

    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
    );
    expect(pkg.scripts['typecheck:scripts']).toBe(
      'node scripts/typecheck-scripts.mjs'
    );
    expect(pkg.scripts['typecheck:scripts:update']).toContain(
      '--update-baseline'
    );
  });
});

describe('scripts-typecheck: fail closed before baseline write (JOV-5450)', () => {
  const temporaryDirectories = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const sentinelBaseline = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    tool: 'scripts/typecheck-scripts.mjs',
    generatedAt: '2026-01-01T00:00:00.000Z',
    totalErrors: 3,
    files: { 'scripts/a.mjs': { TS2305: 3 } },
  };

  function makeBaselineDir() {
    const directory = mkdtempSync(
      resolve(tmpdir(), 'jovie-typecheck-baseline-')
    );
    temporaryDirectories.push(directory);
    const baselineFile = resolve(directory, 'baseline.json');
    writeFileSync(
      baselineFile,
      `${JSON.stringify(sentinelBaseline, null, 2)}\n`
    );
    return { directory, baselineFile };
  }

  function captureEvaluate(options) {
    const exits = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    evaluateTypecheckBaseline({
      prefix: 'scripts-typecheck',
      tsconfig: resolve(options.directory, 'tsconfig.json'),
      updateCommand: 'pnpm run typecheck:scripts:update',
      nodeVersion: 'v22.23.1',
      exit: code => {
        exits.push(code);
      },
      ...options,
    });
    return {
      exits,
      errors: errorSpy.mock.calls.map(call => call.join(' ')).join('\n'),
      logs: logSpy.mock.calls.map(call => call.join(' ')).join('\n'),
    };
  }

  it('deliberate-red: missing compiler does not write a zero-error baseline', () => {
    const { directory, baselineFile } = makeBaselineDir();
    const result = captureEvaluate({
      directory,
      baselineFile,
      updateMode: true,
      tscEntrypoint: resolve(directory, 'missing-tsc'),
    });
    expect(result.exits).toEqual([1]);
    expect(result.errors).toContain('without parseable TypeScript diagnostics');
    expect(result.errors).toContain('false zero-error baseline');
    expect(JSON.parse(readFileSync(baselineFile, 'utf8'))).toEqual(
      sentinelBaseline
    );
  });

  it('deliberate-red: nonzero compiler execution with no diagnostics does not write a baseline', () => {
    const { directory, baselineFile } = makeBaselineDir();
    const result = captureEvaluate({
      directory,
      baselineFile,
      updateMode: true,
      runTsc: () => ({
        status: 1,
        output: 'FATAL ERROR: Reached heap limit Allocation failed\n',
      }),
    });
    expect(result.exits).toEqual([1]);
    expect(result.errors).toContain(
      'compiler exited 1 without parseable TypeScript diagnostics'
    );
    expect(result.errors).not.toContain('baseline is stale');
    expect(JSON.parse(readFileSync(baselineFile, 'utf8'))).toEqual(
      sentinelBaseline
    );
  });

  it('check mode fails closed on a crashed compiler instead of asking to shrink', () => {
    const { directory, baselineFile } = makeBaselineDir();
    const result = captureEvaluate({
      directory,
      baselineFile,
      updateMode: false,
      runTsc: () => ({ status: 137, output: '' }),
    });
    expect(result.exits).toEqual([1]);
    expect(result.errors).toContain('without parseable TypeScript diagnostics');
    expect(result.errors).not.toContain('baseline is stale');
    expect(JSON.parse(readFileSync(baselineFile, 'utf8'))).toEqual(
      sentinelBaseline
    );
  });

  it('refuses to write a baseline on a non-Node-22 runtime', () => {
    const { directory, baselineFile } = makeBaselineDir();
    const result = captureEvaluate({
      directory,
      baselineFile,
      updateMode: true,
      nodeVersion: 'v20.19.0',
      runTsc: () => ({ status: 0, output: '' }),
    });
    expect(result.exits).toEqual([1]);
    expect(result.errors).toContain('real Node 22 compiler run is required');
    expect(JSON.parse(readFileSync(baselineFile, 'utf8'))).toEqual(
      sentinelBaseline
    );
  });

  it('writes a shrink only after a real compiler produces parseable diagnostics', () => {
    const { directory, baselineFile } = makeBaselineDir();
    const output = `${REPO_ROOT}/scripts/a.mjs(3,10): error TS2305: Module '"node:fs"' has no exported member 'chdirSync'.`;
    const result = captureEvaluate({
      directory,
      baselineFile,
      updateMode: true,
      pretty: true,
      runTsc: () => ({ status: 1, output }),
    });
    expect(result.exits).toEqual([0]);
    const written = JSON.parse(readFileSync(baselineFile, 'utf8'));
    expect(written.totalErrors).toBe(1);
    expect(written.files).toEqual({ 'scripts/a.mjs': { TS2305: 1 } });
    expect(written.files['scripts/a.mjs'].TS2305).toBeLessThan(
      sentinelBaseline.files['scripts/a.mjs'].TS2305
    );
  });
});

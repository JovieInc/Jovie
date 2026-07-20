import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_SCHEMA_VERSION,
  compareWithBaseline,
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

  it('scripts/tsconfig.json enables checkJs over the .mjs + .ts tree', () => {
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
      expect.arrayContaining(['**/*.mjs', '**/*.ts'])
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

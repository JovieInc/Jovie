import { type PathLike, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { changedWebFiles, run } from '../../../scripts/lint-eslint-changed.mjs';

// ESLint custom rules (label casing, banned marketing copy, raw motion,
// hardcoded theme colors, icon usage) were pre-commit-only until this gate.
const repoRoot = resolve(process.cwd(), '..', '..');

describe('changed-file ESLint gate', () => {
  it('runs in required Source Validation against the PR base', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/source-validation.yml'),
      'utf8'
    );
    expect(workflow).toContain(
      'ESLINT_CHANGED_BASE="origin/${{ github.base_ref }}" pnpm --filter @jovie/web run lint:eslint:changed'
    );
  });

  it('lints whole changed files with zero warnings allowed', () => {
    const script = readFileSync(
      resolve(process.cwd(), 'scripts/lint-eslint-changed.mjs'),
      'utf8'
    );
    expect(script).toContain("'--max-warnings=0'");
    expect(script).toContain("'--diff-filter=ACMR'");
    expect(script).toMatch(/apps\\\/web\\\/\.\+\\\.\(ts\|tsx\)/);
  });
});

describe('changedWebFiles', () => {
  it('keeps only existing apps/web TS files, relative to the web root', () => {
    const diff = [
      'apps/web/app/page.tsx',
      'apps/web/lib/util.ts',
      'apps/web/styles.css',
      'apps/docs/readme.ts',
      'apps/web/deleted.ts',
      '',
    ].join('\n');
    const exists = (file: PathLike) => !String(file).endsWith('deleted.ts');

    expect(changedWebFiles(diff, { exists })).toEqual([
      'app/page.tsx',
      'lib/util.ts',
    ]);
  });
});

describe('run', () => {
  const okDiff = (stdout: string) => ({ status: 0, stdout, stderr: '' });

  it('fails when the base diff fails', () => {
    const spawn = vi
      .fn()
      .mockReturnValue({ status: 1, stdout: '', stderr: 'bad ref' });
    const error = vi.fn();
    expect(run({ baseRef: 'origin/main', spawn, error })).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('could not diff')
    );
  });

  it('exits 0 without invoking ESLint when nothing changed', () => {
    const spawn = vi.fn().mockReturnValue(okDiff('apps/docs/readme.ts\n'));
    const log = vi.fn();
    expect(run({ spawn, log })).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('no changed web TypeScript files')
    );
  });

  it('runs ESLint with zero warnings on each changed file', () => {
    const spawn = vi
      .fn()
      .mockReturnValueOnce(okDiff('apps/web/app/page.tsx\n'))
      .mockReturnValueOnce({ status: 0 });
    const log = vi.fn();
    expect(run({ spawn, log, exists: () => true })).toBe(0);
    expect(spawn).toHaveBeenLastCalledWith(
      'pnpm',
      [
        'exec',
        'eslint',
        '--max-warnings=0',
        '--no-warn-ignored',
        'app/page.tsx',
      ],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('propagates an ESLint failure status', () => {
    const spawn = vi
      .fn()
      .mockReturnValueOnce(okDiff('apps/web/app/page.tsx\n'))
      .mockReturnValueOnce({ status: 2 });
    expect(run({ spawn, exists: () => true, log: () => {} })).toBe(2);
  });
});

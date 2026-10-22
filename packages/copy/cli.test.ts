import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractCopy, registerFor } from './cli';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

describe('copy CLI with deleted files', () => {
  let fixture: string;
  const retired = 'apps/web/data/retiredCopy.ts';
  const current = 'apps/web/data/currentCopy.ts';
  const missing = 'apps/web/data/missingCopy.ts';

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: fixture, stdio: 'pipe' });
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        resolve(REPO_ROOT, 'packages/copy/cli.ts'),
        'check',
        ...args,
      ],
      { cwd: fixture, encoding: 'utf8' }
    );

  beforeAll(() => {
    fixture = mkdtempSync(resolve(tmpdir(), 'jovie-copy-deletion-'));
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Copy gate test');
    git('config', 'user.email', 'copy-test@example.com');
    mkdirSync(resolve(fixture, 'apps/web/data'), { recursive: true });
    writeFileSync(
      resolve(fixture, retired),
      "export const copy = 'Old copy.';\n"
    );
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'copy baseline');
    git('tag', 'copy-base');
    rmSync(resolve(fixture, retired));
    writeFileSync(
      resolve(fixture, current),
      "export const copy = 'Leverage your fans.';\n"
    );
    git('add', '-A');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'replace copy');
  });

  afterAll(() => {
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  it('accepts a committed deletion in diff mode', () => {
    const result = run('--diff-base', 'copy-base', retired);
    expect(`${result.stdout}${result.stderr}`).toContain('copy-gate: clean');
    expect(result.status).toBe(0);
  });

  it('still blocks added copy after a deleted file', () => {
    const result = run('--diff-base', 'copy-base', retired, current);
    expect(result.stdout).toContain(`${current}:1`);
    expect(result.stdout).toContain('blocking finding');
    expect(result.status).toBe(1);
  });

  it('fails for a missing file without diff mode', () => {
    const result = run(retired);
    expect(result.stderr).toContain('ENOENT');
    expect(result.status).toBe(1);
  });

  it('fails for a missing input that is not a committed deletion', () => {
    const result = run('--diff-base', 'copy-base', missing);
    expect(result.stderr).toContain('ENOENT');
    expect(result.status).toBe(1);
  });

  it('fails when the diff base cannot be read', () => {
    const result = run('--diff-base', 'missing-base', retired);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('copy-gate: clean');
  });
});

describe('PR delta gate extraction', () => {
  it('maps only customer-facing paths', () => {
    expect(registerFor('apps/web/data/homepageV2Copy.ts')).toBe(
      'jovie-marketing'
    );
    expect(registerFor('apps/web/lib/email/templates/welcome.tsx')).toBe(
      'jovie-transactional'
    );
    expect(registerFor('apps/web/content/legal/terms.md')).toBeUndefined();
    expect(registerFor('docs/PR_FLOW.md')).toBeUndefined();
  });

  it('pulls copy out of code and skips class lists and paths', () => {
    expect(extractCopy(`  headline: 'Leverage your fans.',`, 'x.ts')).toEqual([
      'Leverage your fans.',
    ]);
    expect(extractCopy(`className="flex items-center gap-2"`, 'x.tsx')).toEqual(
      []
    );
    expect(extractCopy(`<p>Out now everywhere</p>`, 'x.tsx')).toContain(
      'Out now everywhere'
    );
  });

  it('keeps the full customer-facing copy surface clean', () => {
    const files = execFileSync(
      'git',
      [
        'ls-files',
        'apps/web/content/**',
        'apps/web/data/*Copy.ts',
        'apps/web/lib/email/templates/**',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .filter(path => path && !path.endsWith('.json'));

    const result = spawnSync('pnpm', ['copy:check', ...files], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(`${result.stdout}${result.stderr}`).toContain('copy-gate: clean');
    expect(result.status).toBe(0);
  });
});

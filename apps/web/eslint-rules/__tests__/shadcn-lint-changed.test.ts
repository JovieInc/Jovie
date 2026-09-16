/**
 * Drives the shipped shadcn-lint-changed probe helpers.
 * A wrong repoRoot (apps/ instead of the git root) must fail: git pathspecs
 * `apps/web/**` only resolve from the repository root.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHANGED_WEB_PATHSPECS,
  changedWebTsx,
  repoRoot,
  webRoot,
} from './shadcn-lint-changed.mjs';

function gitToplevel(cwd: string): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return path.resolve(result.stdout.trim());
}

function isProductionWebTs(file: string): boolean {
  return (
    file.startsWith('apps/web/') &&
    (file.endsWith('.tsx') || file.endsWith('.ts')) &&
    !file.includes('/tests/') &&
    !file.includes('.test.') &&
    !file.includes('.stories.') &&
    !file.includes('/__tests__/')
  );
}

function findProductionWebChange(root: string): {
  sha: string;
  files: string[];
} {
  const log = spawnSync(
    'git',
    [
      'log',
      '-50',
      '--diff-filter=ACMRT',
      '--name-only',
      '--pretty=format:COMMIT %H',
      '--',
      'apps/web/components',
      'apps/web/app',
      'apps/web/lib',
    ],
    { cwd: root, encoding: 'utf8' }
  );
  expect(log.status, log.stderr).toBe(0);

  const commits: { sha: string; files: string[] }[] = [];
  let current: { sha: string; files: string[] } | null = null;
  for (const raw of log.stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('COMMIT ')) {
      if (current) commits.push(current);
      current = { sha: line.slice('COMMIT '.length).trim(), files: [] };
      continue;
    }
    if (current && isProductionWebTs(line)) current.files.push(line);
  }
  if (current) commits.push(current);

  const hit = commits.find(commit => commit.files.length > 0);
  expect(
    hit,
    'git log -50 must include a production apps/web TS/TSX change'
  ).toBeTruthy();
  return hit!;
}

describe('shadcn-lint-changed probe', () => {
  it('repoRoot is the git root, not apps/', () => {
    const toplevel = gitToplevel(webRoot);
    expect(repoRoot).toBe(toplevel);
    expect(path.basename(repoRoot)).not.toBe('apps');
    expect(repoRoot).not.toBe(path.resolve(webRoot, '..'));
    expect(webRoot).toBe(path.join(repoRoot, 'apps', 'web'));
    expect(CHANGED_WEB_PATHSPECS).toEqual([
      'apps/web/**/*.tsx',
      'apps/web/**/*.ts',
    ]);
  });

  it('sees a changed production apps/web TS file from git root and misses it from apps/', () => {
    const { sha } = findProductionWebChange(repoRoot);
    const fromGitRoot = changedWebTsx({
      repoRoot,
      diffBase: `${sha}^`,
      head: sha,
    });
    const fromApps = changedWebTsx({
      repoRoot: path.join(repoRoot, 'apps'),
      diffBase: `${sha}^`,
      head: sha,
    });

    expect(
      fromGitRoot,
      `probe at git root saw no production files for ${sha}`
    ).not.toBeNull();
    expect(
      fromGitRoot!.length,
      `probe at git root must see production web TS for ${sha}`
    ).toBeGreaterThan(0);
    expect(
      fromGitRoot!.some(file => file.endsWith('.tsx') || file.endsWith('.ts'))
    ).toBe(true);

    expect(
      fromApps === null || fromApps.length === 0,
      'cwd=apps with pathspec apps/web/** must not see repo-relative files'
    ).toBe(true);
  });
});

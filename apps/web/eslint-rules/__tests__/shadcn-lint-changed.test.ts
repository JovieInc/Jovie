/**
 * Drives the shipped shadcn-lint-changed probe helpers.
 * A wrong repoRoot (apps/ instead of the git root) must fail: git pathspecs
 * `apps/web/**` only resolve from the repository root.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  baselineViolations,
  CHANGED_WEB_PATHSPECS,
  changedWebTsx,
  main,
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

  // The probe's target needs BOTH a parent commit (`${sha}^`) and a
  // production apps/web TS change inside `git log -50`. A shallow checkout
  // (the nightly deterministic lane checks out at depth 1) guarantees
  // neither: even though git synthesizes a file list for the grafted root
  // commit, its synthetic root has no parent, so `git diff <root>^...` can
  // never resolve and the probe returns null. No test-side fix can restore
  // history. Skip that environment by the shallow flag alone (verified on
  // the live lane: the file-list conjunct alone does not fire on grafted
  // checkouts); the assertion still runs everywhere history exists (PR
  // lane, full nightly suite, local).
  it.skipIf(
    spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.trim() === 'true'
  )(
    'sees a changed production apps/web TS file from git root and misses it from apps/',
    () => {
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
    }
  );

  it.skipIf(
    spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.trim() === 'true'
  )(
    'honors a pinned diff base even when the event base ref cannot resolve',
    () => {
      const { sha } = findProductionWebChange(repoRoot);
      const files = changedWebTsx({
        repoRoot,
        event: 'pull_request',
        baseRef: 'jovie-nonexistent-base-branch',
        diffBase: `${sha}^`,
        head: sha,
      });
      expect(files).not.toBeNull();
      expect(files!.length).toBeGreaterThan(0);
    }
  );

  it('fails closed on an unavailable pinned base', () => {
    const files = changedWebTsx({
      repoRoot,
      diffBase: '0000000000000000000000000000000000000000',
    });
    expect(files).toBeNull();
  });

  it('lists a Unicode production web filename intact', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'shadcn-lint-changed-'));
    const web = path.join(root, 'apps', 'web');
    mkdirSync(path.join(web, 'components'), { recursive: true });
    const git = (args: string[]) =>
      spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        cwd: root,
        encoding: 'utf8',
      });
    expect(git(['init']).status).toBe(0);
    writeFileSync(path.join(web, 'components', 'keep.ts'), 'export {}\n');
    expect(git(['add', '-A']).status).toBe(0);
    expect(git(['commit', '-m', 'base']).status).toBe(0);
    const base = git(['rev-parse', 'HEAD']).stdout.trim();
    writeFileSync(
      path.join(web, 'components', 'café panel.tsx'),
      'export {}\n'
    );
    expect(git(['add', '-A']).status).toBe(0);
    expect(git(['commit', '-m', 'unicode']).status).toBe(0);

    const files = changedWebTsx({
      repoRoot: root,
      webRoot: web,
      diffBase: base,
    });
    expect(files).toEqual([path.join('components', 'café panel.tsx')]);
  });

  it('counts fatal parser diagnostics as violations', () => {
    const filePath = path.join(webRoot, 'components', 'Broken.tsx');
    const rel = 'components/Broken.tsx';
    const errors = baselineViolations(
      [
        {
          filePath,
          messages: [{ fatal: true, ruleId: null, message: 'parse error' }],
        },
      ],
      { files: { [rel]: 0 } }
    );
    expect(errors).toEqual([`${rel}: 1 fatal parser diagnostic(s)`]);
  });

  it('flags restyle counts above baseline and accepts counts within it', () => {
    const filePath = path.join(webRoot, 'components', 'Hud.tsx');
    const rel = 'components/Hud.tsx';
    const msg = { ruleId: 'shadcn/no-restyle', message: 'x' };
    const over = baselineViolations([{ filePath, messages: [msg, msg] }], {
      files: { [rel]: 1 },
    });
    expect(over).toEqual([`${rel}: shadcn/no-restyle 2 > baseline 1`]);
    const within = baselineViolations([{ filePath, messages: [msg] }], {
      files: { [rel]: 1 },
    });
    expect(within).toEqual([]);
  });

  it('keeps ESLint out of the non-web path and short-circuits main', async () => {
    const source = readFileSync(
      path.join(webRoot, 'eslint-rules/__tests__/shadcn-lint-changed.mjs'),
      'utf8'
    );
    expect(source).not.toMatch(/^import .*from 'eslint';/m);
    await expect(main({ files: [] })).resolves.toBe(0);
    await expect(main({ files: null })).resolves.toBe(1);
  });
});

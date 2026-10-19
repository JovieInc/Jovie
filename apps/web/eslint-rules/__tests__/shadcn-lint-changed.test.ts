/**
 * Drives the shipped shadcn-lint-changed probe helpers.
 * A wrong repoRoot (apps/ instead of the git root) must fail: git pathspecs
 * `apps/web/**` only resolve from the repository root.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

// Keep git pathspec coverage real without traversing the checkout's history.
// This repository has its own parent commits even in a depth-one CI checkout.
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'shadcn-lint-changed-'));
const fixtureWeb = path.join(fixtureRoot, 'apps', 'web');
const expectedFiles = [
  path.join('components', 'café panel.tsx'),
  path.join('components', 'changed.ts'),
];
let base: string;
let head: string;

function fixtureGit(args: string[]): string {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'user.name=fixture',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: fixtureRoot, encoding: 'utf8' }
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function writeFixtureFile(file: string): void {
  const target = path.join(fixtureRoot, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, 'export {}\n');
}

beforeAll(() => {
  fixtureGit(['init', '--template=']);
  writeFixtureFile('apps/web/components/keep.ts');
  fixtureGit(['add', '-A']);
  fixtureGit(['commit', '-m', 'base']);
  base = fixtureGit(['rev-parse', 'HEAD']);

  for (const file of [
    'apps/other.ts',
    'apps/web/components/café panel.tsx',
    'apps/web/components/changed.stories.tsx',
    'apps/web/components/changed.test.ts',
    'apps/web/components/changed.ts',
    'apps/web/tests/ignored.ts',
  ])
    writeFixtureFile(file);
  fixtureGit(['add', '-A']);
  fixtureGit(['commit', '-m', 'production and excluded files']);
  head = fixtureGit(['rev-parse', 'HEAD']);

  // A later HEAD makes ignoring the pinned range observable.
  writeFixtureFile('apps/web/components/later.ts');
  fixtureGit(['add', '-A']);
  fixtureGit(['commit', '-m', 'later change']);
});

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

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

  it('sees changed production apps/web TS files from git root and misses them from apps/', () => {
    const fromGitRoot = changedWebTsx({
      repoRoot: fixtureRoot,
      webRoot: fixtureWeb,
      diffBase: base,
      head,
    });
    const fromApps = changedWebTsx({
      repoRoot: path.join(fixtureRoot, 'apps'),
      webRoot: fixtureWeb,
      diffBase: base,
      head,
    });

    expect(fromGitRoot).toEqual(expectedFiles);
    expect(fromApps).toEqual([]);
  });

  it('honors a pinned diff base even when the event base ref cannot resolve', () => {
    const files = changedWebTsx({
      repoRoot: fixtureRoot,
      webRoot: fixtureWeb,
      event: 'pull_request',
      baseRef: 'jovie-nonexistent-base-branch',
      diffBase: base,
      head,
    });
    expect(files).toEqual(expectedFiles);
  });

  it('fails closed on an unavailable pinned base', () => {
    const files = changedWebTsx({
      repoRoot: fixtureRoot,
      webRoot: fixtureWeb,
      diffBase: '0000000000000000000000000000000000000000',
      head,
    });
    expect(files).toBeNull();
  });

  it('lists a Unicode production web filename intact', () => {
    const files = changedWebTsx({
      repoRoot: fixtureRoot,
      webRoot: fixtureWeb,
      diffBase: base,
      head,
    });
    expect(files).toContain(path.join('components', 'café panel.tsx'));
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

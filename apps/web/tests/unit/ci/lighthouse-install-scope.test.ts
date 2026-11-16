// The dashboard Lighthouse gate builds its baseline (the merge group's base)
// in place on head's node_modules, so it skips the baseline when the two
// commits install different dependencies, and then enforces the absolute
// budgets that runner noise fails. Run 43008412182 skipped on
// scripts/security/deepsec/package.json, which pnpm never installs, and
// failed on /start TBT 354 against 350. Only a real install change may skip.
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
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd(), '../..');
const SCOPE = join(REPO_ROOT, '.github/scripts/lighthouse-install-scope.mjs');
const BASELINE = join(
  REPO_ROOT,
  '.github/scripts/lighthouse-build-baseline.sh'
);

const LOCKFILE = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      typescript:
        specifier: 6.0.3
        version: 6.0.3

  apps/web:
    dependencies:
      next:
        specifier: 16.4.1
        version: 16.4.1

packages:
`;

function manifest(fields: Record<string, unknown>): string {
  return `${JSON.stringify({ private: true, ...fields }, null, 2)}\n`;
}

const BASE_TREE: Record<string, string> = {
  'pnpm-lock.yaml': LOCKFILE,
  'package.json': manifest({ name: 'root', version: '26.11.0' }),
  'apps/web/package.json': manifest({
    name: '@jovie/web',
    version: '26.11.0',
    scripts: { build: 'next build' },
    dependencies: { next: '16.4.1' },
  }),
  'apps/web/page.txt': 'base\n',
  'scripts/security/deepsec/package.json': manifest({
    name: 'deepsec-runner',
    dependencies: { deepsec: '2.3.10' },
  }),
};

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    'git',
    ['-c', 'user.email=ci@example.com', '-c', 'user.name=ci', ...args],
    { cwd, encoding: 'utf8' }
  );
  expect(result.status, `git ${args.join(' ')}: ${result.stderr}`).toBe(0);
  return result.stdout.trim();
}

function write(root: string, files: Record<string, string | null>) {
  for (const [file, text] of Object.entries(files)) {
    const target = join(root, file);
    if (text === null) {
      rmSync(target, { force: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

/** A repo with base and head commits; head applies `change` to base. */
function repo(change: Record<string, string | null>) {
  const dir = mkdtempSync(join(tmpdir(), 'lighthouse-install-scope-'));
  dirs.push(dir);
  const origin = join(dir, 'origin');
  mkdirSync(origin, { recursive: true });
  git(origin, 'init', '-q', '-b', 'main');
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  write(origin, { '.gitignore': '.next/\nnode_modules/\n', ...BASE_TREE });
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', 'base');
  const base = git(origin, 'rev-parse', 'HEAD');
  write(origin, { 'apps/web/page.txt': 'head\n', ...change });
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', 'head');
  const head = git(origin, 'rev-parse', 'HEAD');
  return { dir, origin, base, head };
}

function scope(change: Record<string, string | null>): string {
  const { origin, base, head } = repo(change);
  const result = spawnSync('node', [SCOPE, base, head], {
    cwd: origin,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

const webManifest = (fields: Record<string, unknown>) =>
  manifest({
    name: '@jovie/web',
    version: '26.11.0',
    scripts: { build: 'next build' },
    dependencies: { next: '16.4.1' },
    ...fields,
  });

describe('Lighthouse baseline install scope', () => {
  it('a release version bump installs the same dependencies', () => {
    expect(
      scope({
        'package.json': manifest({ name: 'root', version: '26.11.1' }),
        'apps/web/package.json': webManifest({ version: '26.11.1' }),
      })
    ).toBe('same');
  });

  it('a package.json outside the pnpm workspace installs nothing here', () => {
    expect(
      scope({
        'scripts/security/deepsec/package.json': manifest({
          name: 'deepsec-runner',
          dependencies: { deepsec: '2.3.12' },
        }),
      })
    ).toBe('same');
  });

  it('a script edit in a workspace package installs the same dependencies', () => {
    expect(
      scope({
        'apps/web/package.json': webManifest({
          scripts: { build: 'next build', lint: 'eslint .' },
        }),
      })
    ).toBe('same');
  });

  it('a workspace dependency change is an install change, even without the lockfile', () => {
    expect(
      scope({
        'apps/web/package.json': webManifest({
          dependencies: { next: '16.4.2' },
        }),
      })
    ).toBe('changed apps/web/package.json');
  });

  it('pnpm overrides in the root manifest are an install change', () => {
    expect(
      scope({
        'package.json': manifest({
          name: 'root',
          version: '26.11.0',
          pnpm: { overrides: { glob: '11.0.0' } },
        }),
      })
    ).toBe('changed package.json');
  });

  it.each([
    ['pnpm-lock.yaml', `${LOCKFILE}\n`],
    ['pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n"],
    ['.npmrc', 'auto-install-peers=true\n'],
    ['.nvmrc', '24\n'],
    ['patches/next@16.4.1.patch', 'diff\n'],
  ])('%s is an install change', (file, text) => {
    expect(scope({ [file]: text })).toBe(`changed ${file}`);
  });

  it('removing a workspace package manifest is an install change', () => {
    expect(scope({ 'apps/web/package.json': null })).toBe(
      'changed apps/web/package.json'
    );
  });

  it('the repo lockfile lists the web app as an importer and not deepsec', () => {
    const lockfile = readFileSync(join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8');
    expect(lockfile).toMatch(/^importers:\n\n {2}\.:\n/m);
    expect(lockfile).toMatch(/^ {2}apps\/web:$/m);
    expect(lockfile).not.toMatch(/^ {2}scripts\/security\/deepsec:$/m);
  });

  it('the baseline still builds for a version bump and skips for a lockfile change', () => {
    const run = (change: Record<string, string | null>) => {
      const { dir, origin, base, head } = repo(change);
      const bin = join(dir, 'bin');
      const temp = join(dir, 'temp');
      mkdirSync(bin, { recursive: true });
      mkdirSync(temp, { recursive: true });
      // Stands in for `pnpm --filter=@jovie/web run build`.
      writeFileSync(
        join(bin, 'pnpm'),
        '#!/usr/bin/env bash\nset -e\nmkdir -p apps/web/.next/standalone/apps/web\ncp apps/web/page.txt apps/web/.next/standalone/apps/web/server.js\n'
      );
      chmodSync(join(bin, 'pnpm'), 0o755);
      const work = join(dir, 'work');
      git(dir, 'clone', '-q', '--depth=1', `file://${origin}`, work);
      expect(git(work, 'rev-parse', 'HEAD')).toBe(head);
      const output = join(dir, 'output');
      const result = spawnSync('bash', [BASELINE, 'build'], {
        cwd: work,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: temp,
          GITHUB_OUTPUT: output,
          BASELINE_DIR: join(temp, 'baseline'),
          BASE_SHA: base,
        },
        encoding: 'utf8',
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return { stdout: result.stdout, output: readFileSync(output, 'utf8') };
    };

    const bump = run({
      'apps/web/package.json': webManifest({ version: '26.11.1' }),
    });
    expect(bump.output).toContain('built=true\n');

    const lock = run({ 'pnpm-lock.yaml': `${LOCKFILE}\n` });
    expect(lock.output).toBe('built=false\n');
    expect(lock.stdout).toContain(
      'dependency installs differ between base and head (pnpm-lock.yaml)'
    );
  });
});

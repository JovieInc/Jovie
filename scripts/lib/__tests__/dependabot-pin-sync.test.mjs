import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_FILE,
  planOverrideSync,
  refusal,
  syncOverridePins,
  workspaceDirs,
} from '../../dependabot-pin-sync.mjs';

const repo = resolve(import.meta.dirname, '../../..');
const script = join(repo, 'scripts/dependabot-pin-sync.mjs');

/**
 * @typedef {{
 *   id?: string,
 *   uses?: string,
 *   run?: string,
 *   with?: Record<string, boolean | string>,
 * }} PinSyncStep
 * @typedef {{
 *   if?: string,
 *   permissions?: Record<string, string>,
 *   steps: PinSyncStep[],
 * }} PinSyncJob
 */
const workflow = /** @type {{
 *   on: { workflow_run: { workflows: string[], types: string[] } },
 *   permissions: Record<string, string>,
 *   jobs: { prepare: PinSyncJob, commit: PinSyncJob },
 * }} */ (
  load(
    readFileSync(
      join(repo, '.github/workflows/dependabot-pin-sync.yml'),
      'utf8'
    )
  )
);
const HEAD = 'a'.repeat(40);
const REPO = 'JovieInc/Jovie';

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pin-sync-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(
    join(root, path),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
  );
}

function fixture(overrides) {
  write(
    'pnpm-workspace.yaml',
    "packages:\n  - 'apps/*'\n  - '!apps/eve-pilot'\n  - 'packages/*'\nonlyBuiltDependencies:\n  - 'esbuild'\n"
  );
  write('package.json', {
    name: 'root',
    devDependencies: { playwright: '1.60.0' },
    pnpm: { overrides },
  });
  write('apps/web/package.json', {
    dependencies: { react: '19.3.0', postcss: '^8.5.29' },
    devDependencies: { vite: '8.3.4', playwright: '1.60.0' },
  });
  write('packages/ui/package.json', {
    peerDependencies: { react: '^18.0.0 || ^19.0.0' },
    devDependencies: { vite: '8.3.4' },
  });
  write('apps/eve-pilot/package.json', { dependencies: { react: '20.0.0' } });
}

describe('planOverrideSync', () => {
  const manifests = overrides => [
    { pnpm: { overrides } },
    { dependencies: { react: '19.3.0', vite: '^8.3.4', zod: '^4.6.7' } },
    { devDependencies: { vite: '8.3.4', jsdom: 'workspace:*' } },
  ];
  it('raises an exact override to the single version the workspace declares', () => {
    const overrides = { react: '19.2.8', vite: '8.3.1' };
    expect(
      planOverrideSync({ pnpm: { overrides } }, manifests(overrides))
    ).toEqual([
      { name: 'react', from: '19.2.8', to: '19.3.0' },
      { name: 'vite', from: '8.3.1', to: '8.3.4' },
    ]);
  });
  it('never lowers a pin, and leaves range, selector and transitive pins alone', () => {
    const overrides = {
      react: '19.4.0',
      vite: '>=8.0.0',
      'express>path-to-regexp': '0.1.13',
      qs: '6.15.2',
      jsdom: '30.1.1',
    };
    expect(
      planOverrideSync({ pnpm: { overrides } }, manifests(overrides))
    ).toEqual([]);
  });
  it('refuses when workspace manifests disagree on the version', () => {
    const overrides = { vite: '8.3.1' };
    const disagree = [
      { pnpm: { overrides } },
      { dependencies: { vite: '8.3.4' } },
      { dependencies: { vite: '8.3.2' } },
    ];
    expect(planOverrideSync({ pnpm: { overrides } }, disagree)).toEqual([]);
  });
});

describe('syncOverridePins on a workspace', () => {
  it('reads only the packages block, skips the isolated pilot and rewrites package.json', () => {
    fixture({
      react: '19.2.8',
      vite: '8.3.1',
      postcss: '8.5.28',
      playwright: '1.60.0',
    });
    expect(workspaceDirs(root)).toEqual(['apps/web', 'packages/ui']);
    expect(syncOverridePins(root)).toEqual([
      { name: 'react', from: '19.2.8', to: '19.3.0' },
      { name: 'vite', from: '8.3.1', to: '8.3.4' },
      { name: 'postcss', from: '8.5.28', to: '8.5.29' },
    ]);
    const written = readFileSync(join(root, 'package.json'), 'utf8');
    expect(JSON.parse(written).pnpm.overrides).toEqual({
      react: '19.3.0',
      vite: '8.3.4',
      postcss: '8.5.29',
      playwright: '1.60.0',
    });
    expect(written.endsWith('}\n')).toBe(true);
  });
  it('leaves package.json byte-identical when nothing drifted', () => {
    fixture({ react: '19.3.0', vite: '8.3.4' });
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    expect(syncOverridePins(root)).toEqual([]);
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before);
  });
  it('the CLI reports overrides_changed through GITHUB_OUTPUT', () => {
    fixture({ react: '19.2.8' });
    const out = join(root, 'out.txt');
    writeFileSync(out, '');
    execFileSync(process.execPath, [script, 'sync', '--root', root], {
      env: { ...process.env, GITHUB_OUTPUT: out },
    });
    expect(readFileSync(out, 'utf8')).toBe('overrides_changed=true\n');
  });
});

describe('refusal', () => {
  const pr = {
    state: 'open',
    user: { login: 'dependabot[bot]' },
    head: {
      ref: 'dependabot/npm_and_yarn/runtime-non-major-abc',
      sha: HEAD,
      repo: { full_name: REPO },
    },
    base: { ref: 'main', repo: { full_name: REPO } },
  };
  const files = ['package.json', 'apps/web/package.json', 'pnpm-lock.yaml'];
  const check = (overrides = {}, changed = files, head = HEAD) =>
    refusal({
      pr: { ...pr, ...overrides },
      files: changed,
      expectedHead: head,
      repository: REPO,
    });
  it('accepts an open same-repo Dependabot npm PR at the exact head', () => {
    expect(check()).toBeNull();
  });
  it('fails closed on author, branch, fork, head drift and non-dependency files', () => {
    expect(check({ user: { login: 'itstimwhite' } })).toBe(
      'author-not-dependabot'
    );
    expect(check({ head: { ...pr.head, ref: 'feature/x' } })).toBe(
      'not-npm-dependabot-branch'
    );
    expect(
      check({ head: { ...pr.head, repo: { full_name: 'evil/fork' } } })
    ).toBe('unsafe-repository-boundary');
    expect(check({}, files, 'b'.repeat(40))).toBe('head-drift');
    expect(check({}, [...files, '.npmrc'])).toBe('non-dependency-file-changed');
    expect(check({}, [...files, '.github/workflows/ci.yml'])).toBe(
      'non-dependency-file-changed'
    );
    expect(check({ state: 'closed' })).toBe('pr-not-open');
  });
  it('allowlists only manifests and the two lockfiles', () => {
    for (const ok of [
      'package.json',
      'apps/web/package.json',
      'pnpm-lock.yaml',
      'apps/eve-pilot/pnpm-lock.yaml',
    ])
      expect(ALLOWED_FILE.test(ok)).toBe(true);
    for (const bad of [
      'pnpm-workspace.yaml',
      'patches/zod@4.6.7.patch',
      'apps/web/pnpm-lock.yaml',
      '.npmrc',
    ])
      expect(ALLOWED_FILE.test(bad)).toBe(false);
  });
  it('the commit CLI refuses files outside the allowlist before any network call', () => {
    const result = spawnSync(
      process.execPath,
      [
        script,
        'commit',
        '--repo',
        REPO,
        '--branch',
        'x',
        '--head',
        HEAD,
        '--root',
        root,
        '--files',
        'package.json,.github/workflows/ci.yml',
      ],
      { encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'unused' } }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('outside the dependency allowlist');
  });
});

describe('Dependabot Pin Sync workflow', () => {
  const jobs = workflow.jobs;
  it('runs only after Source Validation, never in merge_group or on PR code events', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_run']);
    expect(workflow.on.workflow_run).toEqual({
      workflows: ['Source Validation'],
      types: ['completed'],
    });
    expect(workflow.permissions).toEqual({});
    expect(jobs.prepare.if).toContain("actor.login == 'dependabot[bot]'");
    expect(jobs.prepare.if).toContain("'dependabot/npm_and_yarn/'");
  });
  it('keeps secrets out of the job that touches the candidate', () => {
    const prepare = JSON.stringify(jobs.prepare);
    expect(prepare).not.toContain('secrets.');
    expect(jobs.prepare.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
    for (const step of jobs.prepare.steps.filter(s =>
      s.uses?.startsWith('actions/checkout')
    ))
      expect(step.with['persist-credentials']).toBe(false);
    const commit = JSON.stringify(jobs.commit);
    expect(commit).toContain('secrets.JOVIE_BOT_PRIVATE_KEY');
    expect(commit).not.toContain('candidate');
    expect(jobs.commit.if).toBe("needs.prepare.outputs.files != ''");
  });
  it('the collect step copies only changed allowlisted files and reports them', () => {
    const step = jobs.prepare.steps.find(s => s.id === 'diff');
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: root,
        env: { PATH: process.env.PATH, HOME: root },
      });
    git('init', '-q');
    git(
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'base'
    );
    for (const file of [
      'package.json',
      'pnpm-lock.yaml',
      'apps/eve-pilot/pnpm-lock.yaml',
      'apps/web/src.ts',
    ])
      write(file, 'base\n');
    git('add', '.');
    git(
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      'commit',
      '-q',
      '-m',
      'files'
    );
    write('package.json', 'synced\n');
    write('apps/eve-pilot/pnpm-lock.yaml', 'synced\n');
    write('apps/web/src.ts', 'should never be copied\n');
    const temp = mkdtempSync(join(tmpdir(), 'pin-sync-runner-'));
    const output = join(temp, 'output');
    writeFileSync(output, '');
    execFileSync('bash', ['-e', '-c', step.run], {
      cwd: root,
      env: { PATH: process.env.PATH, RUNNER_TEMP: temp, GITHUB_OUTPUT: output },
    });
    expect(readFileSync(output, 'utf8')).toBe(
      'files=apps/eve-pilot/pnpm-lock.yaml,package.json\n'
    );
    expect(readFileSync(join(temp, 'pin-sync/package.json'), 'utf8')).toBe(
      'synced\n'
    );
    expect(
      readFileSync(join(temp, 'pin-sync/apps/eve-pilot/pnpm-lock.yaml'), 'utf8')
    ).toBe('synced\n');
    expect(() =>
      readFileSync(join(temp, 'pin-sync/apps/web/src.ts'))
    ).toThrow();
    rmSync(temp, { recursive: true, force: true });
  });
});

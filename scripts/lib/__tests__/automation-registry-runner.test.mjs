import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { selectSourceGuards } from '../../ci-fast-lanes.mjs';
import { registryCommand } from '../automation-registry-command.mjs';
import {
  REGISTRY_PATH,
  REGISTRY_SCHEMA,
} from '../automation-registry-policy.mjs';

const row = (id, overrides = {}) => ({
  id: `test:${id}`,
  status: 'live',
  owner: 'test-owner',
  runsAs: 'test-runner',
  host: 'test-host',
  purpose: `Reconcile ${id} receipts.`,
  identity: { purpose: 'reconcile-receipts', scope: `test:${id}` },
  trigger: { kind: 'eve-schedule', repo: 'Test/Registry', source: `${id}.ts` },
  metric: 'receipt age',
  receipt: { kind: 'host-local', location: `${id}.json` },
  maxStalenessMinutes: 60,
  killSwitch: 'disable this definition',
  ...overrides,
});
const legacy = row('incumbent', { identity: undefined });

const roots = [];
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);
const git = (root, ...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Registry Contract Test',
      '-c',
      'user.email=registry-test@example.invalid',
      ...args,
    ],
    {
      cwd: root,
      env: gitEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  ).trim();
const writeRegistry = (root, entries) =>
  writeFileSync(
    join(root, REGISTRY_PATH),
    `${[{ schema: REGISTRY_SCHEMA }, ...entries]
      .map(value => JSON.stringify(value))
      .join('\n')}\n`
  );
const commit = root => {
  git(root, 'add', REGISTRY_PATH);
  git(root, 'commit', '--quiet', '-m', 'registry fixture');
  return git(root, 'rev-parse', 'HEAD');
};
function fixture(entries = [legacy, row('new')]) {
  const root = mkdtempSync(join(tmpdir(), 'registry-transition-'));
  roots.push(root);
  mkdirSync(join(root, 'canon'));
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  git(root, 'init', '--quiet', '--initial-branch=main');
  writeRegistry(root, [legacy]);
  const base = commit(root);
  git(root, 'update-ref', 'refs/remotes/origin/main', base);
  writeRegistry(root, entries);
  const head = commit(root);
  return { root, base, head };
}
function eventFor(f, eventName = 'pull_request') {
  const repo = { full_name: 'Test/Registry' };
  const payload = { repository: repo };
  if (eventName === 'pull_request')
    payload.pull_request = {
      number: 17,
      base: { sha: f.base, ref: 'main', repo },
      head: { sha: f.head, repo },
    };
  if (eventName === 'merge_group')
    payload.merge_group = {
      base_sha: f.base,
      head_sha: f.head,
      base_ref: 'refs/heads/main',
      head_ref: 'refs/heads/gh-readonly-queue/main/test',
    };
  if (eventName === 'push')
    Object.assign(payload, {
      before: f.base,
      after: f.head,
      ref: 'refs/heads/main',
    });
  const path = join(f.root, 'event.json');
  const env = {
    PATH: process.env.PATH,
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: eventName,
    GITHUB_EVENT_PATH: path,
    GITHUB_SHA: f.head,
    GITHUB_REPOSITORY: repo.full_name,
    GITHUB_BASE_REF: 'main',
    GITHUB_REF:
      eventName === 'pull_request' ? 'refs/pull/17/merge' : 'refs/heads/main',
  };
  const save = () => writeFileSync(path, JSON.stringify(payload));
  save();
  return { env, payload, save };
}
const check = (f, env = {}) => registryCommand(['check-change'], f.root, env);
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('trusted Git base binding through the registry command', () => {
  it.each(['pull_request', 'merge_group', 'push'])(
    'validates real %s base and candidate commits',
    eventName => {
      const f = fixture();
      const { env } = eventFor(f, eventName);
      expect(check(f, env)).toMatchObject({
        ok: true,
        baseSha: f.base,
        headSha: f.head,
      });
    }
  );

  it('checks local committed additions against the origin/main merge base', () => {
    const f = fixture([legacy, row('manual', { identity: undefined })]);
    expect(check(f)).toMatchObject({ ok: false });
    expect(check(f).errors.join('\n')).toMatch(/identity\./);
  });

  it('checks source-PR manual updates instead of trusting the optional proposal command', () => {
    const f = fixture([{ ...legacy, maxStalenessMinutes: 90 }]);
    const { env } = eventFor(f);
    expect(check(f, env).errors.join('\n')).toMatch(/identity\./);
  });

  it('accepts a source checkout bound to the PR synthetic GITHUB_SHA', () => {
    const f = fixture();
    const { env, payload, save } = eventFor(f);
    payload.pull_request.merge_commit_sha = git(
      f.root,
      'commit-tree',
      `${f.head}^{tree}`,
      '-p',
      f.base,
      '-p',
      f.head,
      '-m',
      'synthetic merge'
    );
    env.GITHUB_SHA = payload.pull_request.merge_commit_sha;
    save();
    expect(check(f, env)).toMatchObject({
      ok: true,
      baseSha: f.base,
      headSha: f.head,
    });
    env.GITHUB_SHA = '1'.repeat(40);
    expect(check(f, env).ok).toBe(false);
  });

  it('validates the exact prepared Source Validation merge tree rather than arbitrary dirty bytes', () => {
    const f = fixture();
    const sourceHead = f.head;
    git(f.root, 'checkout', '--quiet', '-b', 'advanced-main', f.base);
    writeRegistry(f.root, [row('base-only'), legacy]);
    const trustedBase = commit(f.root);
    git(f.root, 'update-ref', 'refs/remotes/origin/main', trustedBase);
    git(f.root, 'checkout', '--quiet', '--detach', sourceHead);
    git(f.root, 'merge', '--quiet', '--no-commit', '--no-ff', trustedBase);
    const { env } = eventFor(f);
    env.SOURCE_GUARD_PREPARED = 'true';
    env.SOURCE_GUARD_TRUSTED_REF = trustedBase;
    expect(check(f, env)).toMatchObject({
      ok: true,
      baseSha: trustedBase,
      headSha: sourceHead,
    });
    env.SOURCE_GUARD_PREPARED = 'false';
    env.EXPECTED_HEAD = sourceHead;
    delete env.SOURCE_GUARD_TRUSTED_REF;
    expect(check(f, env)).toMatchObject({
      ok: true,
      baseSha: trustedBase,
      headSha: sourceHead,
    });
    env.EXPECTED_HEAD = f.base;
    expect(check(f, env).ok).toBe(false);
    env.SOURCE_GUARD_PREPARED = 'true';
    delete env.EXPECTED_HEAD;
    env.SOURCE_GUARD_TRUSTED_REF = f.base;
    expect(check(f, env).ok).toBe(false);
    env.SOURCE_GUARD_TRUSTED_REF = trustedBase;
    writeRegistry(f.root, [row('base-only'), legacy, row('unexpected-dirty')]);
    expect(check(f, env).ok).toBe(false);
  });

  it('binds local preflight synthesized PR context to its exact diff base', () => {
    const f = fixture();
    const env = {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'main',
      CI_BASE_REF: 'origin/main',
      SHADCN_LINT_DIFF_BASE: f.base,
    };
    expect(check(f, env)).toMatchObject({
      ok: true,
      baseSha: f.base,
      headSha: f.head,
    });
    env.SHADCN_LINT_DIFF_BASE = f.head;
    expect(check(f, env).ok).toBe(false);
    env.SHADCN_LINT_DIFF_BASE = f.base;
    delete env.CI_BASE_REF;
    expect(check(f, env).ok).toBe(false);
  });

  it('binds a PR merge checkout to its actual first parent when the event base is stale', () => {
    const f = fixture();
    const sourceHead = f.head;
    git(f.root, 'branch', 'proposal', sourceHead);
    git(f.root, 'checkout', '--quiet', '-b', 'updated-main', f.base);
    writeFileSync(join(f.root, 'base-marker'), 'base advanced\n');
    git(f.root, 'add', 'base-marker');
    git(f.root, 'commit', '--quiet', '-m', 'advance base');
    const actualBase = git(f.root, 'rev-parse', 'HEAD');
    git(
      f.root,
      'merge',
      '--quiet',
      '--no-ff',
      'proposal',
      '-m',
      'synthetic PR merge'
    );
    f.head = git(f.root, 'rev-parse', 'HEAD');
    const { env, payload, save } = eventFor(f);
    payload.pull_request.head.sha = sourceHead;
    save();
    expect(check(f, env)).toMatchObject({
      ok: true,
      baseSha: actualBase,
      headSha: f.head,
    });
    payload.pull_request.head.sha = f.base;
    save();
    expect(check(f, env).ok).toBe(false);
  });

  it.each([
    'missing-event',
    'invalid-event',
    'wrong-repository',
    'wrong-head',
    'missing-base',
    'unrelated-base',
  ])('fails closed on %s evidence', problem => {
    const f = fixture();
    const { env, payload, save } = eventFor(f, 'merge_group');
    if (problem === 'missing-event') delete env.GITHUB_EVENT_PATH;
    if (problem === 'invalid-event') writeFileSync(env.GITHUB_EVENT_PATH, '{');
    if (problem === 'wrong-repository')
      payload.repository.full_name = 'Other/Repository';
    if (problem === 'wrong-head') env.GITHUB_SHA = f.base;
    if (problem === 'missing-base')
      payload.merge_group.base_sha = '1'.repeat(40);
    if (problem === 'unrelated-base')
      payload.merge_group.base_sha = git(
        f.root,
        'commit-tree',
        `${f.base}^{tree}`,
        '-m',
        'unrelated base'
      );
    if (problem !== 'invalid-event') save();
    expect(check(f, env).ok).toBe(false);
    expect(check(f, env).errors.length).toBeGreaterThan(0);
  });

  it('rejects source-PR base repository mismatch and nonancestor base', () => {
    const f = fixture();
    const { env, payload, save } = eventFor(f);
    payload.pull_request.base.repo = { full_name: 'Other/Repository' };
    save();
    expect(check(f, env).ok).toBe(false);
    payload.pull_request.base.repo = { full_name: 'Test/Registry' };
    payload.pull_request.base.sha = git(
      f.root,
      'commit-tree',
      `${f.base}^{tree}`,
      '-m',
      'unrelated base'
    );
    save();
    expect(check(f, env).ok).toBe(false);
  });

  it('rejects a dirty registry instead of checking different bytes than the candidate commit', () => {
    const f = fixture();
    const { env } = eventFor(f);
    writeRegistry(f.root, [legacy, row('uncommitted')]);
    expect(check(f, env).ok).toBe(false);
  });

  it('cannot hide a committed unregistered cron with a worktree-only workflow edit', () => {
    const f = fixture();
    const workflow = '.github/workflows/unregistered.yml';
    writeFileSync(
      join(f.root, workflow),
      "on:\n  schedule:\n    - cron: '0 * * * *'\n"
    );
    git(f.root, 'add', workflow);
    f.head = commit(f.root);
    const { env } = eventFor(f);
    expect(check(f, env).ok).toBe(false);
    expect(check(f, env).errors.join('\n')).toMatch(/no live entry/);
    writeFileSync(join(f.root, workflow), 'on:\n  workflow_dispatch:\n');
    expect(check(f, env).ok).toBe(false);
  });

  it('fails closed when the bound base commit lacks the registry', () => {
    const f = fixture();
    const tree = git(f.root, 'rev-parse', `${f.base}^{tree}`);
    git(f.root, 'checkout', '--quiet', '--orphan', 'without-registry');
    git(f.root, 'rm', '--quiet', '--force', REGISTRY_PATH);
    writeFileSync(join(f.root, 'marker'), 'base without registry\n');
    git(f.root, 'add', 'marker');
    git(f.root, 'commit', '--quiet', '-m', 'unreadable base inventory');
    f.base = git(f.root, 'rev-parse', 'HEAD');
    git(f.root, 'read-tree', '--reset', '-u', tree);
    git(f.root, 'commit', '--quiet', '-m', 'candidate inventory');
    f.head = git(f.root, 'rev-parse', 'HEAD');
    const { env } = eventFor(f, 'merge_group');
    expect(check(f, env).ok).toBe(false);
  });
});

it.each(['pull_request', 'merge_group'])(
  'runs mandatory admission first in the selected %s source guard',
  eventName => {
    const modules = [
      'automation-registry.mjs',
      'automation-registry-policy.mjs',
      'automation-registry-command.mjs',
    ];
    const paths = [
      REGISTRY_PATH,
      ...modules.map(name => `scripts/lib/${name}`),
      'scripts/lib/__tests__/automation-registry-transition.test.mjs',
      'scripts/lib/__tests__/automation-registry-runner.test.mjs',
      'scripts/ci-fast-lanes.mjs',
    ];
    for (const path of paths) {
      expect(
        selectSourceGuards(eventName, [path]).some(
          guard => guard.id === 'automation-registry'
        )
      ).toBe(true);
    }
    const guard = selectSourceGuards(eventName, [REGISTRY_PATH]).find(
      item => item.id === 'automation-registry'
    );
    expect(guard.command).toMatch(
      /^node scripts\/lib\/automation-registry\.mjs check-change &&/
    );
    const f = fixture([legacy, row('manual', { identity: undefined })]);
    const { env } = eventFor(f, eventName);
    mkdirSync(join(f.root, 'scripts/lib'), { recursive: true });
    for (const name of modules)
      copyFileSync(
        fileURLToPath(new URL(`../${name}`, import.meta.url)),
        join(f.root, 'scripts/lib', name)
      );
    const run = spawnSync('bash', ['-c', guard.command], {
      cwd: f.root,
      env: { ...gitEnv, ...env },
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout)).toMatchObject({
      ok: false,
      baseSha: f.base,
      headSha: f.head,
    });
    expect(JSON.parse(run.stdout).errors.join('\n')).toMatch(/identity\./);
    expect(run.stderr).not.toMatch(/MODULE_NOT_FOUND|pnpm/);
  }
);

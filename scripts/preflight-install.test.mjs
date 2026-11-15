import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkInstallMatchesLockfile,
  INSTALL_FIX,
} from './lib/preflight-install.mjs';
import { checkPrerequisites } from './lib/preflight-prerequisites.mjs';
import { main } from './preflight-changed.mjs';

const LOCK = 'lockfileVersion: 9\n';

/** A fake checkout with a root install and an apps/web install, both matching. */
function checkout(parent, { lock = LOCK, installLock = LOCK } = {}) {
  const repo = realpathSync(mkdtempSync(path.join(parent, 'repo-')));
  writeFileSync(path.join(repo, 'pnpm-lock.yaml'), lock);
  mkdirSync(path.join(repo, 'node_modules/.pnpm'), { recursive: true });
  writeFileSync(path.join(repo, 'node_modules/.pnpm/lock.yaml'), installLock);
  mkdirSync(path.join(repo, 'apps/web/node_modules'), { recursive: true });
  return repo;
}

async function withTmp(fn) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'pf-install-')));
  try {
    return await fn(parent);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

test('a worktree with its own matching installs passes', async () =>
  withTmp(async parent => {
    const r = checkInstallMatchesLockfile({ repo: checkout(parent) });
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(r.problems, []);
  }));

test('root node_modules installed from a different lockfile fails with the fix', async () =>
  withTmp(async parent => {
    const repo = checkout(parent, { installLock: 'lockfileVersion: 8\n' });
    const r = checkInstallMatchesLockfile({ repo });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /different lockfile/);
    assert.match(r.message, /node_modules is from a different install/);
    assert.ok(r.message.includes(INSTALL_FIX));
    assert.match(
      INSTALL_FIX,
      /pnpm install --frozen-lockfile --prefer-offline/
    );
  }));

test('root node_modules without an installed lockfile copy fails', async () =>
  withTmp(async parent => {
    const repo = checkout(parent);
    rmSync(path.join(repo, 'node_modules/.pnpm/lock.yaml'));
    const r = checkInstallMatchesLockfile({ repo });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /no installed lockfile copy/);
  }));

test('missing apps/web node_modules fails', async () =>
  withTmp(async parent => {
    const repo = checkout(parent);
    rmSync(path.join(repo, 'apps/web/node_modules'), { recursive: true });
    const r = checkInstallMatchesLockfile({ repo });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /apps\/web node_modules is missing/);
  }));

test('root node_modules symlinked to another checkout fails', async () =>
  withTmp(async parent => {
    const other = checkout(parent);
    const repo = checkout(parent);
    rmSync(path.join(repo, 'node_modules'), { recursive: true });
    symlinkSync(
      path.join(other, 'node_modules'),
      path.join(repo, 'node_modules')
    );
    const r = checkInstallMatchesLockfile({ repo });
    assert.equal(r.ok, false);
    assert.match(
      r.problems.join('\n'),
      /root node_modules resolves into .*not this worktree/
    );
  }));

test('apps/web node_modules symlinked to another checkout fails', async () =>
  withTmp(async parent => {
    const other = checkout(parent);
    const repo = checkout(parent);
    rmSync(path.join(repo, 'apps/web/node_modules'), { recursive: true });
    symlinkSync(
      path.join(other, 'apps/web/node_modules'),
      path.join(repo, 'apps/web/node_modules')
    );
    const r = checkInstallMatchesLockfile({ repo });
    assert.equal(r.ok, false);
    assert.match(
      r.problems.join('\n'),
      /apps\/web node_modules resolves into .*not this worktree/
    );
  }));

test('a mixed pair (root from one checkout, apps/web from another) fails', async () =>
  withTmp(async parent => {
    const other = checkout(parent);
    const repo = checkout(parent);
    rmSync(path.join(repo, 'node_modules'), { recursive: true });
    symlinkSync(
      path.join(other, 'node_modules'),
      path.join(repo, 'node_modules')
    );
    const r = checkInstallMatchesLockfile({ repo });
    assert.equal(r.ok, false);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /root node_modules resolves into/);
  }));

test('preflight:changed fails fast before any check when the install is foreign', () =>
  withTmp(async parent => {
    const repo = checkout(parent, { installLock: 'lockfileVersion: 8\n' });
    const lines = [];
    const code = await main({
      argv: ['--repo', repo, '--no-coverage', '--no-typecheck'],
      env: {},
      log: l => lines.push(l),
    });
    assert.equal(code, 1);
    assert.ok(lines.some(l => l.includes(INSTALL_FIX)));
    assert.ok(!lines.some(l => /source guard|biome|merges cleanly/.test(l)));
  }));

function githubCliFixture(parent, help) {
  const repo = checkout(parent);
  const bin = path.join(repo, 'bin');
  mkdirSync(bin);
  symlinkSync('/bin/bash', path.join(bin, 'bash'));
  if (help !== null)
    writeFileSync(
      path.join(bin, 'gh'),
      `#!/bin/bash
printf '%s\\n' "$*" >> "$PWD/gh-receipt"
[[ "$*" == 'api --help' ]] || exit 99
${help}
`,
      { mode: 0o755 }
    );
  mkdirSync(path.join(repo, 'scripts/hooks'), { recursive: true });
  writeFileSync(
    path.join(repo, 'scripts/hooks/resolve-repo-node.sh'),
    'printf reached > child-work-receipt\n'
  );
  return { repo, env: { PATH: help === null ? bin : `${bin}:/usr/bin:/bin` } };
}

test('preflight rejects an incompatible installed gh offline before any child check', () =>
  withTmp(async parent => {
    for (const help of [
      "printf 'FLAGS\\n  --paginate Paginate\\n'",
      "printf 'FLAGS\\n  --slurp Slurp\\n'; exit 7",
      "printf 'EXAMPLES\\n  gh api --slurp\\nFLAGS\\n  --slurped Other\\n'",
    ]) {
      const { repo, env } = githubCliFixture(parent, help);
      const lines = [];
      const code = await main({
        argv: ['--repo', repo],
        env,
        log: line => lines.push(line),
      });
      assert.equal(code, 1);
      assert.equal(existsSync(path.join(repo, 'child-work-receipt')), false);
      assert.match(lines.join('\n'), /ERROR:.*must support --slurp/);
      assert.ok(lines.join('\n').includes(path.join(repo, 'bin/gh')));
      assert.match(lines.join('\n'), /existing installation/);
      assert.equal(
        readFileSync(path.join(repo, 'gh-receipt'), 'utf8'),
        'api --help\n'
      );
    }
  }));

test('preflight leaves list inspection available without probing an unsupported gh', () =>
  withTmp(async parent => {
    const { repo, env } = githubCliFixture(parent, 'exit 99');
    assert.equal(checkPrerequisites({ repo, env, list: true }).ok, true);
    assert.equal(existsSync(path.join(repo, 'gh-receipt')), false);
  }));

test('preflight retains missing-gh behavior and accepts supported gh without auth', () =>
  withTmp(async parent => {
    for (const help of [
      null,
      "printf 'FLAGS\\n  --slurp Aggregate paginated JSON\\n'",
    ]) {
      const { repo, env } = githubCliFixture(parent, help);
      const result = checkPrerequisites({ repo, env });
      assert.equal(result.ok, true, result.message);
      if (help !== null)
        assert.equal(
          readFileSync(path.join(repo, 'gh-receipt'), 'utf8'),
          'api --help\n'
        );
    }
  }));

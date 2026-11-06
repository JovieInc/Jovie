import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  resolve(import.meta.dirname, '../../../.github/workflows/pr-size-guard.yml'),
  'utf8'
);

/** @param {string} name */
function step(name) {
  const block = WORKFLOW.split(/\n(?=      - name: )/u).find(candidate =>
    candidate.startsWith(`      - name: ${name}\n`)
  );
  if (!block) throw new Error(`step "${name}" is missing`);
  return block;
}

/** @param {string} name */
function stepRunScript(name) {
  const body = step(name).match(/\n {8}run: \|\n((?: {10}.*\n?)+)/u)?.[1];
  if (!body) throw new Error(`step "${name}" has no run block`);
  return body.replace(/^ {10}/gmu, '');
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** @param {string} cwd */
function keepFixtureMaintenanceSynchronous(cwd) {
  // --refetch can repack promisor objects after fetch returns. Keep real
  // maintenance, but finish it before no-lazy-fetch assertions read the
  // snapshot packs or afterEach removes this isolated repository.
  git(cwd, ['config', 'maintenance.autoDetach', 'false']);
  git(cwd, ['config', 'gc.autoDetach', 'false']);
}

/** @param {string} cwd @param {string} message */
function commit(cwd, message) {
  writeFileSync(join(cwd, `${message}.txt`), `${message}\n`);
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-q', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

const dirs = /** @type {string[]} */ ([]);
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('PR Size Guard base resolution', () => {
  it('never judges a PR against the event base SHA', () => {
    // pull_request.base.sha is not refreshed on synchronize: #18131's run
    // archived a three-day-old base without projected-tree-budget.mjs and
    // failed with MODULE_NOT_FOUND.
    expect(step('Resolve exact PR merge base')).not.toContain(
      'github.event.pull_request.base.sha'
    );
    expect(step('Enforce projected combined-tree byte budget')).toContain(
      'PR_BASE_SHA: ${{ steps.pr-merge-base.outputs.base_tip }}'
    );
  });

  it('resolves the fetched base branch tip, not the stale event base', () => {
    const root = mkdtempSync(join(tmpdir(), 'pr-size-guard-base-'));
    dirs.push(root);
    const origin = join(root, 'origin');
    const clone = join(root, 'clone');
    execFileSync('git', ['init', '-q', '-b', 'main', origin]);
    git(origin, ['config', 'user.email', 'ci@example.com']);
    git(origin, ['config', 'user.name', 'ci']);
    commit(origin, 'root');
    git(origin, ['checkout', '-q', '-b', 'feature']);
    commit(origin, 'feature-work');
    git(origin, ['checkout', '-q', 'main']);
    commit(origin, 'main-moves-on');
    const mainTip = commit(origin, 'policy-lands');
    git(origin, ['checkout', '-q', 'feature']);
    git(origin, ['merge', '-q', '--no-edit', 'main']);
    const head = git(origin, ['rev-parse', 'HEAD']);
    execFileSync('git', ['clone', '-q', `file://${origin}`, clone]);
    git(clone, ['checkout', '-q', head]);
    const output = join(root, 'github-output');
    writeFileSync(output, '');

    execFileSync('bash', ['-c', stepRunScript('Resolve exact PR merge base')], {
      cwd: clone,
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        PR_BASE_REF: 'main',
        PR_HEAD_SHA: head,
      },
      stdio: 'pipe',
    });

    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split('='))
    );
    expect(outputs.base_tip).toBe(mainTip);
    // The PR merged main, so its only merge base is the current tip and the
    // hygiene/budget delta covers only the PR's own changes.
    expect(outputs.sha).toBe(mainTip);
  });
});

/** Run the actual workflow shell with no network or real credential. */
function workflowStep(name, cwd, env) {
  return spawnSync('bash', ['-c', stepRunScript(name)], {
    cwd,
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, GH_TOKEN: 'fixture-token', ...env },
  });
}

function shallowFixture(mainCommits = 80) {
  const root = mkdtempSync(join(tmpdir(), 'size-target-fetch-'));
  dirs.push(root);
  const source = join(root, 'source');
  const remote = join(root, 'origin.git');
  const clone = join(root, 'clone');
  execFileSync('git', ['init', '-q', '-b', 'main', source]);
  git(source, ['config', 'user.email', 'ci@example.com']);
  git(source, ['config', 'user.name', 'ci']);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(remote, ['config', 'uploadpack.allowFilter', 'true']);
  git(remote, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  git(source, ['remote', 'add', 'origin', `file://${remote}`]);
  const fixtureLib = join(source, 'scripts/lib');
  mkdirSync(fixtureLib, { recursive: true });
  for (const file of [
    'projected-tree-budget.mjs',
    'merge-group-member-policy.mjs',
    'pr-size-exclusions.mjs',
    'pr-size-guard-policy.mjs',
    'repo-hygiene-limits.mjs',
  ])
    copyFileSync(
      resolve(import.meta.dirname, '..', file),
      join(fixtureLib, file)
    );
  const rootSha = commit(source, 'root');
  git(source, ['checkout', '-q', '-b', 'feature']);
  const head = commit(source, 'feature');
  git(source, ['checkout', '-q', 'main']);
  const historicCommit = commit(source, 'historical-only');
  const historicBlob = git(source, [
    'rev-parse',
    `${historicCommit}:historical-only.txt`,
  ]);
  git(source, ['rm', '-q', 'historical-only.txt']);
  git(source, ['commit', '-q', '-m', 'remove historical file']);
  for (let i = 0; i < mainCommits; i++) commit(source, `main-${i}`);
  const base = git(source, ['rev-parse', 'HEAD']);
  git(source, ['checkout', '-q', '--orphan', 'unrelated']);
  const unrelated = commit(source, 'unrelated');
  git(source, ['tag', 'unrelated-tag']);
  git(source, [
    'push',
    '-q',
    'origin',
    `${base}:refs/heads/main`,
    `${head}:refs/pull/1/head`,
    `${unrelated}:refs/heads/unrelated`,
    'refs/tags/unrelated-tag',
  ]);
  execFileSync('git', ['init', '-q', clone]);
  keepFixtureMaintenanceSynchronous(clone);
  git(clone, ['remote', 'add', 'origin', `file://${remote}`]);
  git(clone, [
    'fetch',
    '-q',
    '--filter=blob:none',
    '--no-tags',
    '--depth=1',
    'origin',
    head,
  ]);
  git(clone, ['checkout', '-q', '--detach', head]);
  return { root, source, clone, rootSha, head, base, unrelated, historicBlob };
}

describe('targeted complete ancestry for PR Size Guard', () => {
  it('uses the exact event checkout with one targeted unshallow fetch', () => {
    const checkout = step('Check out exact PR head');
    expect(checkout).toContain('fetch-depth: 1');
    expect(checkout).toContain('persist-credentials: false');
    const script = stepRunScript('Fetch exact PR and current base ancestry');
    expect(script.match(/\bgit fetch\b/g)).toHaveLength(1);
    expect(script).toContain('--filter=blob:none --no-tags --unshallow');
    expect(script).not.toMatch(/--depth|refs\/heads\/\*/);
    expect(checkout).toContain('filter: blob:none');
    expect(
      stepRunScript('Hydrate and verify policy snapshot objects')
    ).toContain('git fetch --refetch --no-tags --no-filter');
    expect(stepRunScript('Resolve exact PR merge base')).toContain(
      '--is-shallow-repository'
    );
    expect(stepRunScript('Resolve exact PR merge base')).toContain(
      'merge-base --all'
    );
  });

  it('matches full ancestry and policy inputs while excluding unrelated refs and objects', () => {
    const f = shallowFixture();
    const before = git(f.clone, ['config', '--local', '--list']);
    const bin = join(f.root, 'bin');
    const envLog = join(f.root, 'git-env');
    mkdirSync(bin);
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/sh\nif [ "$1" = fetch ]; then printf '%s %s %s' "$GIT_CONFIG_COUNT" "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_KEY_1" > "$GIT_ENV_LOG"; fi\nexec "${realGit}" "$@"\n`,
      { mode: 0o755 }
    );
    const fetched = workflowStep(
      'Fetch exact PR and current base ancestry',
      f.clone,
      {
        PR_BASE_REF: 'main',
        PR_HEAD_SHA: f.head,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'fetch.prune',
        GIT_CONFIG_VALUE_0: 'true',
        GIT_ENV_LOG: envLog,
        PATH: `${bin}:${process.env.PATH}`,
      }
    );
    expect(fetched.status, fetched.stderr).toBe(0);
    expect(fetched.stdout + fetched.stderr).not.toContain('fixture-token');
    expect(fetched.stdout + fetched.stderr).not.toContain(
      Buffer.from('x-access-token:fixture-token').toString('base64')
    );
    expect(readFileSync(envLog, 'utf8')).toBe(
      '2 fetch.prune http.https://github.com/.extraheader'
    );
    expect(git(f.clone, ['config', '--local', '--list'])).toBe(before);
    expect(git(f.clone, ['rev-parse', '--is-shallow-repository'])).toBe(
      'false'
    );
    expect(git(f.clone, ['rev-parse', 'HEAD'])).toBe(f.head);
    expect(git(f.clone, ['show-ref'])).not.toContain('unrelated');
    expect(
      spawnSync('git', ['cat-file', '-e', f.unrelated], {
        cwd: f.clone,
        env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
      }).status
    ).not.toBe(0);
    const output = join(f.root, 'output');
    writeFileSync(output, '');
    const resolved = workflowStep('Resolve exact PR merge base', f.clone, {
      PR_BASE_REF: 'main',
      PR_HEAD_SHA: f.head,
      GITHUB_OUTPUT: output,
    });
    expect(resolved.status, resolved.stderr).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(
      `base_tip=${f.base}\nsha=${f.rootSha}\n`
    );
    const envFile = join(f.root, 'github-env');
    writeFileSync(envFile, '');
    const hydrated = workflowStep(
      'Hydrate and verify policy snapshot objects',
      f.clone,
      {
        PR_BASE_SHA: f.base,
        PR_HEAD_SHA: f.head,
        PR_MERGE_BASE: f.rootSha,
        GITHUB_ENV: envFile,
      }
    );
    expect(hydrated.status, hydrated.stderr).toBe(0);
    expect(readFileSync(envFile, 'utf8')).toBe('GIT_NO_LAZY_FETCH=1\n');
    expect(
      git(f.clone, ['--no-lazy-fetch', 'diff', '--numstat', f.rootSha, f.head])
    ).toBe(git(f.source, ['diff', '--numstat', f.rootSha, f.head]));
    expect(
      spawnSync('git', ['--no-lazy-fetch', 'cat-file', '-e', f.historicBlob], {
        cwd: f.clone,
      }).status
    ).not.toBe(0);
    expect(git(f.clone, ['config', '--local', '--list'])).toBe(before);
    const policyEnv = {
      GIT_NO_LAZY_FETCH: '1',
      RUNNER_TEMP: f.root,
      PR_BASE_SHA: f.base,
      PR_HEAD_SHA: f.head,
      PR_MERGE_BASE: f.rootSha,
    };
    const fullPolicy = workflowStep(
      'Enforce projected combined-tree byte budget',
      f.source,
      policyEnv
    );
    const targetedPolicy = workflowStep(
      'Enforce projected combined-tree byte budget',
      f.clone,
      policyEnv
    );
    expect(fullPolicy.status, fullPolicy.stderr).toBe(0);
    expect(targetedPolicy.status, targetedPolicy.stderr).toBe(0);
    expect(targetedPolicy.stdout).toBe(fullPolicy.stdout);
  });

  it('rejects failed hydration and a successful fetch that omits snapshot blobs', () => {
    for (const mode of ['fetch-fails', 'missing-blob']) {
      const f = shallowFixture(1);
      const fetched = workflowStep(
        'Fetch exact PR and current base ancestry',
        f.clone,
        {
          PR_BASE_REF: 'main',
          PR_HEAD_SHA: f.head,
        }
      );
      expect(fetched.status, fetched.stderr).toBe(0);
      const bin = join(f.root, 'fake-git');
      mkdirSync(bin);
      const realGit = execFileSync('which', ['git'], {
        encoding: 'utf8',
      }).trim();
      const code = mode === 'fetch-fails' ? 1 : 0;
      writeFileSync(
        join(bin, 'git'),
        `#!/bin/sh\nif [ "$1" = fetch ]; then exit ${code}; fi\nexec "${realGit}" "$@"\n`,
        { mode: 0o755 }
      );
      const envFile = join(f.root, 'env-negative');
      writeFileSync(envFile, '');
      const result = workflowStep(
        'Hydrate and verify policy snapshot objects',
        f.clone,
        {
          PR_BASE_SHA: f.base,
          PR_HEAD_SHA: f.head,
          PR_MERGE_BASE: f.rootSha,
          GITHUB_ENV: envFile,
          PATH: `${bin}:${process.env.PATH}`,
        }
      );
      expect(result.status, mode).not.toBe(0);
      expect(readFileSync(envFile, 'utf8')).toBe('');
    }
  });

  it('fails closed on wrong head, invalid or missing base, and missing token', () => {
    // Validation rejects these before fetch. One short clone covers the
    // three pre-fetch failures. missing-base reaches fetch, so it gets its
    // own clone. Four full 80-commit fixtures sat on the 30s timeout.
    const shared = shallowFixture(1);
    for (const change of ['wrong-head', 'invalid-base', 'missing-token']) {
      const result = workflowStep(
        'Fetch exact PR and current base ancestry',
        shared.clone,
        {
          PR_BASE_REF: change === 'invalid-base' ? '../invalid' : 'main',
          PR_HEAD_SHA: change === 'wrong-head' ? 'a'.repeat(40) : shared.head,
          GH_TOKEN: change === 'missing-token' ? '' : 'fixture-token',
        }
      );
      expect(result.status, change).not.toBe(0);
      expect(git(shared.clone, ['rev-parse', '--is-shallow-repository'])).toBe(
        'true'
      );
    }
    const fetched = shallowFixture(1);
    const missingBase = workflowStep(
      'Fetch exact PR and current base ancestry',
      fetched.clone,
      {
        PR_BASE_REF: 'missing',
        PR_HEAD_SHA: fetched.head,
        GH_TOKEN: 'fixture-token',
      }
    );
    expect(missingBase.status, 'missing-base').not.toBe(0);
    expect(git(fetched.clone, ['rev-parse', '--is-shallow-repository'])).toBe(
      'true'
    );
  });
});

function makeCommit(cwd, tree, parents, message) {
  return execFileSync(
    'git',
    ['commit-tree', tree, ...parents.flatMap(p => ['-p', p])],
    {
      cwd,
      input: `${message}\n`,
      encoding: 'utf8',
    }
  ).trim();
}

function cloneDepth(root, remote, head, depth = 1) {
  const clone = join(root, `clone-${head.slice(0, 8)}`);
  execFileSync('git', ['init', '-q', clone]);
  keepFixtureMaintenanceSynchronous(clone);
  git(clone, ['remote', 'add', 'origin', `file://${remote}`]);
  git(clone, ['fetch', '-q', '--no-tags', `--depth=${depth}`, 'origin', head]);
  git(clone, ['checkout', '-q', '--detach', head]);
  return clone;
}

it('actual fetch preserves all criss-cross merge bases and sorted selection', () => {
  const f = shallowFixture();
  const tree = git(f.source, ['rev-parse', `${f.rootSha}^{tree}`]);
  const a = makeCommit(f.source, tree, [f.rootSha], 'side-a');
  const b = makeCommit(f.source, tree, [f.rootSha], 'side-b');
  const head = makeCommit(f.source, tree, [a, b], 'merge-a-b');
  const base = makeCommit(f.source, tree, [b, a], 'merge-b-a');
  git(f.source, [
    'push',
    '-q',
    'origin',
    `${head}:refs/pull/2/head`,
    `${base}:refs/heads/cross`,
  ]);
  const clone = cloneDepth(f.root, join(f.root, 'origin.git'), head);
  const fetched = workflowStep(
    'Fetch exact PR and current base ancestry',
    clone,
    { PR_BASE_REF: 'cross', PR_HEAD_SHA: head }
  );
  expect(fetched.status, fetched.stderr).toBe(0);
  const expected = git(f.source, ['merge-base', '--all', base, head])
    .split('\n')
    .sort();
  expect(expected).toEqual([a, b].sort());
  expect(
    git(clone, ['merge-base', '--all', base, head]).split('\n').sort()
  ).toEqual(expected);
  const output = join(f.root, 'cross-output');
  writeFileSync(output, '');
  const result = workflowStep('Resolve exact PR merge base', clone, {
    PR_BASE_REF: 'cross',
    PR_HEAD_SHA: head,
    GITHUB_OUTPUT: output,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(output, 'utf8')).toBe(
    `base_tip=${base}\nsha=${expected[0]}\n`
  );
  const envFile = join(f.root, 'cross-env');
  writeFileSync(envFile, '');
  const hydrated = workflowStep(
    'Hydrate and verify policy snapshot objects',
    clone,
    {
      PR_BASE_SHA: base,
      PR_HEAD_SHA: head,
      PR_MERGE_BASE: expected[0],
      GITHUB_ENV: envFile,
    }
  );
  expect(hydrated.status, hydrated.stderr).toBe(0);
  const policyEnv = {
    RUNNER_TEMP: f.root,
    PR_BASE_SHA: base,
    PR_HEAD_SHA: head,
    PR_MERGE_BASE: expected[0],
    GIT_NO_LAZY_FETCH: '1',
  };
  const fullPolicy = workflowStep(
    'Enforce projected combined-tree byte budget',
    f.source,
    policyEnv
  );
  const partialPolicy = workflowStep(
    'Enforce projected combined-tree byte budget',
    clone,
    policyEnv
  );
  expect(fullPolicy.status, fullPolicy.stderr).toBe(0);
  expect(partialPolicy.status, partialPolicy.stderr).toBe(0);
  expect(partialPolicy.stdout).toBe(fullPolicy.stdout);
});

it('a successful shallow merge base cannot bypass the full-ancestry invariant', () => {
  const f = shallowFixture();
  const tree = git(f.source, ['rev-parse', `${f.rootSha}^{tree}`]);
  const x = makeCommit(f.source, tree, [f.rootSha], 'visible-x');
  const y = makeCommit(f.source, tree, [x], 'better-y');
  let left = y;
  let right = y;
  for (let i = 0; i < 4; i++) {
    left = makeCommit(f.source, tree, [left], `left-${i}`);
    right = makeCommit(f.source, tree, [right], `right-${i}`);
  }
  const head = makeCommit(f.source, tree, [left, x], 'shallow-head');
  const base = makeCommit(f.source, tree, [right, x], 'shallow-base');
  git(f.source, [
    'push',
    '-q',
    'origin',
    `${head}:refs/pull/3/head`,
    `${base}:refs/heads/partial`,
  ]);
  const clone = cloneDepth(f.root, join(f.root, 'origin.git'), head, 2);
  git(clone, [
    'fetch',
    '-q',
    '--no-tags',
    '--depth=2',
    'origin',
    '+refs/heads/partial:refs/remotes/origin/partial',
  ]);
  expect(git(clone, ['merge-base', base, head])).toBe(x);
  const output = join(f.root, 'partial-output');
  writeFileSync(output, '');
  expect(
    workflowStep('Resolve exact PR merge base', clone, {
      PR_BASE_REF: 'partial',
      PR_HEAD_SHA: head,
      GITHUB_OUTPUT: output,
    }).status
  ).not.toBe(0);
  const fetched = workflowStep(
    'Fetch exact PR and current base ancestry',
    clone,
    { PR_BASE_REF: 'partial', PR_HEAD_SHA: head }
  );
  expect(fetched.status, fetched.stderr).toBe(0);
  expect(git(clone, ['merge-base', base, head])).toBe(y);
  const result = workflowStep('Resolve exact PR merge base', clone, {
    PR_BASE_REF: 'partial',
    PR_HEAD_SHA: head,
    GITHUB_OUTPUT: output,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(output, 'utf8')).toBe(`base_tip=${base}\nsha=${y}\n`);
});

it('fails closed if the exact event head is no longer available from the remote', () => {
  const f = shallowFixture();
  const remote = join(f.root, 'origin.git');
  git(remote, ['update-ref', '-d', 'refs/pull/1/head']);
  git(remote, ['reflog', 'expire', '--expire=now', '--all']);
  git(remote, ['gc', '--prune=now']);
  const result = workflowStep(
    'Fetch exact PR and current base ancestry',
    f.clone,
    { PR_BASE_REF: 'main', PR_HEAD_SHA: f.head }
  );
  expect(result.status).not.toBe(0);
  expect(git(f.clone, ['rev-parse', '--is-shallow-repository'])).toBe('true');
});

it('accepts a depth-one event head that is the root commit', () => {
  const f = shallowFixture();
  const clone = cloneDepth(f.root, join(f.root, 'origin.git'), f.rootSha);
  expect(git(clone, ['rev-list', '--parents', '-n', '1', f.rootSha])).toBe(
    f.rootSha
  );
  expect(git(clone, ['rev-parse', '--is-shallow-repository'])).toBe('true');
  const result = workflowStep(
    'Fetch exact PR and current base ancestry',
    clone,
    { PR_BASE_REF: 'main', PR_HEAD_SHA: f.rootSha }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(git(clone, ['rev-parse', '--is-shallow-repository'])).toBe('false');
  expect(git(clone, ['merge-base', f.base, f.rootSha])).toBe(f.rootSha);
});

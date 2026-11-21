import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  dependencyInputDigest,
  validateDependencyWorkspace,
} from '../ci-dependency-workspace.mjs';
import { SOURCE_GUARD_POOL_SERIAL_STUB } from './fixtures/source-guard-pool-serial-stub.mjs';
import {
  interpolate,
  runInstallAndStamp,
  stepEnabled,
  stepOutputs,
} from './source-guard-composite.test-support.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const workflow = load(
  readFileSync('.github/workflows/source-validation.yml', 'utf8')
);
export const guardName =
  'Validate disk-read source contracts from trusted base';
const helper = 'scripts/lib/ci-dependency-workspace.mjs';
const actionHelper = 'scripts/lib/source-guard-action-snapshot.mjs';
const fixtureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);

// Only the network/toolchain installation boundary is simulated. Every Git
// transaction, workflow condition, guard shell and dependency receipt check
// below executes the checked-in implementation.
export function fixture(
  t,
  change,
  { conflict = false, actionGeneration = 'unchanged' } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'source-dependency-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const runner = join(root, 'runner');
  const bin = join(root, 'bin');
  for (const directory of [repo, runner, bin]) mkdirSync(directory);
  const write = (path, contents) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), contents);
  };
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...fixtureEnv,
    PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_BASE_REF: 'main',
    GITHUB_WORKSPACE: repo,
    RUNNER_TEMP: runner,
    SOURCE_FIXTURE_GUARD_LOG: join(root, 'guards.jsonl'),
    SOURCE_FIXTURE_INSTALL_LOG: join(root, 'installs.jsonl'),
    SOURCE_FIXTURE_BROWSER_LOG: join(root, 'browsers.jsonl'),
    PLAYWRIGHT_BROWSERS_PATH: '/fixture/baked/head-browsers',
  };
  const git = (...args) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: repo,
      env,
      encoding: 'utf8',
    }).trim();
  const bash = (script, extra = {}) =>
    spawnSync('bash', ['--norc', '-c', script], {
      cwd: repo,
      env: { ...env, ...extra },
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  writeFileSync(
    join(bin, 'pnpm'),
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
if (process.argv[2] === '--version') {
  console.log(JSON.parse(fs.readFileSync('package.json')).packageManager.slice(5));
} else if (process.argv.slice(2).join(' ') === '--filter=@jovie/web exec playwright install chromium') {
  fs.appendFileSync(process.env.SOURCE_FIXTURE_BROWSER_LOG, JSON.stringify({phase:process.env.SOURCE_FIXTURE_PHASE, path:process.env.PLAYWRIGHT_BROWSERS_PATH})+'\\n');
} else {
  if (process.argv.slice(2).join(' ') !== 'install --frozen-lockfile') process.exit(91);
  const put = (name, value) => { fs.mkdirSync(path.dirname(name), {recursive:true}); fs.writeFileSync(name, value); };
  put('node_modules/.modules.yaml', 'layoutVersion: 5\\n');
  put('node_modules/.pnpm/lock.yaml', fs.readFileSync('pnpm-lock.yaml'));
  put('node_modules/.bin/tsx', '#!/bin/sh\\n');
  fs.mkdirSync('apps/web/node_modules/next', {recursive:true});
  fs.appendFileSync(process.env.SOURCE_FIXTURE_INSTALL_LOG, JSON.stringify({phase:process.env.SOURCE_FIXTURE_PHASE, lock:fs.readFileSync('pnpm-lock.yaml','utf8')})+'\\n');
  if (process.env.SOURCE_FIXTURE_FAIL_INSTALL === process.env.SOURCE_FIXTURE_PHASE) process.exit(42);
}
`,
    { mode: 0o755 }
  );
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Source dependency fixture');
  git('config', 'user.email', 'source-dependency@example.invalid');
  write('.gitignore', 'node_modules/\ntmp/\n');
  write('.npmrc', 'strict-peer-dependencies=false\n');
  write('.nvmrc', `${process.version.slice(1)}\n`);
  write('package.json', '{"name":"fixture","packageManager":"pnpm@9.15.9"}\n');
  write('pnpm-workspace.yaml', 'packages: [apps/*, packages/*]\n');
  write(
    'pnpm-lock.yaml',
    'lockfileVersion: 9.0\n# original dependency graph\n'
  );
  write('apps/web/package.json', '{"name":"fixture-web"}\n');
  write('patches/fixture.patch', 'original patch\n');
  write('shared.txt', 'fork\n');
  write(helper, readFileSync(helper));
  write(
    'scripts/lib/verify-patched-dependencies.mjs',
    readFileSync('scripts/lib/verify-patched-dependencies.mjs')
  );
  write(actionHelper, readFileSync(actionHelper));
  write(
    'scripts/lib/source-action-contract.mjs',
    readFileSync('scripts/lib/source-action-contract.mjs')
  );
  const actionRoot = '.github/actions/';
  const writeActions = (generation, localPnpm = true) => {
    const setup = readFileSync(
      `${actionRoot}setup-node-pnpm/action.yml`,
      'utf8'
    );
    write(
      `${actionRoot}setup-node-pnpm/action.yml`,
      localPnpm
        ? setup
        : setup.replace(
            './.github/actions/vendor/pnpm-action-setup',
            `pnpm/action-setup@${'a'.repeat(40)}`
          )
    );
    write(
      `${actionRoot}setup-playwright/action.yml`,
      readFileSync(`${actionRoot}setup-playwright/action.yml`)
    );
    write(
      `${actionRoot}prime-node-toolcache/action.yml`,
      'runs:\n  using: composite\n  steps: []\n'
    );
    for (const subaction of ['restore', 'save']) {
      write(
        `${actionRoot}vendor/actions-cache/${subaction}/action.yml`,
        readFileSync(
          `${actionRoot}vendor/actions-cache/${subaction}/action.yml`
        )
      );
      write(
        `${actionRoot}vendor/actions-cache/dist/${subaction}-only/index.js`,
        'console.log("fixture cache");\n'
      );
    }
    if (!localPnpm) return;
    write(
      `${actionRoot}vendor/pnpm-action-setup/action.yml`,
      readFileSync(`${actionRoot}vendor/pnpm-action-setup/action.yml`)
    );
    write(
      `${actionRoot}vendor/pnpm-action-setup/dist/index.js`,
      'console.log(JSON.stringify(require("./generation.json")));\n'
    );
    write(
      `${actionRoot}vendor/pnpm-action-setup/dist/generation.json`,
      JSON.stringify({ generation })
    );
  };
  writeActions('head', actionGeneration !== 'added');
  write(
    'scripts/dependency-probe.mjs',
    `import { appendFileSync } from 'node:fs';
import { validateDependencyWorkspace } from './lib/ci-dependency-workspace.mjs';
const receipt = validateDependencyWorkspace(process.cwd());
appendFileSync(process.env.SOURCE_FIXTURE_GUARD_LOG, JSON.stringify({...receipt, browserPath:process.env.PLAYWRIGHT_BROWSERS_PATH}) + '\\n');
if (process.env.SOURCE_FIXTURE_FAIL_GUARD === 'true') process.exitCode = 43;
`
  );
  write(
    'scripts/ci-fast-lanes.mjs',
    "export const listAllChangedFiles = () => ['feature.txt'];\n" +
      "export const selectSourceGuards = () => [{id:'exact-dependency-probe',command:'node scripts/dependency-probe.mjs'}];\n"
  );
  // Fixture archive ships a serial pool stub (same run-all / first-failure).
  write('scripts/lib/ci-source-guard-pool.mjs', SOURCE_GUARD_POOL_SERIAL_STUB);
  git('add', '.');
  git('commit', '-qm', 'shared dependency fork');
  git('switch', '-qc', 'source-head');
  write('feature.txt', 'head source\n');
  if (conflict) write('shared.txt', 'head conflict\n');
  git('add', '.');
  git('commit', '-qm', 'PR source');
  const head = git('rev-parse', 'HEAD');
  git('switch', '-q', 'main');
  write('base-only.txt', 'new main source\n');
  if (conflict) write('shared.txt', 'main conflict\n');
  change?.(write);
  if (actionGeneration !== 'unchanged') writeActions('merged');
  git('add', '.');
  git('commit', '-qm', 'main advances');
  const base = git('rev-parse', 'HEAD');
  git('remote', 'add', 'origin', repo);
  git('update-ref', 'refs/remotes/origin/main', base);
  git('checkout', '-q', '--detach', head);
  env.EXPECTED_HEAD = head;
  const installed = bash(
    `pnpm install --frozen-lockfile && node ${helper} prepare`,
    { SOURCE_FIXTURE_PHASE: 'initial' }
  );
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const headDigest = dependencyInputDigest(repo);
  const rows = path =>
    existsSync(path)
      ? readFileSync(path, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line))
      : [];
  return {
    root,
    repo,
    runner,
    bin,
    env,
    git,
    bash,
    write,
    head,
    base,
    headDigest,
    installs: () => rows(env.SOURCE_FIXTURE_INSTALL_LOG),
    browsers: () => rows(env.SOURCE_FIXTURE_BROWSER_LOG),
    guards: () => rows(env.SOURCE_FIXTURE_GUARD_LOG),
  };
}

export function transaction(f, options = {}) {
  const steps = workflow.jobs.unit.steps;
  const start = steps.findIndex(step => step.id === 'source_guard_merge');
  const end = steps.findIndex(step => step.id === 'source_guard_proof');
  assert.ok(
    start >= 0,
    'source guards must prepare their dependency generation'
  );
  assert.ok(
    end > start,
    'source guards must finish with unconditional cleanup'
  );
  const state = {
    // Ordinary qualification flights leave reuse unset/false. Metadata reuse
    // skips this transaction entirely before these steps are considered.
    reuse: { outputs: { reuse: options.reuse ?? 'false' } },
  };
  const results = [];
  const posts = [];
  let failed = false;
  const context = {
    matrix: { shard: options.shard ?? '4/4' },
    steps: state,
    github: {
      base_ref: 'main',
      token: '',
      event: { pull_request: { head: { sha: f.head } } },
    },
    runner: { temp: f.runner, environment: 'github-hosted' },
    always: () => true,
    success: () => !failed,
    failure: () => failed,
    cancelled: () => false,
  };
  // The runner saves a local action's path, then reloads its metadata at job
  // cleanup. Exercise that lifetime with small provider payloads; the composite
  // manifests, snapshot helper, Git transaction and dependency proof are real.
  const registerPosts = (reference, phase, visited = new Set()) => {
    if (visited.has(reference)) return;
    visited.add(reference);
    const directory = join(f.repo, reference);
    const manifest = join(directory, 'action.yml');
    const action = load(readFileSync(manifest, 'utf8'));
    if (action.runs.using === 'composite') {
      for (const child of action.runs.steps) {
        if (child.uses?.startsWith('./'))
          registerPosts(child.uses, phase, visited);
      }
    } else {
      assert.ok(
        existsSync(join(directory, action.runs.main)),
        'complete local main payload'
      );
      if (action.runs.post) posts.push({ manifest, phase });
    }
  };
  for (const [index, step] of steps.slice(start, end + 1).entries()) {
    const id = step.id ?? (step.name === guardName ? 'guard' : `step_${index}`);
    state[id] = {
      outputs: stepOutputs(),
      outcome: 'skipped',
      conclusion: 'skipped',
    };
    if (!stepEnabled(step, context)) continue;
    options.beforeStep?.(id, f);
    const extra = Object.fromEntries(
      Object.entries(step.env ?? {}).map(([key, value]) => [
        key,
        interpolate(value, context),
      ])
    );
    Object.assign(extra, {
      GITHUB_OUTPUT: join(f.root, `${id}.output`),
      GITHUB_ENV: join(f.root, `${id}.env`),
      SOURCE_FIXTURE_PHASE: id,
      SOURCE_FIXTURE_FAIL_INSTALL: options.failInstall ?? '',
      SOURCE_FIXTURE_FAIL_GUARD: options.failGuard ? 'true' : 'false',
    });
    let result;
    const actionReference =
      options.legacyActionPaths && id.startsWith('source_merge_')
        ? step.uses?.replace(
            './tmp/source-guard-actions/',
            './.github/actions/'
          )
        : step.uses;
    const action = actionReference
      ? load(readFileSync(join(f.repo, actionReference, 'action.yml'), 'utf8'))
      : null;
    if (actionReference && options.capturePosts)
      registerPosts(actionReference, id);
    if (actionReference?.endsWith('/setup-playwright')) {
      const install = action.runs.steps.find(
        item => item.name === 'Install Playwright (Chromium)'
      );
      assert.ok(install, 'use the normal browser install command');
      result = f.bash(install.run, extra);
    } else if (step.uses) {
      assert.ok(actionReference.endsWith('/setup-node-pnpm'));
      // Provisioning is the only seam: use the real composite's frozen install
      // shell and receipt stamping, with a local pnpm artifact fixture.
      result = runInstallAndStamp(f, action, step.with, context, extra);
    } else {
      result = f.bash(interpolate(step.run, context), extra);
    }
    state[id].outputs = stepOutputs(extra.GITHUB_OUTPUT);
    if (existsSync(extra.GITHUB_ENV)) {
      for (const line of readFileSync(extra.GITHUB_ENV, 'utf8')
        .trim()
        .split('\n')) {
        const split = line.indexOf('=');
        if (split > 0) f.env[line.slice(0, split)] = line.slice(split + 1);
      }
    }
    state[id].outcome = state[id].conclusion =
      result.status === 0 ? 'success' : 'failure';
    failed ||= result.status !== 0;
    results.push({ id, ...result });
  }
  return {
    failed,
    results,
    state,
    runPosts: () =>
      posts.map(({ manifest, phase }) => {
        const action = load(readFileSync(manifest, 'utf8'));
        const output = execFileSync(
          process.execPath,
          [join(dirname(manifest), action.runs.post)],
          {
            cwd: f.repo,
            env: f.env,
            encoding: 'utf8',
            timeout: 5000,
          }
        );
        return { phase, ...JSON.parse(output) };
      }),
    text: results.map(r => r.stdout + r.stderr).join('\n'),
  };
}

export function restored(f) {
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(existsSync(join(f.repo, '.git/MERGE_HEAD')), false);
  assert.equal(dependencyInputDigest(f.repo), f.headDigest);
  assert.equal(
    validateDependencyWorkspace(f.repo).dependencyInputDigest,
    f.headDigest
  );
  assert.deepEqual(
    readdirSync(f.runner),
    [],
    'trusted helper directories are cleaned'
  );
}

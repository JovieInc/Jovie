import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  dependencyInputDigest,
  validateDependencyWorkspace,
} from '../ci-dependency-workspace.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const workflow = load(
  readFileSync('.github/workflows/source-validation.yml', 'utf8')
);
const guardName = 'Validate disk-read source contracts from trusted base';
const helper = 'scripts/lib/ci-dependency-workspace.mjs';
const actionHelper = 'scripts/lib/source-guard-action-snapshot.mjs';
const fixtureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);

// Only the network/toolchain installation boundary is simulated. Every Git
// transaction, workflow condition, guard shell and dependency receipt check
// below executes the checked-in implementation.
function fixture(
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
  // The normal initial install provides the pinned YAML parser. Keep that
  // actual dependency available to the helper copied into this Git fixture.
  mkdirSync(join(repo, 'node_modules'));
  symlinkSync(
    dirname(createRequire(import.meta.url).resolve('js-yaml/package.json')),
    join(repo, 'node_modules/js-yaml'),
    'dir'
  );
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
    spawnSync('bash', ['-c', script], {
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
  write(actionHelper, readFileSync(actionHelper));
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

function expression(value, context) {
  const code = value
    .trim()
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/\.([\w]+-[\w-]+)/g, (_, key) => `[${JSON.stringify(key)}]`);
  // GitHub's expression subset used by this local transaction consists of
  // property reads, comparisons, boolean operators and status functions.
  return Function(
    ...Object.keys(context),
    `return (${code});`
  )(...Object.values(context));
}

function interpolate(value, context) {
  return String(value).replace(/\$\{\{([\s\S]*?)\}\}/g, (_, code) =>
    String(expression(code, context) ?? '')
  );
}

function transaction(f, options = {}) {
  const steps = workflow.jobs.deterministic.steps;
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
  const state = {};
  const results = [];
  const posts = [];
  let failed = false;
  const context = {
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
  const enabled = (step, scope = context) => {
    if (!step.if) return scope.success();
    const explicitStatus = /\b(?:always|failure|success|cancelled)\s*\(/.test(
      step.if
    );
    return (explicitStatus || scope.success()) && expression(step.if, scope);
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
      outputs: new Proxy({}, { get: (target, key) => target[key] ?? '' }),
      outcome: 'skipped',
      conclusion: 'skipped',
    };
    if (!enabled(step)) continue;
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
      const setupContext = {
        ...context,
        success: () => true,
        failure: () => false,
        github: { ...context.github, event_name: 'pull_request' },
        inputs: {
          package_cache: 'true',
          reuse_merge_group_workspace: 'false',
          ...step.with,
        },
        steps: {
          'runner-prereqs': { outputs: { dependencies_warm: 'false' } },
        },
      };
      const install = action.runs.steps.find(
        item => item.name === 'Install dependencies'
      );
      const stamp = action.runs.steps.find(
        item => item.name === 'Stamp installed workspace receipt'
      );
      assert.ok(install && stamp, 'use the normal installed-tree producer');
      const scripts = [install, stamp]
        .filter(item => enabled(item, setupContext))
        .map(item => interpolate(item.run, setupContext));
      result = f.bash(`set -euo pipefail\n${scripts.join('\n')}`, extra);
    } else {
      result = f.bash(interpolate(step.run, context), extra);
    }
    const output = existsSync(extra.GITHUB_OUTPUT)
      ? readFileSync(extra.GITHUB_OUTPUT, 'utf8')
      : '';
    for (const line of output.trim().split('\n')) {
      const split = line.indexOf('=');
      if (split > 0)
        state[id].outputs[line.slice(0, split)] = line.slice(split + 1);
    }
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

function restored(f) {
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

for (const actionGeneration of ['added', 'changed']) {
  test(`registered ${actionGeneration} action generation survives exact-head restoration`, t => {
    const makeFixture = () =>
      fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'), {
        actionGeneration,
      });
    const f = makeFixture();
    const result = transaction(f, { capturePosts: true });
    assert.equal(result.failed, false, result.text);
    restored(f);
    assert.deepEqual(
      result
        .runPosts()
        .filter(row => row.phase === 'source_merge_dependencies'),
      [{ phase: 'source_merge_dependencies', generation: 'merged' }]
    );

    // Deliberate red control: the former live-worktree uses path either
    // disappears or silently executes the source head's older post payload.
    const legacy = makeFixture();
    const oldResult = transaction(legacy, {
      capturePosts: true,
      legacyActionPaths: true,
    });
    assert.equal(oldResult.failed, false, oldResult.text);
    restored(legacy);
    if (actionGeneration === 'added')
      assert.throws(() => oldResult.runPosts(), /ENOENT/);
    else
      assert.deepEqual(
        oldResult
          .runPosts()
          .filter(row => row.phase === 'source_merge_dependencies'),
        [{ phase: 'source_merge_dependencies', generation: 'head' }]
      );
  });
}

test('an existing action snapshot is preserved and cannot authorize merged setup', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  f.write('tmp/source-guard-actions/owner.txt', 'pre-existing local work\n');
  const result = transaction(f);
  assert.equal(result.failed, true);
  assert.match(result.text, /EEXIST/);
  assert.equal(result.state.source_merge_dependencies.outcome, 'skipped');
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(
    readFileSync(join(f.repo, 'tmp/source-guard-actions/owner.txt'), 'utf8'),
    'pre-existing local work\n'
  );
  restored(f);
});

for (const [name, change] of [
  [
    'lockfile',
    write =>
      write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n# new dependency graph\n'),
  ],
  [
    'root manifest',
    write =>
      write(
        'package.json',
        '{"name":"fixture-new","packageManager":"pnpm@9.15.9"}\n'
      ),
  ],
  [
    'workspace manifest',
    write => write('apps/web/package.json', '{"name":"fixture-web-new"}\n'),
  ],
  [
    'workspace membership',
    write =>
      write(
        'pnpm-workspace.yaml',
        'packages: [apps/*, packages/*, workers/*]\n'
      ),
  ],
  ['patch', write => write('patches/fixture.patch', 'updated patch\n')],
  [
    'pnpm pin',
    write =>
      write(
        'package.json',
        '{"name":"fixture","packageManager":"pnpm@9.15.10"}\n'
      ),
  ],
]) {
  test(`merged ${name} dependencies are qualified and exact-head dependencies restored`, t => {
    const f = fixture(t, change);
    const result = transaction(f);
    assert.equal(result.failed, false, result.text);
    assert.deepEqual(
      f.installs().map(row => row.phase),
      ['initial', 'source_merge_dependencies', 'source_head_dependencies']
    );
    assert.equal(f.guards().length, 1);
    assert.notEqual(f.guards()[0].dependencyInputDigest, f.headDigest);
    assert.equal(f.guards()[0].browserPath, '');
    assert.deepEqual(
      f.browsers().map(row => [row.phase, row.path]),
      [
        ['source_merge_browsers', ''],
        ['source_head_browsers', ''],
      ]
    );
    restored(f);
  });
}

test('unchanged dependency generation needs no second install', t => {
  const f = fixture(t);
  const result = transaction(f);
  assert.equal(result.failed, false, result.text);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(f.guards()[0].dependencyInputDigest, f.headDigest);
  assert.equal(f.guards()[0].browserPath, '/fixture/baked/head-browsers');
  assert.deepEqual(f.browsers(), []);
  restored(f);
});

test('guard failure remains failed after restoring the head and its installed tree', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'), {
    actionGeneration: 'added',
  });
  const result = transaction(f, { failGuard: true, capturePosts: true });
  assert.equal(result.failed, true);
  assert.match(result.text, /exact-dependency-probe: exit 43/);
  assert.equal(result.state.source_head_dependencies.outcome, 'success');
  restored(f);
  assert.deepEqual(result.runPosts(), [
    { phase: 'source_merge_dependencies', generation: 'merged' },
  ]);
});

test('partially failed merged install skips guards and still reinstalls exact-head dependencies', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'), {
    actionGeneration: 'added',
  });
  const result = transaction(f, {
    failInstall: 'source_merge_dependencies',
    capturePosts: true,
  });
  assert.equal(result.failed, true);
  assert.equal(f.guards().length, 0);
  assert.equal(result.state.source_merge_dependencies.outcome, 'failure');
  assert.equal(result.state.source_head_dependencies.outcome, 'success');
  restored(f);
  assert.deepEqual(result.runPosts(), [
    { phase: 'source_merge_dependencies', generation: 'merged' },
  ]);
});

test('changed Node pin cannot reuse the prior runtime receipt', t => {
  const f = fixture(t, write => write('.nvmrc', '25.0.0\n'));
  const result = transaction(f);
  // The fixture has one real Node runtime. The install seam cannot provision
  // this new pin: the unchanged strict helper rejects it, then the transaction
  // restores the original source and installed runtime receipt.
  assert.equal(result.failed, true);
  assert.match(result.text, /Node .* does not match \.nvmrc/);
  assert.equal(result.state.source_merge_dependencies.outcome, 'failure');
  assert.equal(result.state.source_head_dependencies.outcome, 'success');
  assert.equal(f.guards().length, 0);
  restored(f);
});

test('failed exact-head reinstall never turns successful merged guards into a pass', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  const result = transaction(f, { failInstall: 'source_head_dependencies' });
  assert.equal(result.failed, true);
  assert.equal(f.guards().length, 1);
  assert.equal(result.state.source_head_dependencies.outcome, 'failure');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(dependencyInputDigest(f.repo), f.headDigest);
  assert.throws(() => validateDependencyWorkspace(f.repo), /receipt mismatch/);
  assert.deepEqual(readdirSync(f.runner), []);
});

test('failed source restoration prevents a head install and still cleans trusted helpers', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  const result = transaction(f, {
    beforeStep(id) {
      if (id !== 'source_guard_restore') return;
      writeFileSync(
        join(f.bin, 'git'),
        '#!/bin/sh\nif [ "$1" = reset ]; then echo "fixture reset failed" >&2; exit 52; fi\nexec /usr/bin/git "$@"\n',
        { mode: 0o755 }
      );
    },
  });
  assert.equal(result.failed, true);
  assert.match(result.text, /fixture reset failed/);
  assert.equal(result.state.source_guard_restore.outcome, 'failure');
  assert.equal(result.state.source_head_dependencies.outcome, 'skipped');
  assert.notEqual(dependencyInputDigest(f.repo), f.headDigest);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial', 'source_merge_dependencies']
  );
  assert.deepEqual(readdirSync(f.runner), []);
});

test('restoration proof rejects dependency inputs changed after the reset', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  const result = transaction(f, {
    beforeStep(id) {
      if (id === 'source_head_dependencies')
        f.write('patches/fixture.patch', 'unexpected local mutation\n');
    },
  });
  assert.equal(result.failed, true);
  assert.equal(result.state.source_guard_restore.outcome, 'success');
  assert.equal(result.state.source_head_dependencies.outcome, 'success');
  assert.equal(result.state.source_guard_proof.outcome, 'failure');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.notEqual(dependencyInputDigest(f.repo), f.headDigest);
  assert.deepEqual(readdirSync(f.runner), []);
});

test('a mismatched installed lock is rejected instead of being re-stamped', t => {
  const f = fixture(t);
  f.write('node_modules/.pnpm/lock.yaml', 'stale installed dependency graph\n');
  const result = transaction(f);
  assert.equal(result.failed, true);
  assert.match(
    result.text,
    /installed dependency lock does not match pnpm-lock\.yaml/
  );
  assert.equal(f.guards().length, 0);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.throws(
    () => validateDependencyWorkspace(f.repo),
    /installed dependency lock does not match/
  );
  assert.deepEqual(readdirSync(f.runner), []);
});

test('merge conflict is named without installing or qualifying a conflicted tree', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'), {
    conflict: true,
  });
  const result = transaction(f);
  assert.equal(result.failed, true);
  assert.match(result.text, /merge conflict with main/);
  assert.match(result.text, /shared\.txt/);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(f.guards().length, 0);
  restored(f);
});

test('local tracked edits and untracked files survive without a merge or reinstall', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  f.write('feature.txt', 'local work not committed\n');
  f.write('untracked.txt', 'local untracked work\n');
  const before = f.git('status', '--porcelain');
  const result = transaction(f);
  assert.equal(result.failed, false, result.text);
  assert.equal(f.git('status', '--porcelain'), before);
  assert.equal(
    readFileSync(join(f.repo, 'feature.txt'), 'utf8'),
    'local work not committed\n'
  );
  assert.equal(
    readFileSync(join(f.repo, 'untracked.txt'), 'utf8'),
    'local untracked work\n'
  );
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(f.guards()[0].dependencyInputDigest, f.headDigest);
  assert.equal(
    validateDependencyWorkspace(f.repo).dependencyInputDigest,
    f.headDigest
  );
  assert.deepEqual(readdirSync(f.runner), []);
});

test('an untracked merge collision survives the rejected transaction', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  f.write('base-only.txt', 'local untracked bytes\n');
  const result = transaction(f);
  assert.equal(result.failed, true);
  assert.match(
    result.text,
    /untracked working tree files would be overwritten/
  );
  assert.equal(
    readFileSync(join(f.repo, 'base-only.txt'), 'utf8'),
    'local untracked bytes\n'
  );
  assert.equal(f.git('status', '--porcelain'), '?? base-only.txt');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(f.guards().length, 0);
  assert.equal(
    validateDependencyWorkspace(f.repo).dependencyInputDigest,
    f.headDigest
  );
  assert.deepEqual(readdirSync(f.runner), []);
});

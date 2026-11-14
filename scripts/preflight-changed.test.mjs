import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CUSTOMER_MARKER,
  companionChecklist,
  explainShipGate,
  lintPrBody,
  parseMergeConflicts,
} from './lib/preflight-changed.mjs';
import { evaluateFleetRules } from './pr-fleet-rules.mjs';
import {
  baseRefCandidates,
  changedFiles,
  downgradeHostRed,
  GENERATORS,
  HEAVY_GUARDS,
  hostSlotted,
  invariantTestFiles,
  main,
  NARROWED,
  parseArgs,
  resolveBaseRef,
  sh,
  typecheckTargets,
} from './preflight-changed.mjs';

const file = (filename, status = 'modified') => ({
  filename,
  status,
  patch: '',
});

test('changed invariant modules select their contract tests before push', () => {
  assert.deepEqual(
    invariantTestFiles(
      [
        file('scripts/invariants/screen-certification.mjs'),
        file('scripts/invariants/screen-certification.test.mjs'),
        file('scripts/invariants/absent.mjs', 'removed'),
        file('apps/web/lib/unrelated.mjs'),
        {
          ...file('scripts/moved.mjs', 'renamed'),
          previous_filename: 'scripts/invariants/screen-certification.mjs',
        },
      ],
      process.cwd()
    ),
    ['scripts/invariants/screen-certification.test.mjs']
  );
});

test('selected invariant contracts catch a stale registry expectation', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'preflight-invariant-'));
  try {
    mkdirSync(path.join(repo, 'scripts/invariants'), { recursive: true });
    writeFileSync(
      path.join(repo, 'scripts/invariants/registry.mjs'),
      'export const sources = ["page.tsx", "loading.tsx"];\n'
    );
    const testPath = path.join(repo, 'scripts/invariants/registry.test.mjs');
    const contract = expected =>
      `import assert from 'node:assert/strict';\nimport { sources } from './registry.mjs';\nassert.deepEqual(sources, ${JSON.stringify(expected)});\n`;
    const tests = invariantTestFiles(
      [file('scripts/invariants/registry.mjs')],
      repo
    );
    assert.deepEqual(tests, []);
    writeFileSync(testPath, contract(['page.tsx']));
    const selected = invariantTestFiles(
      [file('scripts/invariants/registry.mjs')],
      repo
    );
    assert.deepEqual(selected, ['scripts/invariants/registry.test.mjs']);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = () =>
      spawnSync(process.execPath, ['--test', ...selected], {
        cwd: repo,
        encoding: 'utf8',
        env,
      });
    const red = run();
    assert.equal(red.status, 1, red.stdout + red.stderr);
    assert.match(red.stdout + red.stderr, /AssertionError/);
    writeFileSync(testPath, contract(['page.tsx', 'loading.tsx']));
    const green = run();
    assert.equal(green.status, 0, green.stdout + green.stderr);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('PR body lint names every missing section and prints a filled template', () => {
  const files = [
    file('apps/web/lib/auth/gate.ts'),
    file('apps/web/lib/accounts/internal-account.ts'),
  ];
  const r = lintPrBody({
    body: '## What\n\nx',
    title: 'fix(auth): stop wiping the email',
    files,
    evaluateFleetRules,
  });
  const ids = r.errors.map(e => e.id);
  assert.ok(ids.includes('red-before-green'));
  assert.ok(r.warnings.some(w => w.id === 'blast-radius'));
  assert.ok(ids.includes('locked-areas'));
  assert.ok(ids.includes('changelog-marker'));
  assert.match(r.template, /## Red-before-green/);
  assert.match(r.template, /Failing command/);
  assert.match(r.template, /## Blast radius/);
  assert.ok(r.template.includes(CUSTOMER_MARKER));
});

test('a complete body passes clean', () => {
  const body = [
    '## What',
    'x',
    CUSTOMER_MARKER,
    '## Blast radius',
    '- What could break: nothing outside lib',
    '- Proof: unit tests',
  ].join('\n');
  const r = lintPrBody({
    body,
    title: 'feat(x): y',
    files: [file('apps/web/lib/foo.ts')],
    evaluateFleetRules,
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.template, '');
});

test('new workflow needs ownership, topology regen, token budget; scripts test needs wiring', () => {
  const files = [
    file('.github/workflows/new-thing.yml', 'added'),
    file('scripts/new-thing.test.mjs', 'added'),
  ];
  const text =
    'on:\n  schedule:\n    - cron: "0 * * * *"\njobs:\n  a:\n    steps:\n      - run: gh api x\n        env:\n          GH_TOKEN: ${{ github.token }}\n';
  const items = companionChecklist(files, p =>
    p.endsWith('.yml') ? text : ''
  );
  const open = items.filter(i => !i.done).map(i => i.item);
  assert.ok(open.some(i => /ownership/.test(i)));
  assert.ok(open.some(i => /topology/.test(i)));
  assert.ok(open.some(i => /automation registry/.test(i)));
  assert.ok(open.some(i => /github-token-budget/.test(i)));
  assert.ok(open.some(i => /wired into a CI lane/.test(i)));
});

test('companion edits present in the diff clear the checklist', () => {
  const files = [
    file('.github/workflows/new-thing.yml', 'added'),
    file('.github/workflow-topology.gen.yml'),
    file('canon/ownership.json'),
  ];
  const items = companionChecklist(files, p =>
    p === 'canon/ownership.json' ? '"new-thing.yml"' : 'on: push\n'
  );
  assert.deepEqual(
    items.filter(i => !i.done),
    []
  );
});

test('disk fixture companion requires the exact version before local publication', () => {
  const fixture = 'scripts/tests/test_disk_guard.py';
  const policy = 'scripts/lanes/qualification_guard.py';
  // Published SHA-256 test vector for "abc"; no candidate Python is executed.
  const digest =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const check = (text, policyText) =>
    companionChecklist([file(fixture)], p =>
      p === fixture ? text : p === policy ? policyText : ''
    );
  for (const policyText of ['', 'REVIEWED_FIXTURE_SHA256 = ("old",)']) {
    const [item] = check('abc', policyText);
    assert.ok(item, 'fixture changes need a companion check');
    assert.equal(item.done, false);
    assert.match(item.hint, new RegExp(digest));
    assert.match(item.hint, /test_the_repo_fixture_is_a_reviewed_version/);
  }
  const policyText = `REVIEWED_FIXTURE_SHA256 = ("${digest}",)`;
  assert.equal(check('abc', policyText)[0].done, true);
  assert.equal(
    check('abcd', policyText)[0].done,
    false,
    'a later fixture edit invalidates the companion pin'
  );
  assert.deepEqual(
    companionChecklist([file('README.md')], () => ''),
    []
  );
});

test('two new migrations violate the single-migration rule', () => {
  const m = n => file(`apps/web/drizzle/migrations/${n}_x.sql`, 'added');
  const items = companionChecklist([m('0151'), m('0152')], () => '');
  assert.ok(items.some(i => /exactly one migration/.test(i.item) && !i.done));
});

test('typecheck targets are the affected packages only', () => {
  const t = typecheckTargets(
    [
      file('apps/web/lib/a.ts'),
      file('apps/web/tests/unit/a.test.ts'),
      file('scripts/x.mjs'),
      file('scripts/y.ts'),
      file('README.md'),
    ],
    process.cwd()
  );
  assert.deepEqual(t.sort(), [
    'pkg:@jovie/ovie',
    'scripts',
    'web',
    'web-stories',
    'web-tests',
  ]);
});

test('script checkJs runs for an mjs-only repair before publication', () => {
  for (const filename of ['scripts/intake.mjs', 'scripts/intake.test.mjs']) {
    assert.deepEqual(typecheckTargets([file(filename)], process.cwd()), [
      'scripts',
    ]);
  }
  assert.deepEqual(
    typecheckTargets([file('scripts/intake.mjs', 'removed')], process.cwd()),
    []
  );
  assert.deepEqual(
    typecheckTargets([file('scripts/README.md')], process.cwd()),
    []
  );
});

test('web source changes typecheck test consumers without a changed test file', () => {
  assert.deepEqual(
    typecheckTargets(
      [file('apps/web/lib/leads/route-lead.ts')],
      process.cwd()
    ).sort(),
    ['pkg:@jovie/ovie', 'web', 'web-stories', 'web-tests']
  );
  assert.deepEqual(
    typecheckTargets(
      [file('apps/web/tests/lib/leads/route-lead.test.ts')],
      process.cwd()
    ),
    ['web-tests']
  );
  assert.deepEqual(
    typecheckTargets(
      [file('apps/web/lib/leads/route-lead.ts', 'removed')],
      process.cwd()
    ),
    []
  );
});

test('story changes select the story compiler omitted by the app and test projects', () => {
  const story =
    'apps/web/components/features/opportunity-inbox/OpportunityInboxEmptyState.stories.tsx';
  assert.ok(
    typecheckTargets([file(story)], process.cwd()).includes('web-stories')
  );
  assert.deepEqual(
    typecheckTargets([file(story, 'removed')], process.cwd()),
    []
  );
  assert.deepEqual(
    typecheckTargets([file('apps/web/tests/unit/a.test.ts')], process.cwd()),
    ['web-tests']
  );
});

test('arguments parse and unknown flags fail', () => {
  assert.equal(parseArgs(['--no-coverage', '--base', 'dev']).coverage, false);
  assert.throws(() => parseArgs(['--nope']));
  assert.ok(HEAVY_GUARDS.has('merged-with-base-invariants'));
  assert.ok(GENERATORS.some(g => g.id === 'workflow-topology'));
});

test('route and policy changes select launch inventory regeneration before guards', () => {
  const generator = GENERATORS.find(g => g.id === 'artist-launch-inventory');
  assert.ok(generator);
  for (const source of [
    'apps/web/app/api/admin/reference-review/route.ts',
    'scripts/artist-launch-policy.mjs',
    'scripts/artist-launch-contract.mjs',
    'docs/product/generated/artist-launch-inventory.json',
  ])
    assert.ok(generator.when.test(source), source);
  assert.equal(generator.when.test('apps/web/lib/unrelated.ts'), false);
});

test('host-only reds are downgraded on macOS but real reds are not', () => {
  const host = {
    code: 1,
    out: 'FAIL  |workspace-scripts| lib/__tests__/pre-push-gate.test.mjs > x',
  };
  const real = {
    code: 1,
    out: `${host.out}\nFAIL  |node| lib/__tests__/ci-rounds.test.mjs > y`,
  };
  const check = { id: 'guard:script-contracts' };
  assert.equal(downgradeHostRed(check, host, 'darwin').code, 0);
  assert.equal(downgradeHostRed(check, real, 'darwin').code, 1);
  assert.equal(downgradeHostRed(check, host, 'linux').code, 1);
});

test('default preflight checks heading bounds without truncating marketing copy', () => {
  const command = NARROWED['merge-group-unit-guards'].command;
  assert.ok(
    command.startsWith('node scripts/design-system-source-ratchet.mjs && ')
  );
  assert.ok(
    command.includes('tests/unit/design-system/mac-header-two-lines-v1.test.ts')
  );
  assert.ok(
    command.includes(
      'tests/unit/marketing/marketing-headline-line-clamp-guard.test.ts'
    )
  );
  assert.equal(
    NARROWED['merge-group-unit-guards'].note,
    'source identity, metrics-layer, locked chrome and heading contracts; full suite with --thorough'
  );
});

test('ship gate violations become exact files to add or touch', () => {
  const todo = explainShipGate(
    [
      '- apps/web/components/atoms/Chip.tsx: No adjacent Chip.stories.tsx or verified canonical marketing story',
      '- apps/web/components/atoms/Pill.tsx: No colocated Pill.test.tsx (or .spec) and no valid // @coverage-via directive',
      '- apps/web/components/atoms/Tag.tsx: Component changed but test apps/web/components/atoms/Tag.test.tsx was not touched in this diff. Update it',
    ].join('\n')
  );
  assert.deepEqual(todo, [
    'add story: apps/web/components/atoms/Chip.stories.tsx  (for apps/web/components/atoms/Chip.tsx)',
    'add test: apps/web/components/atoms/Pill.test.tsx  (for apps/web/components/atoms/Pill.tsx), or a verified // @coverage-via directive',
    'touch test: apps/web/components/atoms/Tag.test.tsx  (for apps/web/components/atoms/Tag.tsx)',
  ]);
});

test('merge-tree conflict output yields the conflicting paths', () => {
  const out =
    'abc123\nCONFLICT (content): Merge conflict in apps/web/a.ts\nCONFLICT (modify/delete): b.ts deleted in HEAD and modified in x';
  assert.deepEqual(parseMergeConflicts(out), [
    'apps/web/a.ts',
    'b.ts deleted in HEAD and modified in x',
  ]);
});

test('a scripts/ .mjs-only change still runs the checkJs scripts typecheck', () => {
  assert.deepEqual(
    typecheckTargets([file('scripts/lib/__tests__/a.test.mjs')], process.cwd()),
    ['scripts']
  );
  assert.deepEqual(typecheckTargets([file('docs/a.mjs')], process.cwd()), []);
});

test('heavy checks run through the host typecheck slot and keep their quoting', () => {
  const cmd =
    "cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p 'tsconfig x.json'";
  const wrapped = hostSlotted(cmd);
  assert.match(wrapped, /^node scripts\/typecheck-slot\.mjs -- bash -c '/);
  const r = spawnSync(
    'bash',
    ['-c', `printf '%s' ${wrapped.slice(wrapped.indexOf("'"))}`],
    { encoding: 'utf8' }
  );
  assert.equal(r.stdout, cmd);
});

const gitIn = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
};

/**
 * A repo whose HEAD and remote-tracking origin/main share one base commit,
 * with an install fixture preflight's provenance guard accepts (no remote).
 */
function baseFixtureRepo(label) {
  const repo = mkdtempSync(path.join(tmpdir(), `preflight-base-${label}-`));
  writeFileSync(path.join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  mkdirSync(path.join(repo, 'node_modules/.pnpm'), { recursive: true });
  writeFileSync(
    path.join(repo, 'node_modules/.pnpm/lock.yaml'),
    'lockfileVersion: 9.0\n'
  );
  mkdirSync(path.join(repo, 'apps/web/node_modules'), { recursive: true });
  gitIn(repo, ['init', '-b', 'main']);
  gitIn(repo, ['config', 'user.email', 'preflight@test.jovie']);
  gitIn(repo, ['config', 'user.name', 'Preflight Test']);
  gitIn(repo, ['add', '-A']);
  gitIn(repo, ['commit', '-m', 'base']);
  gitIn(repo, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  return repo;
}

const commitOnFeature = (repo, name) => {
  gitIn(repo, ['checkout', '-qb', 'feature']);
  writeFileSync(path.join(repo, name), `${name}\n`);
  gitIn(repo, ['add', '-A']);
  gitIn(repo, ['commit', '-m', name]);
};

test('base ref candidates never double-prefix a qualified ref', () => {
  assert.deepEqual(baseRefCandidates('main'), ['origin/main', 'main']);
  assert.deepEqual(baseRefCandidates('origin/main'), ['origin/main']);
  assert.deepEqual(baseRefCandidates('refs/remotes/origin/main'), [
    'refs/remotes/origin/main',
  ]);
});

test('changedFiles discovers real changes for a qualified remote ref', () => {
  const repo = baseFixtureRepo('qualified');
  try {
    commitOnFeature(repo, 'changed.txt');
    const qualified = changedFiles(repo, 'origin/main');
    assert.ok(qualified.mergeBase);
    assert.deepEqual(
      qualified.files.map(f => f.filename),
      ['changed.txt']
    );
    const bare = changedFiles(repo, 'main');
    assert.deepEqual(bare.files, qualified.files);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('changedFiles reports an unresolvable base as no diff base, not an empty change set', () => {
  const repo = baseFixtureRepo('unresolved');
  try {
    commitOnFeature(repo, 'changed.txt');
    assert.equal(resolveBaseRef(repo, 'origin/nope'), null);
    assert.deepEqual(changedFiles(repo, 'origin/nope'), {
      mergeBase: '',
      files: [],
    });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('preflight exits clean on a valid clean branch but fails an invalid base ref', async () => {
  const env = { ...process.env, JOVIE_PREFLIGHT_LEDGER: 'off' };
  const clean = baseFixtureRepo('clean');
  try {
    gitIn(clean, ['checkout', '-qb', 'feature']);
    const lines = [];
    const code = await main({
      argv: [
        '--repo',
        clean,
        '--base',
        'origin/main',
        '--no-typecheck',
        '--no-coverage',
      ],
      env,
      log: line => lines.push(String(line)),
    });
    assert.equal(code, 0);
    assert.ok(
      lines.some(l => l.includes('no changes vs origin/main')),
      lines.join('\n')
    );
  } finally {
    rmSync(clean, { recursive: true, force: true });
  }
  const bad = baseFixtureRepo('badref');
  try {
    gitIn(bad, ['checkout', '-qb', 'feature']);
    const lines = [];
    const code = await main({
      argv: [
        '--repo',
        bad,
        '--base',
        'origin/nope',
        '--no-typecheck',
        '--no-coverage',
      ],
      env,
      log: line => lines.push(String(line)),
    });
    assert.equal(code, 1);
    assert.ok(
      lines.some(l => l.includes("'origin/nope'")),
      lines.join('\n')
    );
    assert.ok(!lines.some(l => /no changes/.test(l)), lines.join('\n'));
  } finally {
    rmSync(bad, { recursive: true, force: true });
  }
});

test('timeout terminates descendants that retain preflight output pipes', {
  skip: process.platform === 'win32',
}, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preflight-timeout-'));
  const pidFile = path.join(directory, 'child.pid');
  let childPid;
  let stopped = false;
  let watchdog;
  try {
    // Promptness is the race against this 2000ms watchdog. A Date.now()
    // delta flakes on a loaded runner after the race has already been won
    // (JOV-10086, merge group 41739789064).
    const result = await Promise.race([
      sh(`sleep 30 & echo $! > "${pidFile}"; echo started; exit 0`, {
        cwd: directory,
        env: process.env,
        timeoutMs: 200,
      }),
      new Promise(
        (_, reject) =>
          (watchdog = setTimeout(
            () =>
              reject(
                new Error(
                  'timeout must settle promptly: preflight timeout left its output pipe open'
                )
              ),
            2000
          ))
      ),
    ]);
    childPid = Number(readFileSync(pidFile, 'utf8'));
    assert.notEqual(
      result.code,
      0,
      'timed-out work must fail even if its shell exited zero'
    );
    assert.match(result.out, /started/);
    const deadline = Date.now() + 1000;
    while (!stopped && Date.now() < deadline) {
      try {
        process.kill(childPid, 0);
        // Linux can briefly retain an already-killed orphan as a zombie.
        if (process.platform === 'linux') {
          stopped =
            readFileSync(`/proc/${childPid}/stat`, 'utf8').split(' ')[2] ===
            'Z';
        }
      } catch (error) {
        if (error.code !== 'ESRCH' && error.code !== 'ENOENT') throw error;
        stopped = true;
      }
      if (!stopped) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(stopped, true, 'descendant must stop after the group signal');
  } finally {
    clearTimeout(watchdog);
    if (!childPid && existsSync(pidFile))
      childPid = Number(readFileSync(pidFile, 'utf8'));
    if (childPid && !stopped) {
      try {
        process.kill(childPid, 'SIGKILL');
      } catch {}
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('preflight command keeps ordinary exit codes and output', async () => {
  const success = await sh('printf ok', {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 2000,
  });
  assert.equal(success.code, 0);
  assert.equal(success.out, 'ok');
  const failure = await sh('exit 7', {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 2000,
  });
  assert.equal(failure.code, 7);
});

test('preflight timeout stops a real host-slot child process group', {
  skip: process.platform === 'win32',
}, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preflight-slot-timeout-'));
  const pidFile = path.join(directory, 'slot-child.pid');
  const slotScript = path.resolve('scripts/typecheck-slot.mjs');
  let pid;
  let stopped = false;
  try {
    const result = await sh(
      `node '${slotScript}' -- bash -c 'echo $$ > "$1"; exec sleep 30' _ '${pidFile}'`,
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GEM_TYPECHECK_SLOTS: '1',
          GEM_TYPECHECK_SLOT_HELD: '0',
          GEM_TYPECHECK_LOCK_DIR: directory,
        },
        timeoutMs: 500,
      }
    );
    assert.notEqual(result.code, 0);
    pid = Number(readFileSync(pidFile, 'utf8'));
    const deadline = Date.now() + 1000;
    while (!stopped && Date.now() < deadline) {
      try {
        process.kill(pid, 0);
        if (process.platform === 'linux') {
          stopped =
            readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2] === 'Z';
        }
      } catch (error) {
        if (error.code !== 'ESRCH' && error.code !== 'ENOENT') throw error;
        stopped = true;
      }
      if (!stopped) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(
      stopped,
      true,
      'slot descendant must stop after preflight timeout'
    );
  } finally {
    if (!pid && existsSync(pidFile))
      pid = Number(readFileSync(pidFile, 'utf8'));
    if (pid && !stopped) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('preflight-managed host slots still serialize concurrent commands', {
  skip: process.platform === 'win32',
}, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preflight-slot-lock-'));
  const events = path.join(directory, 'events');
  const slotScript = path.resolve('scripts/typecheck-slot.mjs');
  const env = {
    ...process.env,
    GEM_TYPECHECK_SLOTS: '1',
    GEM_TYPECHECK_SLOT_HELD: '0',
    GEM_TYPECHECK_LOCK_DIR: directory,
    GEM_TYPECHECK_POLL_MS: '20',
  };
  const command = label =>
    `node '${slotScript}' -- bash -c 'echo ${label}-start >> "$1"; sleep 0.2; echo ${label}-end >> "$1"' _ '${events}'`;
  try {
    const results = await Promise.all(
      ['a', 'b'].map(label =>
        sh(command(label), { cwd: process.cwd(), env, timeoutMs: 5000 })
      )
    );
    assert.deepEqual(
      results.map(result => result.code),
      [0, 0]
    );
    const rows = readFileSync(events, 'utf8').trim().split('\n');
    assert.ok(
      rows.join(',') === 'a-start,a-end,b-start,b-end' ||
        rows.join(',') === 'b-start,b-end,a-start,a-end',
      `slot commands overlapped: ${rows.join(',')}`
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const mode of ['SIGTERM', 'SIGINT', 'exit']) {
  test(`outer ${mode} cleans a detached preflight host-slot child`, {
    skip: process.platform === 'win32',
  }, async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'preflight-cancel-'));
    const pidFile = path.join(directory, 'child.pid');
    const moduleUrl = new URL('./preflight-changed.mjs', import.meta.url).href;
    const command = `node scripts/typecheck-slot.mjs -- bash -c 'echo $$ > "$GEM_TEST_PID_FILE"; exec sleep 30'`;
    const source = `import { sh } from ${JSON.stringify(moduleUrl)}; ${mode === 'exit' ? 'setTimeout(() => process.exit(0), 500);' : ''} await sh(${JSON.stringify(command)}, { cwd: process.cwd(), env: process.env, timeoutMs: 30000 });`;
    const outer = spawn(
      process.execPath,
      ['--input-type=module', '-e', source],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          GEM_TEST_PID_FILE: pidFile,
          GEM_TYPECHECK_SLOTS: '1',
          GEM_TYPECHECK_SLOT_HELD: '0',
          GEM_TYPECHECK_LOCK_DIR: directory,
        },
      }
    );
    let childPid;
    let stopped = false;
    try {
      const startedDeadline = Date.now() + 4000;
      while (!existsSync(pidFile) && Date.now() < startedDeadline)
        await new Promise(resolve => setTimeout(resolve, 20));
      assert.ok(existsSync(pidFile), 'host-slot child must start');
      childPid = Number(readFileSync(pidFile, 'utf8'));
      const closed = new Promise((resolve, reject) => {
        const watchdog = setTimeout(
          () => reject(new Error('outer process did not terminate')),
          4000
        );
        outer.once('close', (code, signal) => {
          clearTimeout(watchdog);
          resolve({ code, signal });
        });
      });
      if (mode !== 'exit') process.kill(-outer.pid, mode);
      const result = await closed;
      if (mode !== 'exit') assert.equal(result.signal, mode);
      else assert.equal(result.code, 0);
      const deadline = Date.now() + 1000;
      while (!stopped && Date.now() < deadline) {
        try {
          process.kill(childPid, 0);
          if (process.platform === 'linux')
            stopped =
              readFileSync(`/proc/${childPid}/stat`, 'utf8').split(' ')[2] ===
              'Z';
        } catch (error) {
          if (error.code !== 'ESRCH' && error.code !== 'ENOENT') throw error;
          stopped = true;
        }
        if (!stopped) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(stopped, true, 'owned host-slot descendant must stop');
    } finally {
      if (outer.exitCode === null && outer.signalCode === null) {
        try {
          process.kill(-outer.pid, 'SIGKILL');
        } catch {}
      }
      if (!childPid && existsSync(pidFile))
        childPid = Number(readFileSync(pidFile, 'utf8'));
      if (childPid && !stopped) {
        try {
          process.kill(childPid, 'SIGKILL');
        } catch {}
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('outer cancellation stops all concurrent preflight command groups', {
  skip: process.platform !== 'linux',
}, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preflight-cancel-many-'));
  const files = ['a', 'b'].map(name => path.join(directory, `${name}.pid`));
  const moduleUrl = new URL('./preflight-changed.mjs', import.meta.url).href;
  const source = `import { sh } from ${JSON.stringify(moduleUrl)}; const run = name => sh('echo $$ > "$GEM_TEST_DIR/' + name + '.pid"; exec sleep 30', { cwd: process.cwd(), env: process.env, timeoutMs: 30000 }); await Promise.all([run('a'), run('b')]);`;
  const outer = spawn(process.execPath, ['--input-type=module', '-e', source], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, GEM_TEST_DIR: directory },
  });
  let pids = [];
  let stopped = false;
  try {
    const deadline = Date.now() + 4000;
    while (!files.every(existsSync) && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(files.every(existsSync), 'both commands must start');
    pids = files.map(file => Number(readFileSync(file, 'utf8')));
    const closed = new Promise((resolve, reject) => {
      const watchdog = setTimeout(
        () => reject(new Error('outer cancellation hung')),
        4000
      );
      outer.once('close', (_code, signal) => {
        clearTimeout(watchdog);
        resolve(signal);
      });
    });
    process.kill(-outer.pid, 'SIGTERM');
    assert.equal(await closed, 'SIGTERM');
    const stopDeadline = Date.now() + 1000;
    while (!stopped && Date.now() < stopDeadline) {
      stopped = pids.every(pid => {
        try {
          return (
            readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2] === 'Z'
          );
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          return true;
        }
      });
      if (!stopped) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(stopped, true, 'all owned command groups must stop');
  } finally {
    if (outer.exitCode === null && outer.signalCode === null) {
      try {
        process.kill(-outer.pid, 'SIGKILL');
      } catch {}
    }
    if (!stopped) {
      for (const file of files) {
        if (!existsSync(file)) continue;
        try {
          process.kill(Number(readFileSync(file, 'utf8')), 'SIGKILL');
        } catch {}
      }
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('actual preflight CLI exports logical GitHub base and qualified CI base to downstream guards', () => {
  const repo = baseFixtureRepo('consumer-env');
  try {
    mkdirSync(path.join(repo, 'scripts/lib'), { recursive: true });
    writeFileSync(path.join(repo, '.gitignore'), 'scripts/\nnode_modules/\n');
    gitIn(repo, ['add', '.gitignore']);
    gitIn(repo, ['commit', '-m', 'ignore fixture consumers']);
    gitIn(repo, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    commitOnFeature(repo, 'changed.txt');
    writeFileSync(
      path.join(repo, 'scripts/ci-fast-lanes.mjs'),
      `
export const selectSourceGuards = () => [{
  id: 'base-env-probe',
  command: 'git rev-parse --verify "origin/$GITHUB_BASE_REF" && test "$GITHUB_BASE_REF" = main && test "$CI_BASE_REF" = "$EXPECTED_CI_BASE"'
}];
`
    );
    writeFileSync(
      path.join(repo, 'scripts/lib/source-validation-manifest.mjs'),
      "export const selectManifestGuards = (paths, base) => [{ id: 'manifest-base-probe', name: 'manifest base branch', command: 'test ' + base + ' = main && git rev-parse --verify origin/' + base }];\n"
    );
    /** @type {NodeJS.ProcessEnv} */
    const env = {
      ...process.env,
      JOVIE_PREFLIGHT_LEDGER: 'off',
      JOVIE_PREFLIGHT_DEPTH: '',
    };
    delete env.NODE_TEST_CONTEXT;
    delete env.JOVIE_PR_BODY_FILE;
    for (const base of ['main', 'origin/main', 'refs/remotes/origin/main']) {
      const result = spawnSync(
        process.execPath,
        [
          path.join(import.meta.dirname, 'preflight-changed.mjs'),
          '--repo',
          repo,
          '--base',
          base,
        ],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...env,
            EXPECTED_CI_BASE: base === 'main' ? 'origin/main' : base,
          },
        }
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /ok +source guard base-env-probe/);
      assert.match(result.stdout, /ok +manifest base branch/);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('private data guard uses an absolute XDG cache when home is unavailable', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'preflight-xdg-'));
  try {
    const repo = path.join(root, 'repo');
    const cache = path.join(root, 'cache');
    const home = path.join(root, 'unavailable-home');
    const sha = 'a'.repeat(40);
    mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
    mkdirSync(path.join(cache, 'jovie-preflight'), { recursive: true });
    writeFileSync(home, 'not a directory');
    writeFileSync(
      path.join(repo, '.github/workflows/private-data-guard.yml'),
      `jobs:\n  guard:\n    uses: JovieInc/ci/.github/workflows/guard.yml@${sha}\n`
    );
    writeFileSync(
      path.join(cache, 'jovie-preflight', `private-data-${sha}.py`),
      'import os, sys\nprint(os.environ["FAIL_ON_FINDINGS"])\nsys.exit(7)\n'
    );
    const runner = `import { privateDataCheck } from ${JSON.stringify(new URL('./preflight-changed.mjs', import.meta.url).href)};
const r = await privateDataCheck(${JSON.stringify(repo)}, process.env, 'base');
console.log(JSON.stringify(r));`;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', runner],
      {
        encoding: 'utf8',
        env: { ...process.env, HOME: home, XDG_CACHE_HOME: cache },
      }
    );
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.code, 7);
    assert.match(output.out, /true/);

    const fallbackHome = path.join(root, 'fallback-home');
    const fallbackCache = path.join(fallbackHome, '.cache/jovie-preflight');
    mkdirSync(fallbackCache, { recursive: true });
    writeFileSync(
      path.join(fallbackCache, `private-data-${sha}.py`),
      'import sys\nsys.exit(8)\n'
    );
    for (const invalid of ['', 'relative-cache']) {
      const fallback = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', runner],
        {
          encoding: 'utf8',
          env: { ...process.env, HOME: fallbackHome, XDG_CACHE_HOME: invalid },
        }
      );
      assert.equal(fallback.status, 0, fallback.stderr);
      assert.equal(JSON.parse(fallback.stdout.trim()).code, 8, invalid);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

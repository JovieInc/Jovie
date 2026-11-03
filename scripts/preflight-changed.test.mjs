import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
  privateDataCheck,
  resolveBaseRef,
  typecheckTargets,
} from './preflight-changed.mjs';

const file = (filename, status = 'modified') => ({
  filename,
  status,
  patch: '',
});

test('Private Data Guard uses the XDG cache for cold and warm pinned runs and keeps failures blocking', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdg-xdg-'));
  const pin = 'a'.repeat(40);
  const cache = path.join(dir, "cache ' $(touch injected) $&");
  const legacyGuard = path.join(
    cache,
    'jovie-preflight',
    `private-data-${pin}.py`
  );
  const guard = [
    'import os, sys',
    'assert os.environ["EVENT_NAME"] == "pull_request"',
    'assert os.environ["PR_BASE_SHA"] == "fixture-base"',
    'assert os.environ["FULL_TREE"] == "false"',
    'assert os.environ["FAIL_ON_FINDINGS"] == "true"',
    'assert os.environ["EXTRA_PATHS"] == "fixture-path"',
    'assert os.environ["EXTRA_CONTENT"] == "fixture-content"',
    'print("pinned guard executed")',
    'with open(os.environ["GUARD_EXECUTIONS"], "a") as runs: runs.write("run\\n")',
    'sys.exit(17)',
  ].join('\n');
  const pinnedWorkflow = `run: |\n  python3 - <<'PY'\n${guard
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n')}\n  PY\n`;
  try {
    mkdirSync(path.dirname(legacyGuard), { recursive: true });
    writeFileSync(legacyGuard, 'print("unverified legacy guard executed")\n');
    mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
    mkdirSync(path.join(dir, 'packages/api-client'), { recursive: true });
    writeFileSync(
      path.join(dir, '.github/workflows/private-data-guard.yml'),
      `jobs:\n  guard:\n    uses: JovieInc/ci/.github/workflows/private-data-guard.yml@${pin}\n    with:\n      extra-path-patterns: fixture-path\n      extra-content-patterns: fixture-content\n`
    );
    writeFileSync(
      path.join(dir, 'packages/api-client/cli.ts'),
      `import assert from 'node:assert/strict';\nimport { appendFileSync } from 'node:fs';\nappendFileSync('fetches', 'fetch\\n');\nassert.deepEqual(process.argv.slice(2), ${JSON.stringify(['gh', '--priority', 'default', '--', 'api', `repos/JovieInc/ci/contents/.github/workflows/private-data-guard.yml?ref=${pin}`, '--jq', '.content'])});\nconsole.log(${JSON.stringify(Buffer.from(pinnedWorkflow).toString('base64'))});\n`
    );
    const executions = path.join(dir, 'executions');
    /** @type {NodeJS.ProcessEnv} */
    const env = {
      ...process.env,
      XDG_CACHE_HOME: cache,
      GUARD_EXECUTIONS: executions,
    };
    const cold = await privateDataCheck(dir, env, 'fixture-base');
    assert.ok('code' in cold, JSON.stringify(cold));
    assert.equal(cold.code, 17, JSON.stringify(cold));
    assert.match(cold.out, /pinned guard executed/);
    const cacheFile = path.join(
      cache,
      'jovie-preflight',
      readdirSync(path.join(cache, 'jovie-preflight')).find(name =>
        name.endsWith('.json')
      )
    );
    assert.equal(JSON.parse(readFileSync(cacheFile, 'utf8')).script, guard);
    const warm = await privateDataCheck(dir, env, 'fixture-base');
    assert.ok('code' in warm, JSON.stringify(warm));
    assert.equal(warm.code, 17, JSON.stringify(warm));
    assert.match(warm.out, /pinned guard executed/);
    assert.equal(
      readFileSync(path.join(dir, 'fetches'), 'utf8'),
      'fetch\nfetch\n'
    );
    assert.equal(readFileSync(executions, 'utf8'), 'run\nrun\n');
    // Replace the cached artifact after validation, exactly when Python starts.
    const python = spawnSync('which', ['python3'], { encoding: 'utf8' });
    assert.equal(python.status, 0, python.stderr);
    const bin = path.join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, 'python3'),
      `#!/bin/sh\nprintf '{}' > "$GUARD_CACHE_RECORD"\nexec '${python.stdout.trim().replaceAll("'", "'\"'\"'")}' "$@"\n`,
      { mode: 0o700 }
    );
    const snapshot = await privateDataCheck(
      dir,
      { ...env, PATH: `${bin}:${env.PATH}`, GUARD_CACHE_RECORD: cacheFile },
      'fixture-base'
    );
    assert.ok('code' in snapshot, JSON.stringify(snapshot));
    assert.equal(snapshot.code, 17, JSON.stringify(snapshot));
    assert.match(snapshot.out, /pinned guard executed/);
    assert.equal(readFileSync(cacheFile, 'utf8'), '{}');
    assert.equal(readFileSync(executions, 'utf8'), 'run\nrun\nrun\n');
    const corrupt = await privateDataCheck(dir, env, 'fixture-base');
    assert.ok('code' in corrupt, JSON.stringify(corrupt));
    assert.equal(corrupt.code, 1, JSON.stringify(corrupt));
    assert.match(corrupt.out, /cache/i);
    assert.equal(readFileSync(executions, 'utf8'), 'run\nrun\nrun\n');
    // Quota deferral remains infrastructure failure, never a passing cached run.
    writeFileSync(
      path.join(dir, 'packages/api-client/cli.ts'),
      'process.exit(75);\n'
    );
    const quota = await privateDataCheck(dir, env, 'fixture-base');
    assert.ok('code' in quota, JSON.stringify(quota));
    assert.equal(quota.code, 75, JSON.stringify(quota));
    assert.match(quota.out, /github-quota-deferred/);
    assert.equal(readFileSync(executions, 'utf8'), 'run\nrun\nrun\n');
    // A local record never replaces authenticated verification of the pin.
    rmSync(path.join(dir, 'packages'), { recursive: true });
    const unavailable = await privateDataCheck(dir, env, 'fixture-base');
    assert.ok('code' in unavailable, JSON.stringify(unavailable));
    assert.equal(unavailable.code, 1, JSON.stringify(unavailable));
    assert.match(unavailable.out, /fetch.*pinned guard/i);
    assert.equal(readFileSync(executions, 'utf8'), 'run\nrun\nrun\n');
    assert.equal(existsSync(path.join(dir, 'injected')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test('pinned guard cache keeps a verified warm record unchanged and separates workflow identities', async () => {
  const { cachePinnedGuard } = await import(
    './lib/private-data-guard-cache.mjs'
  );
  const { createHash } = await import('node:crypto');
  const { readdirSync, statSync } = await import('node:fs');
  const root = mkdtempSync(path.join(tmpdir(), 'pdg-cache-warm-'));
  const input = {
    cacheDir: path.join(root, 'cache'),
    commit: 'b'.repeat(40),
    workflowPath: '.github/workflows/private-data-guard.yml',
    script: 'print("verified guard")\n',
  };
  try {
    const cold = cachePinnedGuard(input);
    assert.equal(cold.script, input.script);
    assert.equal(
      cold.sha256,
      createHash('sha256').update(input.script).digest('hex')
    );
    const original = readFileSync(cold.file);
    const before = statSync(cold.file, { bigint: true });
    const record = JSON.parse(original.toString('utf8'));
    assert.equal(record.schema, 'jovie.preflight-private-data-guard/v1');
    assert.equal(record.repository, 'JovieInc/ci');
    assert.equal(record.commit, input.commit);
    assert.equal(record.workflowPath, input.workflowPath);
    assert.equal(record.script, input.script);
    assert.equal(record.sha256, cold.sha256);
    const warm = cachePinnedGuard(input);
    assert.deepEqual(warm, cold);
    assert.deepEqual(readFileSync(cold.file), original);
    const after = statSync(cold.file, { bigint: true });
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeNs, before.mtimeNs);
    const otherPath = cachePinnedGuard({
      ...input,
      workflowPath: '.github/workflows/another-guard.yml',
    });
    const otherCommit = cachePinnedGuard({ ...input, commit: 'c'.repeat(40) });
    assert.notEqual(otherPath.file, cold.file);
    assert.notEqual(otherCommit.file, cold.file);
    assert.notEqual(otherCommit.file, otherPath.file);
    assert.deepEqual(
      readdirSync(input.cacheDir).sort(),
      [cold.file, otherPath.file, otherCommit.file]
        .map(file => path.basename(file))
        .sort()
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pinned guard cache rejects corruption and forged receipts without replacing existing bytes', async t => {
  const { cachePinnedGuard } = await import(
    './lib/private-data-guard-cache.mjs'
  );
  const { createHash } = await import('node:crypto');
  const { readdirSync } = await import('node:fs');
  const root = mkdtempSync(path.join(tmpdir(), 'pdg-cache-corrupt-'));
  const input = {
    cacheDir: root,
    commit: 'd'.repeat(40),
    workflowPath: '.github/workflows/private-data-guard.yml',
    script: 'print("authenticated pinned guard")\n',
  };
  try {
    const published = cachePinnedGuard(input);
    const valid = JSON.parse(readFileSync(published.file, 'utf8'));
    const altered = 'print("substituted guard")\n';
    const variants = [
      ['truncated JSON', '{"schema":'],
      ['wrong schema', JSON.stringify({ ...valid, schema: 'unverified/v0' })],
      [
        'wrong repository',
        JSON.stringify({ ...valid, repository: 'Other/ci' }),
      ],
      [
        'wrong workflow path',
        JSON.stringify({
          ...valid,
          workflowPath: '.github/workflows/other.yml',
        }),
      ],
      ['wrong commit', JSON.stringify({ ...valid, commit: 'e'.repeat(40) })],
      ['missing script', JSON.stringify({ ...valid, script: undefined })],
      ['corrupted script', JSON.stringify({ ...valid, script: altered })],
      [
        'forged matching digest',
        JSON.stringify({
          ...valid,
          script: altered,
          sha256: createHash('sha256').update(altered).digest('hex'),
        }),
      ],
    ];
    for (const [name, bytes] of variants) {
      await t.test(name, () => {
        writeFileSync(published.file, bytes);
        assert.throws(() => cachePinnedGuard(input));
        assert.equal(readFileSync(published.file, 'utf8'), bytes);
        assert.deepEqual(readdirSync(root), [path.basename(published.file)]);
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pinned guard cache publishes one complete record for concurrent cold callers', {
  timeout: 15000,
}, async t => {
  const { spawn } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { readdirSync } = await import('node:fs');
  const root = mkdtempSync(path.join(tmpdir(), 'pdg-cache-concurrent-'));
  const input = {
    cacheDir: path.join(root, 'cache'),
    commit: 'f'.repeat(40),
    workflowPath: '.github/workflows/private-data-guard.yml',
    script:
      '# complete authenticated source\n'.repeat(4096) +
      'print("verified guard")\n',
  };
  const moduleUrl = new URL(
    './lib/private-data-guard-cache.mjs',
    import.meta.url
  ).href;
  const staged = path.join(root, 'staged');
  const release = path.join(root, 'release');
  mkdirSync(staged);
  const childSource = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import path from 'node:path';
    import { cachePinnedGuard } from ${JSON.stringify(moduleUrl)};
    const originalLink = fs.linkSync;
    let collisions = 0;
    fs.linkSync = (from, to) => {
      fs.writeFileSync(path.join(${JSON.stringify(staged)}, process.pid + '.staged'), 'ready', {flag: 'wx'});
      const deadline = Date.now() + 5000;
      const wait = new Int32Array(new SharedArrayBuffer(4));
      while (!fs.existsSync(${JSON.stringify(release)})) {
        if (Date.now() >= deadline) throw new Error('publication barrier timed out');
        Atomics.wait(wait, 0, 0, 10);
      }
      try {
        return originalLink(from, to);
      } catch (error) {
        if (error.code === 'EEXIST') collisions++;
        throw error;
      }
    };
    syncBuiltinESMExports();
    process.send({ready: true});
    process.once('message', input => {
      try {
        const result = cachePinnedGuard(input);
        assert.equal(result.script, input.script);
        process.send({file: result.file, sha256: result.sha256, collisions});
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      } finally {
        process.disconnect();
      }
    });
  `;
  const workers = Array.from({ length: 6 }, () => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', childSource],
      {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      }
    );
    /** @type {(value: boolean) => void} */
    let readyResolve = () => {};
    /** @type {(value: { status: number | null, output: string, result?: { file: string, sha256: string, collisions: number } }) => void} */
    let doneResolve = () => {};
    let output = '';
    /** @type {{ file: string, sha256: string, collisions: number } | undefined} */
    let result;
    /** @type {Promise<boolean>} */
    const ready = new Promise(resolve => {
      readyResolve = resolve;
    });
    /** @type {Promise<{ status: number | null, output: string, result?: { file: string, sha256: string, collisions: number } }>} */
    const done = new Promise(resolve => {
      doneResolve = resolve;
    });
    child.stdout.on('data', chunk => {
      output += chunk;
    });
    child.stderr.on('data', chunk => {
      output += chunk;
    });
    child.on('message', message => {
      const row =
        /** @type {{ ready?: boolean, file?: string, sha256?: string, collisions?: number }} */ (
          message
        );
      if (row.ready) readyResolve(true);
      else if (
        typeof row.file === 'string' &&
        typeof row.sha256 === 'string' &&
        typeof row.collisions === 'number'
      )
        result = {
          file: row.file,
          sha256: row.sha256,
          collisions: row.collisions,
        };
    });
    child.once('error', error => {
      output += String(error);
      readyResolve(false);
      doneResolve({ status: -1, output, result });
    });
    child.once('close', status => {
      readyResolve(false);
      doneResolve({ status, output, result });
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    });
    return { child, ready, done };
  });
  try {
    assert.deepEqual(
      await Promise.all(workers.map(worker => worker.ready)),
      Array(6).fill(true)
    );
    assert.equal(existsSync(input.cacheDir), false);
    for (const worker of workers) worker.child.send(input);
    const deadline = Date.now() + 4000;
    while (readdirSync(staged).length < workers.length && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(
      readdirSync(staged).length,
      workers.length,
      'every caller reached the real link publication boundary'
    );
    assert.equal(
      readdirSync(input.cacheDir).some(name => name.endsWith('.json')),
      false,
      'no caller published before release'
    );
    writeFileSync(release, 'publish');
    const results = await Promise.all(workers.map(worker => worker.done));
    for (const result of results) assert.equal(result.status, 0, result.output);
    const first = results[0].result;
    assert.ok(first);
    assert.ok(first.file);
    const expectedDigest = createHash('sha256')
      .update(input.script)
      .digest('hex');
    assert.equal(first.sha256, expectedDigest);
    let collisions = 0;
    for (const result of results) {
      assert.ok(result.result);
      assert.equal(result.result.file, first.file);
      assert.equal(result.result.sha256, expectedDigest);
      assert.ok(
        result.result.collisions === 0 || result.result.collisions === 1
      );
      collisions += result.result.collisions;
    }
    assert.equal(
      collisions,
      workers.length - 1,
      'exactly one publisher wins and every other real link reports EEXIST'
    );
    const record = JSON.parse(readFileSync(first.file, 'utf8'));
    assert.equal(record.script, input.script);
    assert.equal(record.sha256, expectedDigest);
    assert.deepEqual(readdirSync(input.cacheDir), [path.basename(first.file)]);
  } finally {
    for (const worker of workers) {
      if (worker.child.exitCode === null && worker.child.signalCode === null)
        worker.child.kill();
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('Private Data Guard keeps early Python exits and rejects incomplete stdin delivery', async t => {
  for (const exitCode of [0, 23]) {
    await t.test(
      `Python exits ${exitCode} before reading its source`,
      async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'pdg-stdin-'));
        const pin = 'e'.repeat(40);
        // Exceed the pipe buffer while remaining below the fetch client's output
        // bound, so the early-exit runner produces a real EPIPE deterministically.
        const script =
          '# pinned source padding\n'.repeat(20000) + 'raise SystemExit(17)';
        const workflow = `run: |\n  python3 - <<'PY'\n${script
          .split('\n')
          .map(line => `  ${line}`)
          .join('\n')}\n  PY\n`;
        try {
          mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
          mkdirSync(path.join(dir, 'packages/api-client'), { recursive: true });
          const bin = path.join(dir, 'bin');
          mkdirSync(bin);
          writeFileSync(
            path.join(dir, '.github/workflows/private-data-guard.yml'),
            `jobs:\n  guard:\n    uses: JovieInc/ci/.github/workflows/private-data-guard.yml@${pin}\n`
          );
          writeFileSync(
            path.join(dir, 'packages/api-client/cli.ts'),
            `console.log(${JSON.stringify(Buffer.from(workflow).toString('base64'))});\n`
          );
          writeFileSync(
            path.join(bin, 'python3'),
            `#!/bin/sh\n[ "$1" = - ] || exit 91\nexit ${exitCode}\n`,
            { mode: 0o700 }
          );
          const result = await privateDataCheck(
            dir,
            {
              ...process.env,
              XDG_CACHE_HOME: path.join(dir, 'cache'),
              PATH: `${bin}:${process.env.PATH}`,
            },
            'fixture-base'
          );
          assert.ok('code' in result, JSON.stringify(result));
          assert.equal(result.code, exitCode || 1, JSON.stringify(result));
          assert.match(result.out, /stdin delivery failed/);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    );
  }
});

test('preflight keeps guard quota deferral nonpassing without inventing a code failure', async t => {
  for (const [gateStatus, guardExit] of [
    [0, 0],
    [9, 0],
    [0, 75],
  ]) {
    await t.test(
      `source gate ${gateStatus}, guard process ${guardExit}`,
      async () => {
        const repo = baseFixtureRepo(`guard-quota-${gateStatus}`);
        const ledger = path.join(repo, 'node_modules', '.cache', 'preflight');
        try {
          mkdirSync(path.join(repo, 'scripts/lib'), { recursive: true });
          mkdirSync(path.join(repo, 'packages/api-client'), {
            recursive: true,
          });
          mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
          writeFileSync(
            path.join(repo, 'scripts/ci-fast-lanes.mjs'),
            `export const selectSourceGuards = () => [{ id: 'fixture-check', command: 'node -e "process.exit(${gateStatus})"' }];\n`
          );
          writeFileSync(
            path.join(repo, 'scripts/lib/source-validation-manifest.mjs'),
            'export const selectManifestGuards = () => [];\n'
          );
          writeFileSync(
            path.join(repo, 'packages/api-client/cli.ts'),
            guardExit
              ? `console.log(${JSON.stringify(Buffer.from("run: |\n  python3 - <<'PY'\n  raise SystemExit(75)\n  PY\n").toString('base64'))});\n`
              : 'process.exit(75);\n'
          );
          writeFileSync(
            path.join(repo, '.github/workflows/private-data-guard.yml'),
            `jobs:\n  guard:\n    uses: JovieInc/ci/.github/workflows/private-data-guard.yml@${'a'.repeat(40)}\n`
          );
          gitIn(repo, ['add', '-A']);
          gitIn(repo, ['commit', '-m', 'fixture gates']);
          gitIn(repo, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
          commitOnFeature(repo, 'probe.txt');
          const lines = [];
          const code = await main({
            argv: ['--repo', repo, '--json'],
            env: {
              ...process.env,
              XDG_CACHE_HOME: path.join(repo, 'cache'),
              JOVIE_PREFLIGHT_LEDGER: 'on',
              JOVIE_PREFLIGHT_LEDGER_DIR: ledger,
            },
            log: line => lines.push(String(line)),
          });
          assert.equal(
            code,
            gateStatus || guardExit ? 1 : 75,
            lines.join('\n')
          );
          const summary = JSON.parse(lines.at(-1));
          const receipt = JSON.parse(
            readFileSync(path.join(ledger, 'preflight-changed.jsonl'), 'utf8')
          );
          for (const row of [summary, receipt]) {
            assert.deepEqual(
              row.red,
              guardExit
                ? ['private-data']
                : gateStatus
                  ? ['guard:fixture-check']
                  : []
            );
            assert.deepEqual(
              row.infrastructure,
              guardExit ? [] : ['private-data']
            );
          }
          if (guardExit)
            assert.doesNotMatch(lines.join('\n'), /github-quota-deferred/);
          else assert.match(lines.join('\n'), /github-quota-deferred/);
          assert.doesNotMatch(lines.join('\n'), /all clear\./);
          if (guardExit)
            assert.match(lines.join('\n'), /FAIL\s+private data guard/);
          else
            assert.doesNotMatch(lines.join('\n'), /FAIL\s+private data guard/);
        } finally {
          rmSync(repo, { recursive: true, force: true });
        }
      }
    );
  }
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

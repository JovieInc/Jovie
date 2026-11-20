import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  check,
  countFile,
  declaredBudget,
  tighten,
} from './lib/workflow-token-budget.mjs';
import { main } from './workflow-token-budget-guard.mjs';

const wf = body => `on: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n${body}`;

test('an unprimed hosted setup-node is a manifest call; priming first clears it', () => {
  const bare = countFile(
    wf(
      '    steps:\n      - uses: actions/setup-node@abc # v7\n        with: {node-version-file: .nvmrc}\n'
    )
  );
  assert.equal(bare['setup-node-manifest'], 1);
  const primed = countFile(
    wf(
      '    steps:\n      - uses: ./.github/actions/prime-node-toolcache\n      - uses: actions/setup-node@abc\n        with: {node-version-file: .nvmrc}\n'
    )
  );
  assert.equal(primed['setup-node-manifest'], 0);
  const selfHosted = countFile(
    'on: push\njobs:\n  j:\n    runs-on: [self-hosted, Linux]\n    steps:\n      - uses: actions/setup-node@abc\n'
  );
  assert.equal(selfHosted['setup-node-manifest'], 0);
});

test('github-script without github-token and gh calls on github.token are counted', () => {
  const counts = countFile(
    wf(
      [
        '    steps:',
        '      - uses: actions/github-script@abc',
        '        with: {script: "return 1"}',
        '      - uses: actions/github-script@abc',
        '        with: {github-token: "${{ steps.t.outputs.token }}", script: "return 1"}',
        '      - run: gh api repos/x/y',
        '        env:',
        '          GH_TOKEN: ${{ github.token }}',
        '      - run: gh api repos/x/y',
        '        env:',
        '          GH_TOKEN: ${{ steps.t.outputs.token }}',
        '      - run: echo hello',
        '        env:',
        '          GH_TOKEN: ${{ github.token }}',
        '',
      ].join('\n')
    )
  );
  assert.equal(counts['script-default-token'], 1);
  assert.equal(counts['token-api-call'], 1);
});

test('job-level github.token reaches a run step that calls the api-client', () => {
  const counts = countFile(
    'on: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      GH_TOKEN: ${{ github.token }}\n    steps:\n      - run: node packages/api-client/cli.ts gh -- api rate_limit\n'
  );
  assert.equal(counts['token-api-call'], 1);
});

test('check fails on growth, passes at the ratchet, and honors a declared budget', () => {
  const found = { 'a.yml': { 'setup-node-manifest': 2 } };
  assert.deepEqual(
    check({
      found,
      declared: {},
      ratchet: { 'a.yml': { 'setup-node-manifest': 2 } },
    }),
    []
  );
  assert.deepEqual(
    check({
      found,
      declared: {},
      ratchet: { 'a.yml': { 'setup-node-manifest': 3 } },
    }),
    []
  );
  const errors = check({
    found,
    declared: {},
    ratchet: { 'a.yml': { 'setup-node-manifest': 1 } },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /prime-node-toolcache/);
  assert.deepEqual(
    check({
      found,
      declared: { 'a.yml': { calls: 3, reason: 'x' } },
      ratchet: {},
    }),
    []
  );
  assert.equal(
    check({
      found: { 'new.yml': { 'token-api-call': 1 } },
      declared: {},
      ratchet: {},
    }).length,
    1
  );
});

test('declaration needs a count and a reason; tighten never raises', () => {
  assert.deepEqual(
    declaredBudget(
      '# github-token-budget: 6 calls/run - reads PR evidence\nname: x'
    ),
    { calls: 6, reason: 'reads PR evidence' }
  );
  assert.equal(declaredBudget('# github-token-budget: 6 calls/run\n'), null);
  assert.deepEqual(
    tighten(
      { 'a.yml': { 'token-api-call': 3 } },
      { 'a.yml': { 'token-api-call': 5 }, 'b.yml': { 'token-api-call': 1 } }
    ),
    { 'a.yml': { 'token-api-call': 3 }, 'b.yml': { 'token-api-call': 1 } }
  );
});

test('main bootstraps, passes, then fails when a workflow adds an unbudgeted site', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-budget-'));
  const quiet = fn => {
    const out = process.stdout.write.bind(process.stdout);
    const err = process.stderr.write.bind(process.stderr);
    process.stdout.write = () => true;
    process.stderr.write = () => true;
    try {
      return fn();
    } finally {
      process.stdout.write = out;
      process.stderr.write = err;
    }
  };
  try {
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    mkdirSync(join(root, 'scripts/lib'), { recursive: true });
    writeFileSync(
      join(root, '.github/workflows/a.yml'),
      wf('    steps:\n      - uses: actions/setup-node@abc\n')
    );
    assert.equal(
      quiet(() => main(['--bootstrap'], root)),
      0
    );
    assert.equal(
      quiet(() => main([], root)),
      0
    );
    writeFileSync(
      join(root, '.github/workflows/b.yml'),
      wf('    steps:\n      - uses: actions/setup-node@abc\n')
    );
    assert.equal(
      quiet(() => main([], root)),
      1
    );
    writeFileSync(
      join(root, '.github/workflows/b.yml'),
      `# github-token-budget: 1 calls/run - one manifest read, no hosted toolcache hit\n${wf('    steps:\n      - uses: actions/setup-node@abc\n')}`
    );
    assert.equal(
      quiet(() => main([], root)),
      0
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stack repair jobs prime pinned Node before invoking the API client', () => {
  for (const [file, jobs] of Object.entries({
    'auto-merge-base-guard.yml': ['guard'],
    'unstack-merged-parent.yml': ['plan', 'unstack'],
  })) {
    const source = readFileSync(
      new URL(`../.github/workflows/${file}`, import.meta.url),
      'utf8'
    );
    assert.equal(countFile(source)['setup-node-manifest'], 0, file);
    if (file === 'auto-merge-base-guard.yml')
      assert.equal(declaredBudget(source)?.calls, 0);
    for (const job of jobs) {
      const body = source.split(`  ${job}:\n`)[1].split(/\n  [\w-]+:\n/)[0];
      const prime = body.indexOf(
        'uses: ./.github/actions/prime-node-toolcache'
      );
      const setup = body.indexOf('uses: actions/setup-node@');
      const run = body.indexOf('run:');
      assert.ok(prime >= 0 && setup > prime && run > setup, `${file}: ${job}`);
      assert.match(body.slice(setup, run), /node-version-file: .nvmrc/);
    }
  }
});

test('unstack planner declares its bounded REST page including client retries', () => {
  const source = readFileSync(
    new URL('../.github/workflows/unstack-merged-parent.yml', import.meta.url),
    'utf8'
  );
  const providers = JSON.parse(
    readFileSync(
      new URL('../packages/api-client/providers.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(declaredBudget(source)?.calls, providers.defaults.maxAttempts);
  const plan = source.split('  plan:\n')[1].split('  unstack:\n')[0];
  assert.match(plan, /api "repos\/\$REPO\/pulls" --method GET/);
  assert.match(
    plan,
    /-f state=open -f base="\$MERGED_HEAD_REF" -F per_page=50/
  );
  assert.doesNotMatch(plan, /--paginate|pr list/);
  assert.match(
    plan,
    /github.event.action == 'closed' &&\s+github.event.pull_request.merged == true &&\s+github.event.pull_request.base.ref == 'main'/
  );
});

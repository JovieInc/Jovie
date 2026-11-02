import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MemoryLedgerStore } from '../packages/api-client/store.ts';
import { stepBlocks } from './lib/workflow-token-budget.mjs';
import {
  evaluateFleetRules,
  githubRequest,
  hasPremiseEvidence,
  isLockedArea,
  main,
  onlyWeakensAssertions,
  runFleetRules,
  validateDoneReceipt,
} from './pr-fleet-rules.mjs';

const command = 'node --test scripts/repair.test.mjs';
const red = `## Red-before-green\nFailing command: \`${command}\`\nBefore fix:\n\`\`\`text\nFAIL expected status 200, received 500\n\`\`\``;
const proof =
  '## Blast radius\nWhat could break: native queue admission.\nProof: node --test scripts/pr-fleet-rules.test.mjs';
const pr = (overrides = {}) => ({
  title: 'feat: policy',
  body: proof,
  labels: [],
  ...overrides,
});
const file = (filename, extra = {}) => ({
  filename,
  status: 'modified',
  ...extra,
});
const check = (pull, files = []) => evaluateFleetRules({ pr: pull, files });

test('1: Done delivery receipts require a merge_group run id or URL', () => {
  const receipt = {
    stage: 'production-proven',
    event: { repository: 'JovieInc/Jovie' },
  };
  assert.equal(validateDoneReceipt(receipt).length, 1);
  for (const mergeGroupRun of [
    { event: 'merge_group', id: 123 },
    {
      event: 'merge_group',
      url: 'https://github.com/JovieInc/Jovie/actions/runs/123',
    },
  ])
    assert.deepEqual(validateDoneReceipt({ ...receipt, mergeGroupRun }), []);
  for (const mergeGroupRun of [
    { event: 'pull_request', id: 123 },
    { event: 'merge_group', id: 0 },
    {
      event: 'merge_group',
      url: 'https://github.com/other/repo/actions/runs/123',
    },
  ])
    assert.equal(validateDoneReceipt({ ...receipt, mergeGroupRun }).length, 1);
  assert.deepEqual(validateDoneReceipt({ stage: 'queued' }), []);
  assert.deepEqual(
    validateDoneReceipt({ stage: 'external-blocked', terminal: true }),
    []
  );
  assert.equal(validateDoneReceipt({ status: 'done' }).length, 1);
});

test('1: claimed Done PR sections are blocking, pending delivery is allowed', () => {
  assert.ok(
    check(pr({ body: '## Done receipt\nProduction verified.' })).errors.length
  );
  assert.deepEqual(
    check(pr({ body: '## Done receipt\nNot yet — awaiting merge queue.' }))
      .errors,
    []
  );
  assert.deepEqual(
    check(
      pr({
        body: '## Done receipt\nMerge-group run: https://github.com/JovieInc/Jovie/actions/runs/123',
      })
    ).errors,
    []
  );
  assert.ok(
    check(
      pr({
        body: '<!-- ## Done receipt\nMerge-group run: 123 -->\n## Done receipt\nDone.',
      })
    ).errors.length
  );
});

test('2: fixes and CI repair labels need a command and pre-fix red evidence', () => {
  for (const pull of [
    pr({ title: 'fix: repair' }),
    pr({ title: 'fix(auth)!: repair' }),
    pr({ labels: [{ name: 'bug' }] }),
    pr({ labels: [{ name: 'ws:ci' }] }),
    pr({ body: '- [x] Bug fix' }),
  ]) {
    assert.ok(check(pull).errors.some(x => x.startsWith('red-before-green:')));
    assert.deepEqual(check({ ...pull, body: `${red}\n${proof}` }).errors, []);
  }
  assert.deepEqual(check(pr()).errors, []);
  for (const name of ['lane-fix-red', 'lane-fix-dequeued'])
    assert.deepEqual(check(pr({ labels: [{ name }] })).errors, []);
  assert.ok(
    check(
      pr({
        title: 'fix: repair',
        body: '## Red-before-green\nFailing command: TODO\nBefore fix: FAIL',
      })
    ).errors.length
  );
  assert.ok(
    check(
      pr({
        title: 'fix: repair',
        body: `## Red-before-green\nFailing command: \`${command}\``,
      })
    ).errors.length
  );
  assert.deepEqual(
    check(
      pr({
        title: 'fix: repair',
        body: `## Red-before-green\nFailing command: \`${command}\`\nFailing run (before fix): https://github.com/JovieInc/Jovie/actions/runs/1`,
      })
    ).errors,
    []
  );
});

test('2: iOS and visual lane exemptions do not exempt mixed path-only changes', () => {
  for (const label of ['ios-ci', 'visual-regression'])
    assert.deepEqual(
      check(pr({ title: 'fix: repair', labels: [{ name: label }] })).errors,
      []
    );
  for (const path of [
    'apps/ios/App.swift',
    '.github/workflows/visual-regression.yml',
    'apps/web/tests/e2e/visual-regression.spec.ts',
    'apps/web/tests/e2e/__snapshots__/home.png',
    'apps/web/tests/visual/home.spec.ts',
    'apps/web/tests/e2e/__screenshots__/home.png',
  ])
    assert.deepEqual(
      check(pr({ title: 'fix: repair' }), [file(path)]).errors,
      []
    );
  assert.ok(
    check(pr({ title: 'fix: repair' }), [
      file('apps/ios/App.swift'),
      file('apps/web/lib/jobs.ts'),
    ]).errors.length
  );
});

test('2: assertion removal, skipping, and broadening alone cannot claim red-to-green', () => {
  const pull = pr({ title: 'fix: repair', body: red });
  for (const patch of [
    '-expect(value).toEqual(42);\n+expect(value).toBeDefined();',
    '-assert.equal(actual, expected);',
    // Synthetic source for the policy, not an executable skipped test.
    `-test('works', () => {\n+${['test', 'skip'].join('.')}('works', () => {`,
  ]) {
    const files = [file('apps/web/tests/repair.test.ts', { patch })];
    assert.equal(onlyWeakensAssertions(files), true);
    assert.ok(check(pull, files).errors.some(x => x.startsWith('assertions:')));
  }
  assert.equal(
    onlyWeakensAssertions([
      file('x.test.ts', {
        patch: '-expect(value).toEqual(1);\n+expect(value).toEqual(2);',
      }),
    ]),
    false
  );
  assert.equal(
    onlyWeakensAssertions([
      file('x.test.ts', {
        status: 'added',
        patch: '+expect(value).toEqual(1);',
      }),
    ]),
    false
  );
  assert.equal(
    onlyWeakensAssertions([
      file('x.ts'),
      file('x.test.ts', { patch: '-expect(value).toEqual(1);' }),
    ]),
    false
  );
});

test('3: premise evidence records assumption and an executed falsifying command/result', () => {
  assert.equal(
    hasPremiseEvidence(
      '## Premise check\nAssumption: dependency versions match.\nFalsifying test: `pnpm install --frozen-lockfile`\nResult: ERR_PNPM_OUTDATED_LOCKFILE disproves the assumption.'
    ),
    true
  );
  for (const body of [
    '',
    '## Premise check\nAssumption: TODO\nFalsifying test: TODO\nResult: TODO',
    '## Premise check\nAssumption: versions match.',
  ])
    assert.equal(hasPremiseEvidence(body), false);
  // Execute the real Python prompt renderer without importing its worker runtime.
  const code = `import ast, pathlib\np=ast.parse(pathlib.Path('scripts/lanes/lane_runner.py').read_text())\nf=next(n for n in p.body if isinstance(n,ast.FunctionDef) and n.name=='render_fix_prompt')\nns={'PLANNING_CONTRACT': [], 'NO_HISTORY_REWRITE': [], 'REPO_SLUG':'JovieInc/Jovie'}\nexec(compile(ast.Module(body=[f],type_ignores=[]),'prompt','exec'),ns)\nprint(ns['render_fix_prompt']({'number':1,'headRefName':'fix/test'},'same check failed twice'))`;
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /same check fails twice in a row/i);
  assert.match(result.stdout, /falsifying test before (?:any )?patch/i);
  assert.match(result.stdout, /Premise check/);
});

test('4: blast radius is warning-only and requires impact plus proof', () => {
  for (const body of [
    '',
    '## Blast radius\nWhat could break: TODO\nProof: TODO',
    '## Blast radius\nWhat could break: queue admission.',
  ]) {
    const result = check(pr({ body }));
    assert.deepEqual(result.errors, []);
    assert.equal(result.warnings.length, 1);
  }
  assert.deepEqual(check(pr()).warnings, []);
});

test('5: real locked paths require a GBrain or locking PR reference', () => {
  for (const path of [
    'apps/web/styles/design-system.css',
    'apps/web/lib/auth/session.ts',
    'apps/web/app/(auth)/signin/page.tsx',
    'packages/auth-routing/src/index.ts',
    'apps/web/lib/clerk-sync.ts',
    'scripts/ratchet-baseline.json',
    'a/baselines/coverage.json',
    'apps/web/data/homepageV2Copy.ts',
    'apps/web/data/homepageFrontDoorCta.ts',
    'apps/web/components/homepage/HomepageEditorialHero.tsx',
  ]) {
    assert.equal(isLockedArea(path), true, path);
    assert.ok(
      check(pr(), [file(path)]).errors.some(x => x.startsWith('locked-areas:')),
      path
    );
    for (const reference of [
      'GBrain: jovie-landing-architecture',
      'Locking PR: #123',
      'Locking PR: https://github.com/JovieInc/Jovie/pull/123',
    ])
      assert.deepEqual(
        check(pr({ body: `${proof}\n## Locked areas\n${reference}` }), [
          file(path),
        ]).errors,
        [],
        reference
      );
  }
  assert.equal(isLockedArea('apps/web/lib/jobs.ts'), false);
  assert.ok(
    check(pr({ body: '## Locked areas\nGBrain: <slug>' }), [
      file('design-system.css'),
    ]).errors.length
  );
  assert.ok(
    check(pr(), [file('new.css', { previous_filename: 'design-system.css' })])
      .errors.length
  );
});

const event = {
  repository: { full_name: 'JovieInc/Jovie' },
  pull_request: { number: 1, head: { sha: 'a'.repeat(40) } },
};
const api =
  (pull, files = []) =>
  async path =>
    path.endsWith('/files?per_page=100&page=1')
      ? files
      : {
          ...pull,
          number: 1,
          changed_files: files.length,
          head: { sha: 'a'.repeat(40) },
        };
test('runner: reads current paginated PR evidence, rejects stale/incomplete reads, queue trivially passes', async () => {
  assert.equal(
    (await runFleetRules({ event, request: api(pr()) })).errors.length,
    0
  );
  assert.ok(
    (await runFleetRules({ event, request: api(pr({ title: 'fix: broken' })) }))
      .errors.length
  );
  assert.deepEqual(
    await runFleetRules({
      event: { merge_group: {} },
      request: () => {
        throw Error('must not query a PR');
      },
    }),
    { errors: [], warnings: [] }
  );
  await assert.rejects(
    runFleetRules({
      event,
      request: async path =>
        path.includes('/files?')
          ? []
          : { number: 1, head: { sha: 'b'.repeat(40) }, changed_files: 0 },
    }),
    /head/
  );
  await assert.rejects(
    runFleetRules({
      event,
      request: async path =>
        path.includes('/files?')
          ? []
          : { number: 1, head: event.pull_request.head, changed_files: 5 },
    }),
    /incomplete|count/
  );
});

test('runner: a path whose type changed (symlink to file) appears twice but counts once', async () => {
  const typeChanged = [
    file('AGENTS.md', { status: 'removed' }),
    file('AGENTS.md', { status: 'added' }),
    file('CLAUDE.md', { status: 'removed' }),
    file('CLAUDE.md', { status: 'added' }),
  ];
  const request = async path =>
    path.includes('/files?')
      ? typeChanged
      : { ...pr(), number: 1, head: event.pull_request.head, changed_files: 2 };
  assert.equal((await runFleetRules({ event, request })).errors.length, 0);
});

test('workflow: GITHUB_TOKEN read-only, non-blocking warning step, source required aggregate includes fleet', () => {
  const source = readFileSync(
    '.github/workflows/source-validation.yml',
    'utf8'
  );
  const workflow = readFileSync('.github/workflows/pr-fleet-rules.yml', 'utf8');
  assert.match(source, /needs: \[deterministic,/);
  // Required enforcement reads the evidence status; the key never lives here.
  const readyJob = source.slice(source.indexOf('\n  ready:'));
  assert.match(readyJob, /name: Require fleet-rule evidence/);
  // Trust the evidence workflow's runs (only main's copy can produce them),
  // never a commit status any branch could post.
  assert.match(readyJob, /fleet-rules-evidence\.yml\/runs\?branch=/);
  assert.match(readyJob, /event=pull_request_target/);
  assert.doesNotMatch(readyJob, /\/statuses/);
  assert.match(
    readyJob,
    /EVENT_UPDATED_AT: \$\{\{ github\.event\.pull_request\.updated_at \}\}/
  );
  assert.doesNotMatch(source, /pr-fleet-rules\.mjs/);
  assert.doesNotMatch(readyJob, /create-github-app-token|CI_APP/);
  assert.match(workflow, /types: \[opened, edited, synchronize, labeled/);
  assert.match(workflow, /merge_group:/);
  assert.doesNotMatch(workflow, /continue-on-error:/);
  // One evidence read for warnings and enforcement, not two.
  assert.equal(
    (workflow.match(/run: node scripts\/pr-fleet-rules\.mjs/g) ?? []).length,
    1
  );
  assert.match(workflow, /pr-fleet-rules\.mjs --with-warnings/);
  assert.doesNotMatch(workflow, /secrets\.|: write/);
});

const WORKFLOWS_DIR = '.github/workflows';
const workflowFiles = () =>
  readdirSync(WORKFLOWS_DIR).filter(f => /\.ya?ml$/.test(f));
const triggersOf = text => {
  const start = text.search(/^["']?on["']?:/m);
  const from = text.slice(start).replace(/^["']?on["']?:/, '');
  const next = from.search(/^\S/m);
  const block = next < 0 ? from : from.slice(0, next);
  // Block form (`  pull_request:`), inline list (`[a, b]`) or scalar (`on: a`).
  const keys = [...block.matchAll(/^ {2}([a-z_]+):/gm)].map(m => m[1]);
  const inline = block.match(/^\s*\[?([a-z_,\s]+)\]?\s*$/m)?.[1] ?? '';
  return new Set([...keys, ...inline.split(/[,\s]+/).filter(Boolean)]);
};
// Triggers that execute the PR branch's own copy of the workflow with secrets.
const BRANCH_CODE_TRIGGERS = [
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
];

test('contract: no app private key is referenced by a workflow that runs the PR branch copy', () => {
  // Any same-repo branch can edit such a workflow to print the key, and an app
  // key mints full-installation tokens. Fork-safe base code: pull_request_target,
  // workflow_run, merge_group. (push/workflow_dispatch run the branch copy too,
  // so repo-level secrets stay writer-reachable until the key moves to a
  // main-only environment.) These files predate the
  // contract and are tracked debt; the list may only shrink.
  const KNOWN_DEBT = new Map([
    ['fork-pr-gate.yml', 'CI_APP_PRIVATE_KEY'],
    ['lane-fix-relay.yml', 'SYMPHONY_APP_PRIVATE_KEY'],
    ['source-validation.yml', 'JOVIE_BOT_PRIVATE_KEY'],
  ]);
  const found = new Map();
  for (const name of workflowFiles()) {
    const text = readFileSync(join(WORKFLOWS_DIR, name), 'utf8');
    const triggers = triggersOf(text);
    if (!BRANCH_CODE_TRIGGERS.some(t => triggers.has(t))) continue;
    const keys = [
      ...new Set(text.match(/secrets\.[A-Z0-9_]*PRIVATE_KEY/g) ?? []),
    ].map(k => k.replace('secrets.', ''));
    if (keys.length) found.set(name, keys.join(','));
  }
  const fresh = [...found].filter(
    ([name, keys]) => KNOWN_DEBT.get(name) !== keys
  );
  assert.deepEqual(
    fresh,
    [],
    'move the token mint into a pull_request_target/workflow_run workflow'
  );
  for (const name of KNOWN_DEBT.keys())
    assert.ok(
      found.has(name),
      `${name} no longer exposes a key to branch code: drop it from KNOWN_DEBT`
    );
  // CI_APP_PRIVATE_KEY specifically: only the Fork PR Gate debt remains.
  assert.deepEqual(
    [...found]
      .filter(([, keys]) => keys.includes('CI_APP_PRIVATE_KEY'))
      .map(([n]) => n),
    ['fork-pr-gate.yml']
  );
});

test('contract: triggersOf reads block, inline and scalar forms', () => {
  assert.deepEqual(
    [
      ...triggersOf(
        'name: x\non:\n  pull_request:\n    types: [a]\n  group: y\njobs: {}'
      ),
    ].sort(),
    ['group', 'pull_request']
  );
  assert.ok(
    triggersOf('on: [pull_request, push]\njobs: {}').has('pull_request')
  );
  assert.ok(
    triggersOf('on: pull_request_review\njobs: {}').has('pull_request_review')
  );
});

test('contract: Fleet Rules Evidence is base-branch code only and never hands the key to setup-node', () => {
  const text = readFileSync(
    join(WORKFLOWS_DIR, 'fleet-rules-evidence.yml'),
    'utf8'
  );
  const triggers = triggersOf(text);
  assert.deepEqual([...triggers].sort(), [
    'pull_request_target',
    'workflow_run',
  ]);
  // Two mints, both read-only and both in base-branch jobs: the evidence job and the
  // workflow_run re-run hop (its lookups moved off github.token, 2026-10-26).
  assert.equal((text.match(/secrets\./g) ?? []).length, 2);
  assert.equal(
    (text.match(/private-key: \$\{\{ secrets\.CI_APP_PRIVATE_KEY \}\}/g) ?? [])
      .length,
    2
  );
  assert.match(text, /private-key: \$\{\{ secrets\.CI_APP_PRIVATE_KEY \}\}/);
  assert.match(
    text,
    /permission-contents: read\n\s+permission-pull-requests: read/
  );
  assert.doesNotMatch(text, /permission-[a-z-]+: write/);
  // Every checkout is main, sparse, without persisted credentials.
  const checkouts = (text.match(/actions\/checkout@/g) ?? []).length;
  assert.ok(checkouts >= 1);
  assert.equal(
    (
      text.match(
        /ref: main\n\s+fetch-depth: 1\n\s+persist-credentials: false\n\s+sparse-checkout:/g
      ) ?? []
    ).length,
    checkouts
  );
  assert.doesNotMatch(text, /github\.event\.pull_request\.head\.(ref|repo)/);
  // setup-node keeps its default token; the minted token never reaches it.
  const setupNode = text.slice(
    text.indexOf('actions/setup-node@'),
    text.indexOf('- name: Read evidence')
  );
  assert.doesNotMatch(setupNode, /token:|fleet-token/);
  // The minted read token feeds the pinned dependency review, policy script,
  // and re-run lookups; setup-node keeps its own token.
  assert.deepEqual(
    [
      ...text.matchAll(
        /(\w+): \$\{\{ steps\.fleet-token\.outputs\.token \}\}/g
      ),
    ].map(match => match[1]),
    ['token', 'FLEET_TOKEN', 'GH_READ_TOKEN']
  );
});

test('verdict script maps exit codes to the job result and never turns a deferral into a pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-verdict-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    const posts = join(dir, 'posts.log');
    // Stand-in for packages/api-client/cli.ts: records the gh arguments.
    writeFileSync(
      join(dir, 'client.mjs'),
      `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(posts)}, process.argv.slice(2).join(' ') + '\\n');\n`
    );
    const run = (code, lines) => {
      writeFileSync(posts, '');
      writeFileSync(
        join(dir, 'scripts', 'pr-fleet-rules.mjs'),
        `console.log(${JSON.stringify(lines)}); process.exitCode = ${code};`
      );
      const done = spawnSync(
        'bash',
        [join(process.cwd(), '.github/scripts/fleet-rules-verdict.sh')],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            FLEET_DEFERRED_BACKOFF_STEP_S: '0',
            API_CLIENT: join(dir, 'client.mjs'),
            GH_TOKEN: 'gh-token-value',
            FLEET_TOKEN: 'app-token-value',
            REPOSITORY: 'o/r',
            HEAD_SHA: 'a'.repeat(40),
            RUN_URL: 'https://example.test/run',
          },
        }
      );
      return {
        status: done.status,
        posts: readFileSync(posts, 'utf8'),
        out: done.stdout + done.stderr,
      };
    };
    // The job result is the verdict. No commit status is posted: it was
    // informational and its github.token POST turned a verdict read on the CI
    // App budget into a quota deferral (run 40164178818).
    const noStatusPost = result =>
      assert.doesNotMatch(result.posts, /statuses|-X POST/);
    const green = run(0, '');
    assert.equal(green.status, 0);
    noStatusPost(green);
    // A decisive verdict looks up the failed Source Validation run to re-run.
    assert.match(
      green.posts,
      /gh --priority repair -- api repos\/o\/r\/actions\/workflows\/source-validation\.yml\/runs/
    );
    const red = run(1, '::error::red-before-green: add a command');
    assert.equal(red.status, 1);
    noStatusPost(red);
    const deferred = run(
      75,
      '::error::Fleet rule evidence unavailable (github-quota-deferred)'
    );
    // A deferral is exit 75, never a pass, and spends no further quota.
    assert.equal(deferred.status, 75);
    assert.equal(deferred.posts, '');
    assert.doesNotMatch(
      green.out + red.out + deferred.out,
      /app-token-value|gh-token-value/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI warning mode always returns zero, even when evidence or policy fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-'));
  const path = join(dir, 'event.json');
  const env = { GITHUB_EVENT_PATH: path };
  const logs = [];
  try {
    writeFileSync(path, JSON.stringify(event));
    assert.equal(
      await main({
        args: [],
        env,
        request: api(pr()),
        log: x => logs.push(x),
      }),
      0
    );
    assert.equal(
      await main({
        args: [],
        env,
        request: api(pr({ title: 'fix: broken' })),
        log: x => logs.push(x),
      }),
      1
    );
    assert.match(logs.pop(), /^::error::red-before-green/);
    assert.equal(
      await main({
        args: ['--warnings-only'],
        env,
        request: api(pr({ title: 'fix: broken', body: '' })),
        log: x => logs.push(x),
      }),
      0
    );
    assert.match(logs.pop(), /^::warning::blast-radius/);
    const broken = async () => {
      throw Error('do not log this private API detail');
    };
    for (const warningOnly of [false, true]) {
      const args = warningOnly ? ['--warnings-only'] : [];
      const rc = warningOnly ? 0 : 1;
      assert.equal(
        await main({ args, env, request: broken, log: x => logs.push(x) }),
        rc
      );
      assert.doesNotMatch(logs.pop(), /private API detail/);
    }
    assert.equal(
      await main({
        args: ['--warnings-only'],
        env,
        request: api(pr()),
        log: x => logs.push(x),
      }),
      0
    );
    writeFileSync(path, 'malformed');
    assert.equal(
      await main({ args: ['--warnings-only'], env, log: x => logs.push(x) }),
      0
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('quota or outage evidence failures hold once, then defer with the relay marker and never pass', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-quota-'));
  const path = join(dir, 'event.json');
  const env = { GITHUB_EVENT_PATH: path };
  const quota = (retryAt = null, failure = 'primary') =>
    Object.assign(new Error('github exhausted: secret detail'), {
      failure,
      retryAt,
      exitCode: 75,
    });
  const T0 = 1_000_000_000_000;
  try {
    writeFileSync(path, JSON.stringify(event));
    // Reset inside the hold budget: wait once, then read the evidence.
    {
      const logs = [];
      const sleeps = [];
      let reads = 0;
      const inner = api(pr());
      const request = async (...args) => {
        if (reads++ === 0) throw quota(T0 + 30_000);
        return inner(...args);
      };
      assert.equal(
        await main({
          args: ['--with-warnings'],
          env,
          request,
          log: x => logs.push(x),
          now: () => T0,
          sleep: async ms => sleeps.push(ms),
        }),
        0
      );
      assert.deepEqual(sleeps, [31_000]);
      assert.match(logs[0], /^::notice title=GitHub API hold::/);
    }
    // Default clock and sleep: a reset that already passed holds zero seconds.
    {
      let reads = 0;
      const inner = api(pr());
      assert.equal(
        await main({
          args: [],
          env,
          request: async (...args) => {
            if (reads++ === 0) throw quota(Date.now() - 5_000);
            return inner(args[0]);
          },
          log: () => {},
        }),
        0
      );
    }
    // Reset past the budget, a second failure, or no reset time: distinct
    // transient status, marker for the relay, no secret detail, never pass.
    for (const [label, retryAt] of [
      ['reset past the budget', T0 + 3_000_000],
    ]) {
      /** @type {string[]} */
      const logs = [];
      /** @type {number[]} */
      const sleeps = [];
      assert.equal(
        await main({
          args: [],
          env,
          request: async () => {
            throw quota(retryAt);
          },
          log: x => logs.push(x),
          now: () => T0,
          sleep: async ms => sleeps.push(ms),
        }),
        75,
        String(label)
      );
      assert.deepEqual(sleeps, [], String(label));
      assert.match(String(logs.at(-1)), /github-quota-deferred/);
      assert.doesNotMatch(String(logs.at(-1)), /secret detail/);
    }
    // Unknown reset: doubling backoff (15s, 30s, 60s) inside the 120s
    // budget, then the deferral. Never a pass, never a policy verdict.
    {
      const logs = [];
      const sleeps = [];
      assert.equal(
        await main({
          args: [],
          env,
          request: async () => {
            throw quota(null);
          },
          log: x => logs.push(x),
          now: () => T0,
          sleep: async ms => sleeps.push(ms),
        }),
        75
      );
      assert.deepEqual(sleeps, [15_000, 30_000, 60_000]);
      assert.match(String(logs.at(-1)), /github-quota-deferred/);
    }
    // Advisory (pull_request copy): a 403 rate limit that outlasts the hold is
    // an infrastructure warning, exit 0, no error annotation, no red verdict.
    {
      const logs = [];
      const sleeps = [];
      assert.equal(
        await main({
          args: ['--with-warnings', '--advisory'],
          env,
          request: async () => {
            throw quota(null);
          },
          log: x => logs.push(x),
          now: () => T0,
          sleep: async ms => sleeps.push(ms),
        }),
        0
      );
      assert.equal(sleeps.length, 3);
      assert.ok(!logs.some(x => x.startsWith('::error')));
      assert.match(
        String(logs.at(-1)),
        /^::warning title=Infrastructure, not a verdict::.*github-quota-deferred/
      );
      // Recovery after one 403 (authoritative mode): backoff once, then the policy verdict decides.
      let reads = 0;
      const inner = api(pr({ title: 'fix: broken', body: '' }));
      const recovered = [];
      assert.equal(
        await main({
          args: ['--with-warnings'],
          env,
          request: async path => {
            if (reads++ === 0) throw quota(T0 + 5_000);
            return inner(path);
          },
          log: x => recovered.push(x),
          now: () => T0,
          sleep: async () => {},
        }),
        1
      );
      assert.ok(recovered.some(x => x.startsWith('::error::red-before-green')));
    }
    // Advisory reads the PR from the event payload: files are the only call.
    {
      const paths = [];
      const adv = JSON.parse(JSON.stringify(event));
      adv.pull_request = { ...adv.pull_request, ...pr(), changed_files: 0 };
      adv.pull_request.head = event.pull_request.head;
      const result = await runFleetRules({
        event: adv,
        request: async p => {
          paths.push(p);
          return [];
        },
        fromEvent: true,
      });
      assert.deepEqual(result.errors, []);
      assert.equal(paths.length, 1);
      assert.match(paths[0], /\/files\?/);
    }
    {
      const logs = [];
      assert.equal(
        await main({
          args: [],
          env,
          request: async () => {
            throw quota(T0 + 1_000, 'transient');
          },
          log: x => logs.push(x),
          now: () => T0,
          sleep: async () => {},
        }),
        75
      );
      assert.match(logs.at(-1), /github-quota-deferred/);
    }
    // A real policy red or an unclassified read failure keeps the old status.
    {
      const logs = [];
      assert.equal(
        await main({
          args: [],
          env,
          request: async () => {
            throw new Error('malformed');
          },
          log: x => logs.push(x),
        }),
        1
      );
      assert.doesNotMatch(logs.at(-1), /github-quota-deferred/);
    }
    // Warning-only mode never blocks, even on quota.
    assert.equal(
      await main({
        args: ['--warnings-only'],
        env,
        request: async () => {
          throw quota();
        },
        log: () => {},
      }),
      0
    );
    // --with-warnings prints the warning and still enforces the error.
    const logs = [];
    assert.equal(
      await main({
        args: ['--with-warnings'],
        env,
        request: api(pr({ title: 'fix: broken', body: '' })),
        log: x => logs.push(x),
      }),
      1
    );
    assert.ok(logs.some(x => x.startsWith('::warning::blast-radius')));
    assert.ok(logs.some(x => x.startsWith('::error::red-before-green')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('REST adapter uses only GITHUB_TOKEN, a finite timeout and sanitized errors', async () => {
  const original = globalThis.fetch;
  const store = new MemoryLedgerStore();
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(
        String(url),
        'https://api.github.com/repos/JovieInc/Jovie/pulls/1'
      );
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(
        new Headers(options.headers).get('Authorization'),
        `Bearer ${process.env.GITHUB_TOKEN}`
      );
      return Response.json({ number: 1 });
    };
    assert.deepEqual(
      await githubRequest('/repos/JovieInc/Jovie/pulls/1', { store }),
      {
        number: 1,
      }
    );
    globalThis.fetch = async () => new Response(null, { status: 403 });
    await assert.rejects(githubRequest('/unavailable', { store }), /403/);
  } finally {
    globalThis.fetch = original;
  }
});

test('runner handles pagination and metadata moving during the read fail-closed', async () => {
  const files = Array.from({ length: 100 }, (_, i) => file(`src/file${i}.ts`));
  let reads = 0;
  const request = async path => {
    if (path.includes('/files?')) return path.endsWith('page=1') ? files : [];
    reads++;
    return { ...pr(), changed_files: 100, head: event.pull_request.head };
  };
  assert.deepEqual((await runFleetRules({ event, request })).errors, []);
  assert.equal(reads, 1);
  await assert.rejects(runFleetRules({ event: {}, request }), /metadata/);
  await assert.rejects(
    runFleetRules({
      event,
      request: async path =>
        path.includes('/files?')
          ? {}
          : { ...pr(), head: event.pull_request.head },
    }),
    /incomplete/
  );
  reads = 0;
  await assert.rejects(
    runFleetRules({
      event,
      request: async path =>
        path.includes('/files?')
          ? []
          : {
              ...pr(),
              changed_files: 0,
              head: { sha: 'b'.repeat(40) },
            },
    }),
    /head changed/
  );
});

test('additional safe policy branches: missing/null bodies, nested receipts, Python assertions, deletion, unrelated additions', () => {
  assert.deepEqual(check(pr({ body: null, labels: ['unrelated'] })).errors, []);
  assert.deepEqual(
    validateDoneReceipt({
      stage: 'done',
      transition: { mergeGroupRun: { event: 'merge_group', id: '42' } },
    }),
    []
  );
  assert.deepEqual(
    validateDoneReceipt({
      stage: 'done',
      event: {
        evidence: {
          mergeGroupRun: {
            event: 'merge_group',
            url: 'https://github.com/JovieInc/Jovie/actions/runs/42/attempts/2',
          },
        },
      },
    }),
    []
  );
  assert.equal(
    onlyWeakensAssertions([file('test_x.py', { patch: '-assert x == 3' })]),
    true
  );
  assert.equal(
    onlyWeakensAssertions([
      file('x.test.js', { patch: '-assert(x);\n+const newFixture = 2;' }),
    ]),
    false
  );
  assert.equal(
    onlyWeakensAssertions([file('x.test.js', { patch: '+// comment only' })]),
    false
  );
  assert.equal(onlyWeakensAssertions([file('x.test.js')]), false);
  assert.deepEqual(
    check(pr({ body: '## Locked areas\nGBrain: gbrain://jovie-auth' }), [
      file('auth/session.ts'),
    ]).errors,
    []
  );
  assert.ok(
    check(pr({ body: '## Red-before-green\nNo evidence.' }), [
      file('x.test.ts', { patch: '-assert(x)' }),
    ]).errors.length
  );
});

test('missing test patches and placeholder decision references cannot bypass blocking checks', () => {
  assert.ok(
    check(pr({ title: 'fix: repair', body: red }), [
      file('x.test.ts'),
    ]).errors.some(x => x.startsWith('assertions:'))
  );
  assert.deepEqual(
    check(pr({ title: 'fix: repair', body: red }), [
      file('x.test.ts', { status: 'added' }),
    ]).errors,
    []
  );
  assert.ok(
    check(pr({ body: '## Locked areas\nGBrain: TODO' }), [
      file('design-system.css'),
    ]).errors.length
  );
  assert.deepEqual(
    check(
      pr({
        body: '## Locked areas\nGBrain: https://brain.example.test/jovie-auth',
      }),
      [file('auth/session.ts')]
    ).errors,
    []
  );
});

test('section keeps a "# " line inside a code fence in the section', async () => {
  const { section } = await import('./pr-fleet-rules.mjs');
  const body = [
    '## Red-before-green',
    'Failing command: `x`',
    '```text',
    '# comment line in the failing output',
    'FAIL expected 1',
    '```',
    '## Next',
    'other',
  ].join('\n');
  const out = section(body, 'Red-before-green');
  assert.match(out, /# comment line/);
  assert.match(out, /FAIL expected 1/);
  assert.doesNotMatch(out, /other/);
});

// Fleet policy runs before pnpm install. Reuse its dependency-free workflow
// step reader so these regressions exercise the same bootstrap environment.
const jobText = (file, job) =>
  readFileSync(`.github/workflows/${file}.yml`, 'utf8')
    .split(`\n  ${job}:`)[1]
    .split(/\n  [\w-]+:/)[0];
const namedStep = (job, name) => {
  const step = stepBlocks(job).find(block => block.includes(`name: ${name}\n`));
  assert.ok(step, `required workflow step missing: ${name}`);
  return step;
};
const stepValue = (step, key) =>
  step.match(new RegExp(`^\\s+(?:- )?${key}: (.+)$`, 'm'))?.[1];

test('Dependabot dependency review uses the required trusted evidence job', () => {
  const security = jobText('source-validation', 'security');
  const evidence = jobText('fleet-rules-evidence', 'evidence');
  const review = namedStep(evidence, 'Review Dependabot dependencies');
  assert.equal(
    stepValue(review, 'if'),
    "github.event.pull_request.user.login == 'dependabot[bot]'"
  );
  const incumbent = namedStep(
    security,
    'Review added and upgraded dependencies'
  );
  assert.equal(stepValue(review, 'uses'), stepValue(incumbent, 'uses'));
  assert.equal(
    stepValue(review, 'config-file'),
    stepValue(incumbent, 'config-file')
  );
  assert.equal(
    stepValue(review, 'repo-token'),
    '${{ steps.fleet-token.outputs.token }}'
  );
  assert.equal(stepValue(review, 'continue-on-error'), undefined);
  assert.equal(stepValue(evidence, 'timeout-minutes'), '6');
  const checkout = stepBlocks(evidence).find(step =>
    /uses: actions\/checkout@/.test(step)
  );
  assert.ok(checkout);
  assert.equal(stepValue(checkout, 'ref'), 'main');
  assert.equal(stepValue(checkout, 'persist-credentials'), 'false');
  assert.ok(checkout.includes('.github/dependency-review-config.yml'));
  assert.ok(evidence.indexOf(review) < evidence.indexOf('name: Read evidence'));
  for (const name of [
    'Mint dependency review read token',
    'Review added and upgraded dependencies',
  ]) {
    assert.equal(
      stepValue(namedStep(security, name), 'if'),
      "steps.reuse.outputs.reuse != 'true' && (github.event.pull_request.user.login != 'dependabot[bot]' || github.event.pull_request.base.ref != 'main')"
    );
  }
  assert.equal(stepValue(security, 'timeout-minutes'), '20');
});

test('PR Ready executes the exact-head evidence gate and denies missing, failed, or unrelated reviews', () => {
  const step = namedStep(
    jobText('source-validation', 'ready'),
    'Require fleet-rule evidence'
  );
  const run = step
    .match(/^ {8}run: \|\n([\s\S]*)/m)?.[1]
    .replace(/^ {10}/gm, '');
  assert.ok(run, 'execute the real PR Ready run block');
  const dir = mkdtempSync(join(tmpdir(), 'dependency-evidence-'));
  try {
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(
      join(dir, '.github/workflows/fleet-rules-evidence.yml'),
      'trusted workflow'
    );
    mkdirSync(join(dir, 'packages/api-client'), { recursive: true });
    writeFileSync(
      join(dir, 'packages/api-client/cli.ts'),
      'process.stdout.write(process.env.RUNS);'
    );
    const row = {
      path: '.github/workflows/fleet-rules-evidence.yml',
      display_title: 'fleet-rules #42 base=main',
      head_branch: 'dependabot/example',
      head_repository: { id: 1 },
      created_at: '2026-10-29T01:00:00Z',
      id: 42,
      status: 'completed',
      conclusion: 'success',
      html_url: 'https://github.com/o/r/actions/runs/42',
    };
    for (const [name, rows, expected] of [
      ['success', [row], 0],
      ['failed dependency review', [{ ...row, conclusion: 'failure' }], 1],
      ['missing evidence', [], 75],
      [
        'in-flight review',
        [{ ...row, status: 'in_progress', conclusion: null }],
        75,
      ],
      ['cancelled review', [{ ...row, conclusion: 'cancelled' }], 75],
      ['wrong workflow', [{ ...row, path: '.github/workflows/other.yml' }], 75],
      [
        'wrong PR',
        [{ ...row, display_title: 'fleet-rules #43 base=main' }],
        75,
      ],
      ['wrong head branch', [{ ...row, head_branch: 'other' }], 75],
      ['wrong repository', [{ ...row, head_repository: { id: 2 } }], 75],
      ['stale evidence', [{ ...row, created_at: '2026-10-28T01:00:00Z' }], 75],
      [
        'new failure supersedes success',
        [
          row,
          {
            ...row,
            id: 43,
            created_at: '2026-10-29T01:01:00Z',
            conclusion: 'failure',
          },
        ],
        1,
      ],
    ]) {
      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', run], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          HEAD_SHA: 'a'.repeat(40),
          PR_NUMBER: '42',
          HEAD_REF: row.head_branch,
          HEAD_REPO_ID: '1',
          REPOSITORY: 'o/r',
          EVENT_UPDATED_AT: row.created_at,
          RUNS: JSON.stringify({ workflow_runs: rows }),
        },
      });
      assert.equal(
        result.status,
        expected,
        `${name}: ${result.stdout}${result.stderr}`
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fleet policy regressions run before workspace dependencies are installed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-bootstrap-'));
  try {
    for (const path of [
      'scripts/pr-fleet-rules.test.mjs',
      'scripts/pr-fleet-rules.mjs',
      'scripts/lib/workflow-token-budget.mjs',
      'scripts/lib/wins-ledger.mjs',
      'packages/api-client',
      '.github/workflows/source-validation.yml',
      '.github/workflows/fleet-rules-evidence.yml',
    ]) {
      const target = join(dir, path);
      mkdirSync(join(target, '..'), { recursive: true });
      cpSync(path, target, { recursive: true });
    }
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-name-pattern=Dependabot dependency review uses|PR Ready executes',
        'scripts/pr-fleet-rules.test.mjs',
      ],
      { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH } }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /pass 2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MemoryLedgerStore } from '../packages/api-client/store.ts';
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
    pr({ labels: [{ name: 'lane-fix-red' }] }),
    pr({ labels: [{ name: 'ws:ci' }] }),
    pr({ body: '- [x] Bug fix' }),
  ]) {
    assert.ok(check(pull).errors.some(x => x.startsWith('red-before-green:')));
    assert.deepEqual(check({ ...pull, body: `${red}\n${proof}` }).errors, []);
  }
  assert.deepEqual(check(pr()).errors, []);
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
  const code = `import ast, pathlib\np=ast.parse(pathlib.Path('scripts/lanes/lane_runner.py').read_text())\nf=next(n for n in p.body if isinstance(n,ast.FunctionDef) and n.name=='render_fix_prompt')\nns={'PLANNING_CONTRACT': [], 'REPO_SLUG':'JovieInc/Jovie'}\nexec(compile(ast.Module(body=[f],type_ignores=[]),'prompt','exec'),ns)\nprint(ns['render_fix_prompt']({'number':1,'headRefName':'fix/test'},'same check failed twice'))`;
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
      request: async () => ({ number: 1, head: { sha: 'b'.repeat(40) } }),
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

test('workflow: GITHUB_TOKEN read-only, non-blocking warning step, source required aggregate includes fleet', () => {
  const source = readFileSync(
    '.github/workflows/source-validation.yml',
    'utf8'
  );
  const workflow = readFileSync('.github/workflows/pr-fleet-rules.yml', 'utf8');
  assert.match(
    source,
    /name: Enforce PR fleet rules[\s\S]*?run: node scripts\/pr-fleet-rules.mjs/
  );
  assert.match(source, /needs: \[deterministic,/);
  assert.match(workflow, /types: \[opened, edited, synchronize, labeled/);
  assert.match(workflow, /merge_group:/);
  assert.doesNotMatch(workflow, /continue-on-error:/);
  assert.match(workflow, /exit 0/);
  assert.doesNotMatch(workflow, /secrets\.|: write/);
});

test('CLI warning mode always returns zero, even when evidence or policy fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-'));
  const path = join(dir, 'event.json');
  const env = { GITHUB_EVENT_PATH: path };
  const logs = [];
  try {
    writeFileSync(path, JSON.stringify(event));
    assert.equal(
      await main({ args: [], env, request: api(pr()), log: x => logs.push(x) }),
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
  assert.equal(reads, 2);
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
              head: { sha: ++reads === 1 ? 'a'.repeat(40) : 'b'.repeat(40) },
            },
    }),
    /changed during read/
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

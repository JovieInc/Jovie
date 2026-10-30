import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  downgradeHostRed,
  failureSummaryLines,
  GENERATORS,
  HEAVY_GUARDS,
  NARROWED,
  parseArgs,
  typecheckTargets,
} from './preflight-changed.mjs';

const file = (filename, status = 'modified') => ({
  filename,
  status,
  patch: '',
});

test('failure summary keeps a real Node failure before later passing-title noise', t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'preflight summary ')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fixture = join(dir, 'named case.test.mjs');
  writeFileSync(
    fixture,
    [
      "import assert from 'node:assert/strict';",
      "import test from 'node:test';",
      "test('retains the companion exit code', () => assert.equal(127, 3));",
    ].join('\n')
  );
  const driver = `
    import { spawnSync } from 'node:child_process';
    const child = spawnSync(process.execPath,
      ['--test', '--test-reporter=spec', process.argv[1]],
      { encoding: 'utf8', timeout: 5000 });
    process.stdout.write(child.stdout || '');
    process.stderr.write(child.stderr || '');
    for (let i = 0; i < 24; i++)
      console.log('  ✓ reports missing inputs and fails on an error ' + i);
    process.exitCode = child.status ?? 1;
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', driver, fixture],
    {
      encoding: 'utf8',
      timeout: 10_000,
      // The fixture must run its own Node reporter, outside this test context.
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => key !== 'NODE_TEST_CONTEXT'
        )
      ),
    }
  );
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 1, child.stdout + child.stderr);
  const output = child.stdout + child.stderr;
  assert.match(output, /✓ reports missing inputs and fails on an error 23/);
  const summary = failureSummaryLines(output).join('\n');
  assert.match(summary, /test at .+named case\.test\.mjs:3:1/, summary);
  assert.match(summary, /✖ retains the companion exit code/);
  assert.match(summary, /AssertionError \[ERR_ASSERTION\]/);
  assert.match(summary, /127 !== 3/);
  assert.match(summary, /at TestContext/);
  assert.doesNotMatch(summary, /✓ reports missing inputs/);
});

test('failure summary recognizes reporter and compiler diagnostics with context', () => {
  const noise = [
    '✓ fails safely on error',
    '✔ rejects a missing file',
    'ok 7 - reports failures',
    'PASS passing case handles errors',
    '✓ passing file.ts(2,3): error TS2322: expected negative control',
  ].join('\n');
  const cases = [
    ['test at /tmp/a folder/named.test.mjs:7:2', '✖ preserves the value'],
    [
      '\u001b[31mFAIL\u001b[39m |unit| a.test.mjs > named case',
      'AssertionError: expected 3',
    ],
    ['not ok 2 - preserves the value', "  error: 'expected 3'"],
    ['✖ named test (1ms)', '  AssertionError [ERR_ASSERTION]: expected 3'],
    [
      'src/a file.ts(12,3): error TS2322: incompatible value',
      '  required type is string',
    ],
    [
      'src/a file.ts:12:3: error TS2322: incompatible value',
      '  required type is string',
    ],
    ['error TS18003: no inputs', '  config contains no files'],
    ['TypeError: unavailable value', '  at operation (file.mjs:3:1)'],
  ];
  for (const [header, cause] of cases) {
    const summary = failureSummaryLines(
      [noise, header, cause, noise].join('\n')
    );
    assert.equal(
      summary[1],
      header.replace(/\u001b\[[0-9;]*m/g, ''),
      summary.join('\n')
    );
    assert.equal(summary[2], cause);
    assert.doesNotMatch(summary.join('\n'), /\u001b/);
  }
  const detailed = failureSummaryLines(
    [
      '✖ earlier progress line',
      'test at /tmp/a folder/named.test.mjs:7:2',
      '✖ named case',
      'AssertionError: expected 3',
    ].join('\n')
  );
  assert.equal(detailed[1], 'test at /tmp/a folder/named.test.mjs:7:2');
});

test('failure summary bounds context and labels an unrecognized or empty tail', () => {
  const long = 'x'.repeat(300);
  const summary = failureSummaryLines(
    [
      'FAIL a.test.mjs > first case',
      ...Array.from({ length: 30 }, (_, i) => `${i}: ${long}`),
      'FAIL b.test.mjs > another case',
    ].join('\n')
  );
  assert.equal(summary.length, 14);
  assert.ok(summary.every(line => line.length <= 220));
  assert.match(
    summary[0],
    /first recognized failure context; output is bounded/
  );
  assert.equal(summary[1], 'FAIL a.test.mjs > first case');
  assert.ok(!summary.some(line => line.includes('another case')));
  const tail = failureSummaryLines(
    Array.from({ length: 20 }, (_, i) => `ordinary output ${i}: ${long}`).join(
      '\n'
    )
  );
  assert.equal(tail.length, 14);
  assert.ok(tail.every(line => line.length <= 220));
  assert.match(
    tail[0],
    /no explicit failure header in retained output; showing tail/
  );
  assert.match(tail[1], /^ordinary output 7:/);
  assert.match(tail[13], /^ordinary output 19:/);
  assert.deepEqual(failureSummaryLines(' \n\n'), [tail[0]]);
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
  assert.ok(ids.includes('blast-radius'));
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
    'web-tests',
  ]);
});

test('arguments parse and unknown flags fail', () => {
  assert.equal(parseArgs(['--no-coverage', '--base', 'dev']).coverage, false);
  assert.throws(() => parseArgs(['--nope']));
  assert.ok(HEAVY_GUARDS.has('merged-with-base-invariants'));
  assert.ok(GENERATORS.some(g => g.id === 'workflow-topology'));
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

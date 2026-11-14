import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildRules, checkGuard, scanSource } from './external-api-guard.mjs';
import {
  failureSummaryLines,
  failureTestPaths,
} from './preflight-failure-summary.mjs';

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

test('failure summary retains source-guard diagnostics before later passing output', () => {
  const path = 'scripts/restore-helper.mjs';
  const rules = buildRules({ providers: {} }).filter(
    rule => rule.id === 'gh-subprocess'
  );
  const errors = checkGuard({
    found: {
      [path]: scanSource(
        path,
        '/** Restore failed (`gh api` returned 403). */',
        rules
      ),
    },
    ratchet: {},
    allowlist: [],
  });
  assert.equal(errors.length, 1);
  const diagnostic = `external-api-guard: ${errors[0]}`;
  const output = [
    'external-api-guard: ok',
    diagnostic,
    'external-api-guard: FAIL (1 call site left to migrate)',
    ...Array.from({ length: 24 }, (_, i) => `ok ${i + 1} - passing check`),
  ].join('\n');
  const summary = failureSummaryLines(output);
  assert.match(summary[0], /first recognized failure context/);
  assert.equal(summary[1], diagnostic.slice(0, 220));
  assert.match(
    summary[1],
    /restore-helper\.mjs:1 gh-subprocess: 1 direct call/
  );
  assert.ok(summary.length <= 14);
  assert.ok(summary.every(line => line.length <= 220));
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

test('failure lines keep the test path after the output tail is discarded', () => {
  const log = [
    'not ok 3 - dispatch stays inside one block',
    "  location: 'file:///repo/scripts/lib/__tests__/script-contract-affected.test.mjs:12:1'",
    'ok 4 - passing test mentions scripts/lib/__tests__/ok.test.mjs',
    'FAIL scripts/lib/__tests__/merge-queue-guard.test.mjs > admits a clean head',
    '# fail 8',
  ].join('\n');
  assert.deepEqual(failureTestPaths(log), [
    'scripts/lib/__tests__/script-contract-affected.test.mjs',
    'scripts/lib/__tests__/merge-queue-guard.test.mjs',
  ]);
});

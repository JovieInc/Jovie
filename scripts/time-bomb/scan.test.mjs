import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  confirmTimeBombs,
  failuresFromVitestReport,
  fileFindings,
  issuePlan,
  parseArgs,
  shiftedEnv,
} from './scan.mjs';

test('the clock shim moves new Date, Date() and Date.now but not explicit dates', () => {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      'console.log(JSON.stringify([Date.now(), new Date().getTime(), Date(), new Date(0).getTime(), new Date() instanceof Date]))',
    ],
    {
      env: shiftedEnv(7, { ...process.env, NODE_OPTIONS: '' }),
      encoding: 'utf8',
    }
  );
  assert.equal(probe.status, 0, probe.stderr);
  const [now, constructed, called, epoch, isDate] = JSON.parse(probe.stdout);
  // The child shift is absolute; remove any scanner-applied parent shift.
  const ahead = now - Date.now() + (globalThis.__jovieClockShift ?? 0);
  assert.ok(ahead > 7 * 86_400_000 - 60_000 && ahead < 7 * 86_400_000 + 60_000);
  assert.ok(Math.abs(constructed - now) < 60_000);
  assert.ok(Math.abs(Date.parse(called) - now) < 60_000);
  assert.equal(epoch, 0);
  assert.equal(isDate, true);
  assert.equal(
    shiftedEnv(3, {
      NODE_OPTIONS: '--max-old-space-size=3072 --import=/x/shift-clock.mjs',
    }).NODE_OPTIONS,
    `--max-old-space-size=3072 --import=${fileURLToPath(new URL('./shift-clock.mjs', import.meta.url))}`
  );
});

test('reads failing files and tests from a Vitest JSON report', () => {
  const failing = failuresFromVitestReport({
    testResults: [
      { name: '/r/a.test.ts', status: 'passed', assertionResults: [] },
      {
        name: '/r/b.test.ts',
        status: 'failed',
        assertionResults: [
          { status: 'failed', fullName: 'brief expires' },
          { status: 'passed', fullName: 'ok' },
        ],
      },
      { name: '', status: 'failed' },
    ],
  });
  assert.deepEqual([...failing], [['/r/b.test.ts', ['brief expires']]]);
});

test('confirms only clock-caused failures and dates the first failing day', () => {
  // mcp-handler.test.ts on 2026-10-12: fine for 0-1 days ahead, red from day 2.
  const breaksAt = { bomb: 2, flaky: Infinity, red: 0, late: 7 };
  const calls = [];
  const passes = (file, days) => {
    calls.push([file, days]);
    if (file === 'flaky') return days !== 0 ? true : true;
    return days < breaksAt[file];
  };
  assert.deepEqual(
    confirmTimeBombs(['bomb', 'flaky', 'red', 'late'], { days: 7, passes }),
    [
      { file: 'bomb', breaksInDays: 2 },
      { file: 'late', breaksInDays: 7 },
    ]
  );
  assert.ok(calls.some(([file, days]) => file === 'red' && days === 0));
});

test('plans one fingerprinted issue per file and files or dry-runs it', async () => {
  const now = Date.parse('2026-10-11T08:11:00Z');
  const finding = {
    suite: 'web',
    file: 'apps/web/tests/unit/ovie/mcp-handler.test.ts',
    breaksInDays: 2,
    tests: ['brief'],
  };
  const plan = issuePlan(finding, now);
  assert.equal(
    plan.fingerprint,
    'time-bomb:apps/web/tests/unit/ovie/mcp-handler.test.ts'
  );
  assert.equal(
    plan.title,
    'Time bomb: apps/web/tests/unit/ovie/mcp-handler.test.ts fails from 2026-10-13'
  );
  assert.equal(plan.priority, 1);
  assert.match(plan.description, /- brief/);
  assert.equal(
    issuePlan({ ...finding, breaksInDays: 6, tests: [] }, now).priority,
    2
  );

  const dry = await fileFindings([finding], {
    dryRun: true,
    upsert: () => assert.fail('no write'),
    now,
  });
  assert.equal(dry[0].dryRun, true);
  const writes = [];
  await fileFindings([finding], {
    upsert: async input => (writes.push(input), { ok: true }),
    apiKey: 'k',
    now,
  });
  assert.equal(writes[0].fingerprint, plan.fingerprint);
  assert.equal(writes[0].reopenTerminal, true);
  await assert.rejects(
    fileFindings([finding], {
      upsert: async () => ({ ok: false, reason: 'nope' }),
      now,
    }),
    /nope/
  );
});

test('parses run and file commands', () => {
  assert.deepEqual(
    parseArgs([
      'run',
      '--suite',
      'web',
      '--shard',
      '2/8',
      '--out',
      'f.json',
      '--',
      '--exclude=x',
    ]),
    {
      command: 'run',
      days: 7,
      suite: 'web',
      shard: '2/8',
      out: 'f.json',
      dryRun: false,
      files: [],
      extra: ['--exclude=x'],
    }
  );
  assert.deepEqual(parseArgs(['file', 'a.json', 'b.json', '--dry-run']).files, [
    'a.json',
    'b.json',
  ]);
  assert.throws(() => parseArgs(['nope']), /run or file/);
  assert.throws(() => parseArgs(['run', '--suite', 'ios']), /web or scripts/);
  assert.throws(
    () => parseArgs(['run', '--suite', 'web', '--days', '0']),
    /positive/
  );
  assert.throws(() => parseArgs(['run', '--suite']), /needs a value/);
});

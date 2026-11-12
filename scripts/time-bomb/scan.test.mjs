import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
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
      'console.log(JSON.stringify([Date.now(), new Date().getTime(), Date(), new Date(0).getTime(), new Date() instanceof Date, Date.parse("2026-10-20T00:00:00Z"), Date.UTC(2026, 9, 20), new Date(2026, 9, 20).getFullYear()]))',
    ],
    {
      env: shiftedEnv(7, { ...process.env, NODE_OPTIONS: '' }),
      encoding: 'utf8',
    }
  );
  assert.equal(probe.status, 0, probe.stderr);
  const [now, constructed, called, epoch, isDate, parsed, utc, year] =
    JSON.parse(probe.stdout);
  // The child shift is absolute; remove any scanner-applied parent shift.
  const ahead = now - Date.now() + (globalThis.__jovieClockShift ?? 0);
  assert.ok(ahead > 7 * 86_400_000 - 60_000 && ahead < 7 * 86_400_000 + 60_000);
  assert.ok(Math.abs(constructed - now) < 60_000);
  assert.ok(Math.abs(Date.parse(called) - now) < 60_000);
  assert.equal(epoch, 0);
  assert.equal(isDate, true);
  assert.equal(parsed, 1_792_454_400_000);
  assert.equal(utc, parsed);
  assert.equal(year, 2026);
  assert.equal(
    shiftedEnv(3, {
      NODE_OPTIONS: '--max-old-space-size=3072 --import=/x/shift-clock.mjs',
    }).NODE_OPTIONS,
    `--max-old-space-size=3072 --import=${fileURLToPath(new URL('./shift-clock.mjs', import.meta.url))}`
  );
  // Deliberate calendar deadlines read the real clock only inside the scan.
  assert.equal(shiftedEnv(0, {}).CALENDAR_DEADLINE_SCAN, '1');
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
  assert.throws(
    () => parseArgs(['run', '--suite', 'ios']),
    /web, scripts or research/
  );
  assert.throws(
    () => parseArgs(['run', '--suite', 'web', '--days', '0']),
    /positive/
  );
  assert.throws(() => parseArgs(['run', '--suite']), /needs a value/);
});

test('research is a named suite in the CLI and scheduled discovery matrix', () => {
  assert.equal(parseArgs(['run', '--suite', 'research']).suite, 'research');
  const workflow =
    /** @type {{ jobs: { 'time-bombs': { strategy: { matrix: { include: Array<{ suite: string, shard: string }> } }, steps: Array<{ name?: string, run?: string }> } } }} */ (
      load(
        readFileSync(
          new URL(
            '../../.github/workflows/remediation-sweep.yml',
            import.meta.url
          ),
          'utf8'
        )
      )
    );
  const job = workflow.jobs['time-bombs'];
  assert.deepEqual(
    job.strategy.matrix.include.filter(row => row.suite === 'research'),
    [{ suite: 'research', shard: 'all' }]
  );
  const command = job.steps.find(
    step => step.name === 'Run with the clock a week ahead'
  ).run;
  assert.match(command, /run --suite "\$SUITE" --out/);
});

test('research confirms each file from full-suite reports with maintained outcome coverage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'time-bomb-test-'));
  const trace = join(dir, 'trace.jsonl');
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const file = join(root, 'packages/research/router.test.ts');
  // A fake child exercises CLI dispatch, report discovery, repeat confirmation
  // and bisection without running unrelated scripts or contacting providers.
  writeFileSync(
    join(dir, 'pnpm'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const days = Number(process.env.TIME_SHIFT_DAYS);
fs.appendFileSync(process.env.TB_TRACE, JSON.stringify({ cwd: process.cwd(), args, days, options: process.env.NODE_OPTIONS }) + '\\n');
const report = args.find(arg => arg.startsWith('--outputFile='));
const failed = process.env.TB_REPORT !== 'clean' && days >= 3;
if (report && process.env.TB_REPORT !== 'missing' && !(process.env.TB_REPORT === 'missing-confirm' && days === 0)) fs.writeFileSync(report.slice(13), JSON.stringify({
  numTotalTests: process.env.TB_REPORT === 'empty' ? 0 : 2,
  testResults: process.env.TB_REPORT === 'empty' ? [] : [{
    name: process.env.TB_REPORT === 'missing-target' && days === 0 ? process.env.TB_FILE + '.missing' : process.env.TB_FILE, status: process.env.TB_REPORT === 'runner-error' ? 'passed' : failed ? 'failed' : 'passed',
    assertionResults: [{ status: process.env.TB_REPORT === 'runner-error' ? 'passed' : failed ? 'failed' : 'passed', fullName: 'persisted cache remains warm' }]
  }, ...(process.env.TB_REPORT === 'other-failure' ? [{name: process.env.TB_FILE.replace('router.test.ts', 'other.test.ts'), status: 'failed', assertionResults: [{status: 'failed', fullName: 'already red'}]}] : [])]
}));
process.exit(['runner-error', 'other-failure'].includes(process.env.TB_REPORT) || failed ? 1 : 0);
`,
    { mode: 0o700 }
  );
  const run = (mode = '', suite = 'research') =>
    spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./scan.mjs', import.meta.url)),
        'run',
        '--suite',
        suite,
        '--shard',
        '1/2',
        '--',
        '--exclude=unrelated.test.ts',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          TB_TRACE: trace,
          TB_FILE:
            suite === 'web' ? join(root, 'apps/web/clock.test.ts') : file,
          TB_REPORT: mode,
        },
      }
    );
  try {
    const child = run();
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout).findings, [
      {
        file: 'packages/research/router.test.ts',
        breaksInDays: 3,
        suite: 'research',
        tests: ['persisted cache remains warm'],
      },
    ]);
    const calls = readFileSync(trace, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assert.deepEqual(
      calls.map(call => call.days),
      [7, 0, 7, 3, 1, 2]
    );
    for (const call of calls) {
      assert.equal(call.cwd, resolve(root, 'packages/research'));
      assert.deepEqual(call.args.slice(0, 5), [
        'exec',
        'vitest',
        'run',
        '--config=vitest.config.mts',
        '--pool=forks',
      ]);
      assert.ok(call.args.includes('--maxWorkers=1'));
      assert.ok(
        call.args.some(arg => arg.startsWith('--coverage.reportsDirectory='))
      );
      assert.match(call.options, /--import=.*shift-clock.mjs/);
    }
    assert.ok(calls[0].args.includes('--shard=1/2'));
    assert.ok(calls[0].args.includes('--exclude=unrelated.test.ts'));
    for (const call of calls.slice(1)) {
      assert.ok(
        !call.args.includes(file),
        'confirmation retains full package discovery'
      );
      assert.ok(call.args.includes('--reporter=json'));
      assert.ok(!call.args.includes('cli-outcome.test.ts'));
      assert.ok(!call.args.includes('--passWithNoTests'));
      assert.ok(!call.args.some(arg => arg.startsWith('--shard=')));
    }
    const clean = run('clean');
    assert.equal(clean.status, 0, clean.stderr);
    assert.deepEqual(JSON.parse(clean.stdout), { findings: [] });
    const other = run('other-failure');
    assert.equal(other.status, 0, other.stderr);
    assert.deepEqual(JSON.parse(other.stdout), JSON.parse(child.stdout));
    const webStart = readFileSync(trace, 'utf8').trim().split('\n').length;
    const web = run('', 'web');
    assert.equal(web.status, 0, web.stderr);
    assert.equal(JSON.parse(web.stdout).findings[0].suite, 'web');
    const webCalls = readFileSync(trace, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
      .slice(webStart);
    for (const call of webCalls) {
      assert.equal(call.cwd, resolve(root, 'apps/web'));
      assert.ok(!call.args.includes('--maxWorkers=1'));
      assert.ok(!call.args.includes('cli-outcome.test.ts'));
    }
    assert.ok(webCalls[1].args.includes('--passWithNoTests'));
    assert.notEqual(run('empty').status, 0, 'empty discovery must not pass');
    assert.notEqual(run('missing').status, 0, 'missing reports must not pass');
    assert.match(run('missing-confirm').stderr, /wrote no JSON report/);
    assert.match(run('missing-target').stderr, /confirmation did not select/);
    assert.notEqual(
      run('runner-error').status,
      0,
      'runner or coverage failure must not pass'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

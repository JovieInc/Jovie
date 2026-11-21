import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main as winsMain } from '../../wins-ledger.mjs';
import { winStatus } from '../wins-ledger.mjs';
import {
  applySummerVerifyReceipts,
  findWinByPr,
  measureDueWins,
  parsePrUrl,
  parseSummerRuns,
  summerEvidence,
} from '../wins-measure/index.mjs';

const merged = '2026-10-20T00:00:00Z';
const dueNow = Date.parse(merged) + 25 * 3_600_000;

const pendingWin = (over = {}) => ({
  schema: 'jovie.win/v1',
  id: 'win-2026-10-20-summer-loop-fix',
  date: '2026-10-20',
  area: 'ops',
  theme: 'summer-reliability',
  claim: 'Summer loop fix',
  pendingAfter: true,
  prs: [{ repo: 'JovieInc/Jovie', number: 26001, mergedAt: merged }],
  metrics: [
    {
      name: 'critical-blocking',
      unit: 'count',
      better: 'lower',
      before: 3,
      after: 0,
      source: 'summer.jov.ie/runtime/v1/health#criticalPath.blocking.length',
      query:
        'curl -s https://summer.jov.ie/runtime/v1/health | jq .criticalPath.blocking | length',
    },
  ],
  verifyLink: 'https://summer.jov.ie/runtime/v1/health',
  receipts: [],
  ...over,
});

test('parsePrUrl and findWinByPr match Summer pr_url', () => {
  assert.deepEqual(parsePrUrl('https://github.com/JovieInc/Jovie/pull/26001'), {
    repo: 'JovieInc/Jovie',
    number: 26001,
  });
  const win = pendingWin();
  assert.equal(
    findWinByPr([win], { repo: 'JovieInc/Jovie', number: 26001 }),
    win
  );
  assert.equal(findWinByPr([win], { repo: 'JovieInc/Jovie', number: 1 }), null);
});

test('parseSummerRuns skips blank and corrupt lines', () => {
  const runs = parseSummerRuns(
    '\n{"run_at":"a","previous_fix_effect":"fixed","after":1}\nnot-json\n{"run_at":"b"}\n'
  );
  assert.equal(runs.length, 2);
  assert.equal(runs[0].run_at, 'a');
});

test('summer verify fixed with after becomes a ledger receipt', () => {
  const win = pendingWin();
  assert.equal(winStatus(win), 'pending-measure');
  const report = applySummerVerifyReceipts(
    [win],
    [
      {
        run_at: '2026-10-21T06:17:00Z',
        previous_fix_effect: 'fixed',
        pr_url: 'https://github.com/JovieInc/Jovie/pull/26001',
        metric: 'critical-blocking',
        after: 0,
        verify_with: 'curl health | jq blocking length',
      },
    ],
    { at: '2026-10-21T06:17:00Z' }
  );
  assert.equal(report.measured.length, 1);
  assert.equal(report.adapter, 'summer-loop');
  assert.equal(win.receipts.length, 1);
  assert.equal(win.receipts[0].value, 0);
  assert.equal(
    win.receipts[0].evidence,
    summerEvidence({
      run_at: '2026-10-21T06:17:00Z',
      previous_fix_effect: 'fixed',
      verify_with: 'curl health | jq blocking length',
    })
  );
  assert.equal(winStatus(win), 'verified');
});

test('summer verify skips not-yet-deployed and missing after', () => {
  const win = pendingWin();
  const report = applySummerVerifyReceipts(
    [win],
    [
      {
        run_at: 't1',
        previous_fix_effect: 'not-yet-deployed',
        pr_url: 'https://github.com/JovieInc/Jovie/pull/26001',
        after: 0,
      },
      {
        run_at: 't2',
        previous_fix_effect: 'fixed',
        pr_url: 'https://github.com/JovieInc/Jovie/pull/26001',
        after: null,
      },
    ]
  );
  assert.equal(report.measured.length, 0);
  assert.equal(report.skipped.length, 2);
  assert.equal(win.receipts.length, 0);
});

test('summer verify is idempotent on evidence', () => {
  const win = pendingWin();
  const runs = [
    {
      run_at: '2026-10-21T06:17:00Z',
      previous_fix_effect: 'fixed',
      pr_number: 26001,
      repo: 'JovieInc/Jovie',
      after: 0,
      metric: 'critical-blocking',
    },
  ];
  applySummerVerifyReceipts([win], runs);
  const again = applySummerVerifyReceipts([win], runs);
  assert.equal(win.receipts.length, 1);
  assert.equal(again.measured.length, 0);
  assert.match(again.skipped[0].reason, /already present/);
});

test('summer-verify CLI dry-run does not require store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'summer-verify-cli-'));
  const runsPath = join(dir, 'runs.jsonl');
  writeFileSync(
    runsPath,
    `${JSON.stringify({
      run_at: '2026-10-21T06:17:00Z',
      previous_fix_effect: 'fixed',
      pr_url: 'https://github.com/JovieInc/Jovie/pull/999999',
      after: 1,
      metric: 'x',
    })}\n`
  );
  const lines = [];
  const code = await winsMain(
    ['summer-verify', '--runs', runsPath, '--json'],
    /** @type {any} */ ({
      log: s => lines.push(String(s)),
      error: s => lines.push(String(s)),
    })
  );
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 0);
  assert.match(lines.join('\n'), /dry-run/);
  assert.match(lines.join('\n'), /no wins-ledger|summer-loop/);
});

test('unqueryable Summer win still receipts via summer-loop hop', async () => {
  const win = pendingWin({
    metrics: [
      {
        name: 'ejection',
        unit: 'rate',
        better: 'lower',
        before: 0.9,
        after: 0.4,
        source: 'summer.jov.ie health probe',
        query: 'curl health',
      },
    ],
  });
  const due = await measureDueWins([win], { nowMs: dueNow, dryRun: true });
  assert.equal(due.measured.length, 0);
  const summer = applySummerVerifyReceipts(
    [win],
    parseSummerRuns(
      `${JSON.stringify({
        run_at: '2026-10-21T06:17:00Z',
        previous_fix_effect: 'fixed',
        pr_url: 'https://github.com/JovieInc/Jovie/pull/26001',
        metric: 'ejection',
        after: 0.35,
        verify_with: 'curl health',
      })}\n`
    ),
    { dryRun: false, at: '2026-10-21T06:17:00Z' }
  );
  assert.equal(summer.measured.length, 1);
  assert.equal(win.receipts[0].value, 0.35);
  assert.equal(winStatus(win), 'verified');
});

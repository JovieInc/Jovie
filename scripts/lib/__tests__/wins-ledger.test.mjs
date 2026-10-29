import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clusters,
  holds,
  parseWinSection,
  readLedger,
  validateLedger,
  validateWin,
  weeklyMetrics,
  winFromPr,
  winSectionErrors,
  winStatus,
} from '../wins-ledger.mjs';

const base = () => ({
  schema: 'jovie.win/v1',
  id: 'win-2026-10-29-x',
  date: '2026-10-29',
  area: 'queue',
  theme: 't',
  claim: 'Faster gate',
  prs: [{ repo: 'a/b', number: 1, mergedAt: '2026-10-29T00:00:00Z' }],
  metrics: [
    {
      name: 'wait',
      unit: 's',
      better: 'lower',
      before: 100,
      after: 10,
      source: 'gh',
      query: 'q',
    },
  ],
  verifyLink: 'https://example.com',
  receipts: [],
});

test('the committed ledger is valid and ids are unique', () => {
  assert.deepEqual(validateLedger(readLedger()), []);
});

test('status: claimed until a post-merge receipt keeps the gain', () => {
  const w = base();
  assert.equal(winStatus(w), 'claimed');
  w.receipts = [
    { metric: 'wait', value: 12, at: '2026-10-30T00:00:00Z', evidence: 'e' },
  ];
  assert.equal(winStatus(w), 'verified');
  w.receipts[0].value = 90;
  assert.equal(winStatus(w), 'not-reproduced');
  w.receipts[0].at = '2026-10-28T00:00:00Z'; // before merge: ignored
  assert.equal(winStatus(w), 'claimed');
});

test('status: open PR is pending-merge, no numbers is unverified', () => {
  const w = base();
  w.prs[0].mergedAt = null;
  assert.equal(winStatus(w), 'pending-merge');
  const n = base();
  n.metrics = [];
  assert.equal(winStatus(n), 'unverified');
});

test('holds: unclaimed after needs 20% gain', () => {
  const m = { before: 141, after: null, better: 'lower' };
  assert.equal(holds(m, 116.5), false);
  assert.equal(holds(m, 100), true);
});

test('validation rejects missing source, bad area and empty prs', () => {
  const w = base();
  w.area = 'nope';
  w.prs = [];
  w.metrics[0].source = '';
  const p = validateWin(w);
  assert.ok(p.some(x => x.startsWith('area')));
  assert.ok(p.some(x => x.startsWith('prs')));
  assert.ok(p.some(x => x.includes('source')));
});

const body = `## Win
- Claim: Gate jobs start 10x sooner
- Area: queue
- Theme: merge-throughput
- Metric: gate wait p50 | s | lower | 141 | 3 | gh jobs api | gh api actions/runs/ID/jobs
- Verify: https://github.com/JovieInc/Jovie/pull/1

## Other`;

test('PR Win section parses into a ledger record', () => {
  const win = winFromPr(
    { repo: 'JovieInc/Jovie', number: 9, mergedAt: '2026-10-29T10:00:00Z' },
    parseWinSection(body)
  );
  assert.equal(win.id, 'win-2026-10-29-gate-jobs-start-10x-sooner');
  assert.equal(win.metrics[0].before, 141);
  assert.deepEqual(validateWin(win), []);
  assert.deepEqual(winSectionErrors(body), []);
});

test('n/a declines; malformed section errors; absent is silent', () => {
  assert.equal(parseWinSection('## Win\nn/a\n').declined, true);
  assert.deepEqual(winSectionErrors('## Summary\nx'), []);
  assert.ok(winSectionErrors('## Win\n- Claim: only a claim\n').length > 0);
});

test('clusters trigger at ten verified wins only', () => {
  const wins = Array.from({ length: 10 }, (_, i) => {
    const w = base();
    w.id = `win-2026-10-29-w${i}`;
    w.receipts = [
      { metric: 'wait', value: 12, at: '2026-10-30T00:00:00Z', evidence: 'e' },
    ];
    return w;
  });
  assert.equal(clusters(wins)[0].ready, true);
  assert.equal(clusters(wins.slice(1))[0].ready, false);
  assert.equal(weeklyMetrics(wins).winsVerified, 10);
});

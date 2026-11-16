import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  validateStageEvent,
  validateStageManifest,
} from '../lib/stage-events.mjs';
import {
  appendRow,
  buildRow,
  LEDGER_PATH,
  main,
  readRows,
  SLO_SECONDS,
  STAGES,
  summarize,
} from './design-loop-ledger.mjs';
import { REPO_ROOT } from './pen-bindings-lib.mjs';

const manifest = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/metrics/stage-manifest.json'), 'utf8')
);

test('the stage manifest registers design-loop with the eight stages and a 30 minute SLO', () => {
  assert.deepEqual(validateStageManifest(manifest).errors, []);
  const entity = manifest.entities['design-loop'];
  assert.deepEqual(
    entity.stages.map(s => s.id),
    STAGES
  );
  assert.equal(entity.sloSeconds, SLO_SECONDS);
  assert.equal(SLO_SECONDS, 1800);
  assert.ok(manifest.sources[entity.stages[0].source]);
});

test('rows satisfy the jovie-stage-event/v1 contract and carry loopId', () => {
  for (const stage of STAGES) {
    const row = buildRow({
      loopId: 'home-20261107',
      stage,
      enteredAt: '2026-11-07T10:00:00Z',
      exitedAt: '2026-11-07T10:05:00Z',
      actor: 'w1',
      sourceReceipt: 'r',
    });
    assert.deepEqual(validateStageEvent(row, manifest), []);
    assert.equal(row.loopId, row.entityId);
  }
  const open = buildRow({
    loopId: 'x',
    stage: 'brief',
    enteredAt: '2026-11-07T10:00:00Z',
  });
  assert.equal(open.exitedAt, null);
  assert.equal(open.outcome, 'open');
});

test('rows are rejected when malformed', () => {
  const ok = { loopId: 'x', stage: 'brief', enteredAt: '2026-11-07T10:00:00Z' };
  assert.throws(() => buildRow({ ...ok, loopId: '' }), /loopId/);
  assert.throws(() => buildRow({ ...ok, stage: 'ship' }), /stage must be/);
  assert.throws(() => buildRow({ ...ok, enteredAt: 'soon' }), /enteredAt/);
  assert.throws(
    () => buildRow({ ...ok, exitedAt: '2026-11-07T09:00:00Z' }),
    /before/
  );
  assert.throws(() => buildRow({ ...ok, exitedAt: 'later' }), /exitedAt/);
  assert.throws(
    () =>
      buildRow({ ...ok, exitedAt: '2026-11-07T11:00:00Z', outcome: 'bogus' }),
    /outcome/
  );
  assert.throws(() => buildRow({ ...ok, outcome: 'completed' }), /open stage/);
});

test('append writes NDJSON and summary reports dwell and the SLO verdict', () => {
  const root = mkdtempSync(join(tmpdir(), 'ledger-'));
  appendRow(
    {
      loopId: 'a',
      stage: 'brief',
      enteredAt: '2026-11-07T10:00:00Z',
      exitedAt: '2026-11-07T10:04:00Z',
    },
    { root }
  );
  appendRow(
    {
      loopId: 'a',
      stage: 'preview',
      enteredAt: '2026-11-07T10:04:00Z',
      exitedAt: '2026-11-07T10:20:00Z',
    },
    { root }
  );
  appendRow(
    {
      loopId: 'b',
      stage: 'brief',
      enteredAt: '2026-11-07T10:00:00Z',
      exitedAt: '2026-11-07T10:50:00Z',
    },
    { root }
  );
  appendRow(
    { loopId: 'c', stage: 'brief', enteredAt: '2026-11-07T10:00:00Z' },
    { root }
  );
  const raw = readFileSync(join(root, LEDGER_PATH), 'utf8');
  assert.equal(raw.trim().split('\n').length, 4);
  const sums = summarize(readRows({ root }));
  const byId = Object.fromEntries(sums.map(s => [s.loopId, s]));
  assert.deepEqual(byId.a.stages, { brief: 240, preview: 960 });
  assert.equal(byId.a.totalSeconds, 1200);
  assert.equal(byId.a.withinSlo, true);
  assert.equal(byId.b.withinSlo, false);
  assert.equal(byId.c.withinSlo, null);
  assert.equal(summarize(readRows({ root }), 'a').length, 1);
});

test('CLI append and summary', () => {
  const root = mkdtempSync(join(tmpdir(), 'ledger-'));
  const out = [];
  const err = [];
  const io = { root, out: m => out.push(m), err: m => err.push(m) };
  assert.equal(
    main(
      [
        'append',
        '--loop',
        'z',
        '--stage',
        'diff',
        '--entered',
        '2026-11-07T10:00:00Z',
        '--exited',
        '2026-11-07T10:01:00Z',
      ],
      io
    ),
    0
  );
  assert.equal(JSON.parse(out[0]).stage, 'diff');
  assert.equal(
    main(
      [
        'append',
        '--loop',
        'z',
        '--stage',
        'nope',
        '--entered',
        '2026-11-07T10:00:00Z',
      ],
      io
    ),
    1
  );
  assert.match(err[0], /stage must be/);
  assert.equal(main(['summary'], io), 0);
  assert.equal(JSON.parse(out[1])[0].stages.diff, 60);
  assert.equal(main(['wat'], io), 2);
});

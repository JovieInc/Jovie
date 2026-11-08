import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tick } from './index.ts';
import { afterRun, dueTasks, EMPTY_STATE, overdue } from './schedule.ts';

const task = (o = {}) => ({
  id: 't',
  everyMin: 5,
  url: 'https://x/__cron',
  secret: 'S',
  enabled: true,
  ...o,
});
const kv = () => {
  const m = new Map();
  return {
    m,
    get: async k => m.get(k) ?? null,
    put: async (k, v) => void m.set(k, v),
  };
};
const MIN = 60_000;

test('due: first run, interval with jitter slack, disabled never', () => {
  assert.equal(dueTasks([task()], {}, 0).length, 1);
  assert.equal(
    dueTasks(
      [task()],
      { t: { ...EMPTY_STATE, lastRunAt: 0 } },
      5 * MIN - 10_000
    ).length,
    1,
    'jitter'
  );
  assert.equal(
    dueTasks([task()], { t: { ...EMPTY_STATE, lastRunAt: 0 } }, 4 * MIN).length,
    0
  );
  assert.equal(dueTasks([task({ enabled: false })], {}, 0).length, 0);
});

test('catch-up: a skipped platform tick still runs an hourly task on the next tick', () => {
  const hourly = task({ everyMin: 60 });
  const state = { t: { ...EMPTY_STATE, lastRunAt: 0 } };
  assert.equal(dueTasks([hourly], state, 61 * MIN).length, 1);
});

test('tick dispatches only due tasks, records state, and failure is visible', async () => {
  const env = { STATE: kv(), S: 'secret' };
  const calls = [];
  const ok = async (url, init) => (
    calls.push([url, init.headers.authorization]), { ok: true }
  );
  assert.deepEqual(await tick(env, 0, ok, [task()]), {
    dispatched: 1,
    failed: [],
  });
  assert.deepEqual(calls[0], ['https://x/__cron', 'Bearer secret']);
  assert.equal(
    (await tick(env, MIN, ok, [task()])).dispatched,
    0,
    'not due again yet'
  );
  const bad = async () => ({ ok: false });
  const out = await tick(env, 6 * MIN, bad, [task()]);
  assert.deepEqual(out.failed, ['t']);
  assert.equal(JSON.parse(env.STATE.m.get('task:t')).failures, 1);
});

test('negative control: a dead member is reported overdue within 3 intervals, a missing secret fails closed', async () => {
  const t = task();
  let s = afterRun(EMPTY_STATE, true, 0);
  assert.deepEqual(overdue([t], { t: s }, 10 * MIN), []);
  for (let now = 5 * MIN; now <= 20 * MIN; now += 5 * MIN)
    s = afterRun(s, false, now);
  assert.deepEqual(
    overdue([t], { t: s }, 17 * MIN),
    ['t'],
    'no success for 3 intervals + 1 min'
  );
  assert.deepEqual(
    overdue([t], {}, 0),
    ['t'],
    'never succeeded is overdue, not healthy'
  );
  const env = { STATE: kv() };
  const out = await tick(env, 0, async () => ({ ok: true }), [t]);
  assert.deepEqual(
    out.failed,
    ['t'],
    'no secret bound: failed, never a silent pass'
  );
});

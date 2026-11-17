import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  budgetRecap,
  CAPTURE_BUDGET_MS,
  guardScreenStart,
  MIN_SCREEN_MS,
  SCREEN_DEADLINE_MS,
  settleDeadline,
  withDeadline,
} from './capture-budget.mjs';

test('settleDeadline keeps screenshot latency out of the settle budget', () => {
  const startedAt = 1_000;
  const settleMs = 5_000;
  assert.equal(settleDeadline({ settleMs, startedAt }), startedAt + 90_000);
  assert.equal(
    settleDeadline({ settleMs, startedAt, shotMs: 120_000 }),
    startedAt + 90_000 + 120_000
  );
});

test('guardScreenStart returns a screen deadline clamped to the capture budget', () => {
  const startedAt = Date.now();
  const deadline = guardScreenStart({
    startedAt,
    budgetMs: CAPTURE_BUDGET_MS,
    bootMs: 5_000,
    installMs: 1_000,
    captured: 2,
    total: 5,
  });
  assert.ok(deadline > Date.now());
  assert.ok(deadline <= startedAt + CAPTURE_BUDGET_MS);
  // A screen's own cap binds first while the budget is fresh.
  assert.ok(deadline <= Date.now() + SCREEN_DEADLINE_MS + 50);
});

test('guardScreenStart fails fast with a staged recap once the budget is gone', () => {
  const startedAt = Date.now() - CAPTURE_BUDGET_MS; // budget fully spent
  assert.throws(
    () =>
      guardScreenStart({
        startedAt,
        budgetMs: CAPTURE_BUDGET_MS,
        bootMs: 600_000,
        installMs: 60_000,
        captured: 3,
        total: 5,
      }),
    error => {
      assert.match(error.message, /capture budget exhausted/);
      assert.match(error.message, /boot 600s, install 60s/);
      assert.match(error.message, /3\/5 screens captured/);
      assert.match(error.message, /raise the step timeout/);
      return true;
    }
  );
});

test('budgetRecap names the stages and the capture progress', () => {
  const startedAt = Date.now() - 30_000;
  const recap = budgetRecap({
    bootMs: 300_000,
    installMs: 45_000,
    captured: 1,
    total: 5,
    startedAt,
  });
  assert.match(recap, /boot 300s, install 45s/);
  assert.match(recap, /1\/5 screens captured/);
  assert.match(recap, /30s elapsed/);
});

test('withDeadline passes the underlying result and rejection through', async () => {
  await assert.equal(
    await withDeadline(Promise.resolve('frame'), 5_000, 'chat capture'),
    'frame'
  );
  await assert.rejects(
    withDeadline(
      Promise.reject(new Error('chat: screen never settled')),
      5_000,
      'chat'
    ),
    /chat: screen never settled/
  );
});

test('withDeadline rejects with a named error when the work outlives the deadline', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    withDeadline(
      new Promise(done => setTimeout(() => done('late'), 250)),
      50,
      'work capture'
    ),
    error => {
      assert.match(error.message, /work capture: exceeded its 0s deadline/);
      return true;
    }
  );
  assert.ok(Date.now() - startedAt < 200);
});

test('the budget defaults leave headroom under the 15-minute CI step', () => {
  assert.ok(CAPTURE_BUDGET_MS < 15 * 60_000);
  assert.ok(MIN_SCREEN_MS < CAPTURE_BUDGET_MS);
});

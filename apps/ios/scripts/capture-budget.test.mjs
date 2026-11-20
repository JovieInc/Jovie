import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BOOT_STATUS_TIMEOUT_MS,
  budgetRecap,
  CAPTURE_BUDGET_MS,
  durationUntil,
  guardScreenStart,
  LAUNCH_TIMEOUT_MS,
  MIN_SCREEN_MS,
  runBounded,
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

test('guardScreenStart clamps a fresh screen to its own deadline', () => {
  const now = 1_700_000_000_000;
  const deadline = guardScreenStart({
    startedAt: now,
    budgetMs: CAPTURE_BUDGET_MS,
    bootMs: 5_000,
    installMs: 1_000,
    captured: 2,
    total: 5,
    now,
  });
  assert.equal(deadline, now + SCREEN_DEADLINE_MS);
  assert.ok(deadline <= now + CAPTURE_BUDGET_MS);
});

test('guardScreenStart fails fast with a staged recap once the budget is gone', () => {
  const now = 5_000_000;
  assert.throws(
    () =>
      guardScreenStart({
        startedAt: now - CAPTURE_BUDGET_MS,
        budgetMs: CAPTURE_BUDGET_MS,
        bootMs: 600_000,
        installMs: 60_000,
        captured: 3,
        total: 5,
        now,
      }),
    error => {
      assert.equal(error.budgetExhausted, true);
      assert.match(error.message, /capture budget exhausted/);
      assert.match(error.message, /boot 600s, install 60s/);
      assert.match(error.message, /3\/5 screens captured/);
      assert.match(error.message, /raise the step timeout/);
      return true;
    }
  );
});

test('budgetRecap names the stages and the capture progress', () => {
  const startedAt = 5_000_000;
  const recap = budgetRecap({
    bootMs: 300_000,
    installMs: 45_000,
    captured: 1,
    total: 5,
    startedAt,
    now: startedAt + 30_000,
  });
  assert.match(recap, /boot 300s, install 45s/);
  assert.match(recap, /1\/5 screens captured/);
  assert.match(recap, /30s elapsed/);
});

test('durationUntil grants a relative screen window from an epoch deadline', () => {
  // Regression for run 44533014226: an absolute epoch (1.79e12) overflowed
  // setTimeout and Node clamped it to 1ms. Callers must pass this duration.
  const now = 1_795_000_000_000;
  const grantedMs = durationUntil(now + SCREEN_DEADLINE_MS, now);
  assert.equal(grantedMs, SCREEN_DEADLINE_MS);
  assert.ok(grantedMs < 2 ** 31 - 1);
  assert.equal(durationUntil(now, now + 5), 0);
});

test('withDeadline passes the underlying result and rejection through', async () => {
  await assert.equal(
    await withDeadline(Promise.resolve('frame'), 10_000, 'chat capture'),
    'frame'
  );
  await assert.rejects(
    withDeadline(
      Promise.reject(new Error('chat: screen never settled')),
      10_000,
      'chat'
    ),
    /chat: screen never settled/
  );
});

test('withDeadline rejects with a named error when the work never settles', async () => {
  await assert.rejects(
    withDeadline(new Promise(() => {}), 1, 'work capture'),
    /work capture: exceeded its 0s deadline/
  );
});

test('withDeadline rejects an absolute timestamp instead of clamping it', async () => {
  await assert.rejects(
    withDeadline(Promise.resolve('frame'), 1_795_000_000_000, 'chat capture'),
    /duration under 2\^31 ms/
  );
});

test('the budget defaults leave headroom under the fixed CI steps', () => {
  assert.ok(CAPTURE_BUDGET_MS < 15 * 60_000);
  assert.ok(MIN_SCREEN_MS < CAPTURE_BUDGET_MS);
  assert.ok(BOOT_STATUS_TIMEOUT_MS > 15 * 60_000);
  assert.ok(BOOT_STATUS_TIMEOUT_MS < 20 * 60_000);
});

test('the launch timeout bounds one cold simctl launch', () => {
  // A cold first launch on a hosted runner measured 158s (run 44533014226).
  // The cap must exceed that and stay inside the capture budget.
  assert.ok(LAUNCH_TIMEOUT_MS >= 200_000);
  assert.ok(LAUNCH_TIMEOUT_MS < CAPTURE_BUDGET_MS / 2);
});

test('runBounded returns stdout when the command exits', async () => {
  const out = await runBounded(
    process.execPath,
    ['-e', 'process.stdout.write("ok")'],
    { timeout: 5_000 }
  );
  assert.equal(out, 'ok');
});

test('runBounded kills a process group that ignores SIGTERM', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'capture-budget-'));
  const pidfile = join(dir, 'pid');
  const script = [
    "const {spawn} = require('node:child_process');",
    "const {writeFileSync} = require('node:fs');",
    'const child = spawn(process.execPath, ["-e", "process.on(\\"SIGTERM\\",()=>{}); setInterval(()=>{},1e9);"], {stdio:"ignore"});',
    'writeFileSync(process.env.PIDFILE, String(child.pid));',
    'process.on("SIGTERM", () => {});',
    'setInterval(() => {}, 1e9);',
  ].join('\n');
  let grandchild = 0;
  try {
    await assert.rejects(
      runBounded(process.execPath, ['-e', script], {
        timeout: 200,
        killGraceMs: 100,
        env: { ...process.env, PIDFILE: pidfile },
      }),
      /timed out after \d+s and was killed/
    );
    grandchild = Number(readFileSync(pidfile, 'utf8'));
    assert.ok(grandchild > 0);
    assert.throws(() => process.kill(grandchild, 0));
  } finally {
    if (grandchild > 0) {
      try {
        process.kill(grandchild, 'SIGKILL');
      } catch {
        // The process group kill already reaped it.
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

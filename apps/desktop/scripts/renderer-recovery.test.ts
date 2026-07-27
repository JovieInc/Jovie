import { expect, test } from 'vitest';
import {
  decideRendererRecovery,
  RENDERER_BOOT_WATCHDOG_MS,
  shouldArmRendererBootWatchdog,
} from '../src/renderer-recovery.ts';

const MAX = 2;

test('clean-exit is normal teardown, never recovered', () => {
  expect(
    decideRendererRecovery({
      reason: 'clean-exit',
      reloadCount: 0,
      maxReloads: MAX,
    })
  ).toBe('ignore');
});

test('a crash reloads while within the budget', () => {
  for (const reason of [
    'crashed',
    'oom',
    'killed',
    'abnormal-exit',
    'launch-failed',
  ]) {
    expect(
      decideRendererRecovery({ reason, reloadCount: 0, maxReloads: MAX })
    ).toBe('reload');
    expect(
      decideRendererRecovery({ reason, reloadCount: MAX - 1, maxReloads: MAX })
    ).toBe('reload');
  }
});

test('a crash loop falls back to the failure page instead of black', () => {
  expect(
    decideRendererRecovery({
      reason: 'crashed',
      reloadCount: MAX,
      maxReloads: MAX,
    })
  ).toBe('failure-page');
  expect(
    decideRendererRecovery({
      reason: 'oom',
      reloadCount: MAX + 5,
      maxReloads: MAX,
    })
  ).toBe('failure-page');
});

test('boot watchdog arms only for real hosted app-origin navigations', () => {
  expect(RENDERER_BOOT_WATCHDOG_MS).toBeGreaterThanOrEqual(12_000);
  expect(RENDERER_BOOT_WATCHDOG_MS).toBeLessThanOrEqual(15_000);

  const appOrigin = 'https://jov.ie';
  expect(
    shouldArmRendererBootWatchdog(
      'https://jov.ie/app/chat?runtime=electron',
      appOrigin
    )
  ).toBe(true);
  expect(
    shouldArmRendererBootWatchdog(
      'http://localhost:3112/app',
      'http://localhost:3112'
    )
  ).toBe(true);

  // Only the app origin ever sends app-booted — any other http(s) origin must
  // not arm the watchdog or it is a guaranteed false-positive.
  expect(
    shouldArmRendererBootWatchdog('https://docs.jov.ie/guide', appOrigin)
  ).toBe(false);
  expect(shouldArmRendererBootWatchdog('https://example.com', appOrigin)).toBe(
    false
  );

  expect(shouldArmRendererBootWatchdog('', appOrigin)).toBe(false);
  expect(shouldArmRendererBootWatchdog('about:blank', appOrigin)).toBe(false);
  expect(
    shouldArmRendererBootWatchdog('data:text/html,failure', appOrigin)
  ).toBe(false);
  expect(
    shouldArmRendererBootWatchdog('devtools://devtools/bundled', appOrigin)
  ).toBe(false);
  expect(shouldArmRendererBootWatchdog('file:///tmp/x.html', appOrigin)).toBe(
    false
  );
  expect(shouldArmRendererBootWatchdog('not a url', appOrigin)).toBe(false);
});

test('crash-after-load without a booted ping exhausts the reload budget', () => {
  // Regression (JOV desktop QA): main.ts resets rendererCrashReloadCount only
  // in markRendererBooted, never on did-finish-load. A renderer that loads
  // fine and then crashes deterministically (OOM during hydration) must burn
  // through the budget and reach the failure page instead of looping reloads.
  let reloadCount = 0;
  const decisions: string[] = [];
  for (let i = 0; i < 4; i++) {
    const action = decideRendererRecovery({
      reason: 'oom',
      reloadCount,
      maxReloads: MAX,
    });
    decisions.push(action);
    if (action === 'reload') reloadCount += 1;
    // did-finish-load fires between crashes but must NOT reset reloadCount.
  }

  expect(decisions).toEqual([
    'reload',
    'reload',
    'failure-page',
    'failure-page',
  ]);
});

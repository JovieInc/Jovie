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

test('boot watchdog arms only for real hosted http(s) navigations', () => {
  expect(RENDERER_BOOT_WATCHDOG_MS).toBeGreaterThanOrEqual(12_000);
  expect(RENDERER_BOOT_WATCHDOG_MS).toBeLessThanOrEqual(15_000);

  expect(
    shouldArmRendererBootWatchdog('https://jov.ie/app/chat?runtime=electron')
  ).toBe(true);
  expect(shouldArmRendererBootWatchdog('http://localhost:3112/app')).toBe(true);

  expect(shouldArmRendererBootWatchdog('')).toBe(false);
  expect(shouldArmRendererBootWatchdog('about:blank')).toBe(false);
  expect(shouldArmRendererBootWatchdog('data:text/html,failure')).toBe(false);
  expect(shouldArmRendererBootWatchdog('devtools://devtools/bundled')).toBe(
    false
  );
  expect(shouldArmRendererBootWatchdog('file:///tmp/x.html')).toBe(false);
  expect(shouldArmRendererBootWatchdog('not a url')).toBe(false);
});

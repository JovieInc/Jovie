import { afterEach, expect, test, vi } from 'vitest';
import { RECOVERY_UNLATCH_POLL_MS } from '../src/renderer-recovery.ts';
import { createRecoveryUnlatchController } from '../src/renderer-recovery-unlatch.ts';

afterEach(() => {
  vi.useRealTimers();
});

function recoveryUnlatchFixture() {
  const probes: {
    readonly signal: AbortSignal;
    readonly resolve: (url: string | null) => void;
    readonly reject: (reason: Error) => void;
  }[] = [];
  const reloadHosted = vi.fn();
  let destroyed = false;
  let booted = false;
  const controller = createRecoveryUnlatchController({
    findReachableHostedUrl: (_url, signal) =>
      new Promise<string | null>((resolve, reject) => {
        probes.push({ signal, resolve, reject });
      }),
    getHostedUrl: () => 'https://jov.ie/app/chat',
    isWindowDestroyed: () => destroyed,
    isRendererBooted: () => booted,
    reloadHosted,
  });
  return {
    controller,
    probes,
    reloadHosted,
    destroy: () => {
      destroyed = true;
    },
    boot: () => {
      booted = true;
    },
  };
}

test('stopping recovery aborts its probe and rejects a late navigation', async () => {
  vi.useFakeTimers();
  const { controller, probes, reloadHosted } = recoveryUnlatchFixture();
  controller.begin();
  controller.stop();
  probes[0].resolve('https://jov.ie/app/chat');
  await vi.advanceTimersByTimeAsync(0);
  expect(probes[0].signal.aborted).toBe(true);
  expect(reloadHosted).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test('only the newest recovery attempt may navigate after overlapping probes', async () => {
  vi.useFakeTimers();
  const { controller, probes, reloadHosted } = recoveryUnlatchFixture();
  controller.begin();
  controller.begin();
  probes[1].resolve('https://jov.ie/app/chat?new');
  probes[0].resolve('https://jov.ie/app/chat?old');
  await vi.advanceTimersByTimeAsync(0);
  expect(reloadHosted.mock.calls).toEqual([['https://jov.ie/app/chat?new']]);
  expect(probes[0].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test('restarted recovery has one retry chain and stop leaves no orphan timer', async () => {
  vi.useFakeTimers();
  const { controller, probes, reloadHosted } = recoveryUnlatchFixture();
  controller.begin();
  controller.begin();
  probes[1].resolve(null);
  probes[0].resolve(null);
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(RECOVERY_UNLATCH_POLL_MS);
  expect(probes).toHaveLength(3);
  probes[2].resolve(null);
  await vi.advanceTimersByTimeAsync(0);
  controller.stop();
  expect(vi.getTimerCount()).toBe(0);
  expect(reloadHosted).not.toHaveBeenCalled();
});

test('recovery keeps its existing retry cadence and stops after reachable navigation', async () => {
  vi.useFakeTimers();
  const { controller, probes, reloadHosted } = recoveryUnlatchFixture();
  controller.begin();
  probes[0].resolve(null);
  await vi.advanceTimersByTimeAsync(RECOVERY_UNLATCH_POLL_MS - 1);
  expect(probes).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(probes).toHaveLength(2);
  probes[1].resolve('https://jov.ie/app/chat');
  await vi.advanceTimersByTimeAsync(0);
  expect(reloadHosted).toHaveBeenCalledExactlyOnceWith(
    'https://jov.ie/app/chat'
  );
  expect(vi.getTimerCount()).toBe(0);
});

test.each(['boot', 'destroy'] as const)(
  '%s during a recovery probe prevents navigation and retries',
  async outcome => {
    vi.useFakeTimers();
    const fixture = recoveryUnlatchFixture();
    fixture.controller.begin();
    fixture[outcome]();
    fixture.probes[0].resolve('https://jov.ie/app/chat');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.reloadHosted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  }
);

test.each(['boot', 'destroy'] as const)(
  '%s while a retry is scheduled suppresses another probe',
  async outcome => {
    vi.useFakeTimers();
    const fixture = recoveryUnlatchFixture();
    fixture.controller.begin();
    fixture.probes[0].resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    fixture[outcome]();
    await vi.advanceTimersByTimeAsync(RECOVERY_UNLATCH_POLL_MS);
    expect(fixture.probes).toHaveLength(1);
    expect(fixture.reloadHosted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  }
);

test('disposed recovery cannot restart or navigate from an outstanding probe', async () => {
  vi.useFakeTimers();
  const { controller, probes, reloadHosted } = recoveryUnlatchFixture();
  controller.begin();
  controller.dispose();
  controller.begin();
  probes[0].resolve('https://jov.ie/app/chat');
  await vi.advanceTimersByTimeAsync(0);
  expect(probes).toHaveLength(1);
  expect(reloadHosted).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test('a failed reachability probe retries without an unhandled rejection', async () => {
  vi.useFakeTimers();
  const { controller, probes } = recoveryUnlatchFixture();
  controller.begin();
  probes[0].reject(new Error('unreachable'));
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);
  controller.dispose();
});

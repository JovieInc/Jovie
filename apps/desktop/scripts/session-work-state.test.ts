import { describe, expect, it, vi } from 'vitest';
import {
  createSessionWorkReporter,
  isSessionWorkSafe,
  probeAllWindowWorkSafety,
  probeSessionWorkSafety,
  SESSION_WORK_PROBE_TIMEOUT_MS,
  SESSION_WORK_STATE_MAX_AGE_MS,
  singleFlight,
} from '../src/session-work-state';

const idle = {
  hasDraft: false,
  isStreaming: false,
  isUploading: false,
  hasPendingAction: false,
  isAuthenticating: false,
};
const now = 100_000;
const safe = (snapshot: unknown, isAuthenticating = false) =>
  isSessionWorkSafe({ snapshot, now, isAuthenticating });

describe('session work safety', () => {
  it('requires a fresh complete idle snapshot, including main-owned auth', () => {
    const snapshot = { state: idle, reportedAt: now };
    expect(safe(snapshot)).toBe(true);
    expect(safe(snapshot, true)).toBe(false);
    for (const flag of Object.keys(idle)) {
      expect(safe({ ...snapshot, state: { ...idle, [flag]: true } })).toBe(
        false
      );
    }
  });

  it('fails closed for missing, malformed, future and stale evidence', () => {
    for (const snapshot of [
      null,
      undefined,
      false,
      {},
      [],
      { state: idle },
      { state: {}, reportedAt: now },
      { state: { ...idle, isStreaming: 'false' }, reportedAt: now },
      { state: idle, reportedAt: Number.NaN },
      { state: idle, reportedAt: now + 1 },
      { state: idle, reportedAt: now - SESSION_WORK_STATE_MAX_AGE_MS },
    ])
      expect(safe(snapshot)).toBe(false);
  });

  it('starts unknown after document reload and revokes state on unmount or bad reports', () => {
    const reporter = createSessionWorkReporter(() => now);
    expect(safe(reporter.read())).toBe(false);
    reporter.report(idle);
    expect(safe(reporter.read())).toBe(true);
    reporter.report({ ...idle, isStreaming: true });
    expect(safe(reporter.read())).toBe(false);
    reporter.report(idle);
    reporter.report(null);
    expect(safe(reporter.read())).toBe(false);
    reporter.report(idle);
    reporter.report({});
    expect(safe(reporter.read())).toBe(false);
    expect(safe(createSessionWorkReporter().read())).toBe(false);
  });

  it('copies state so a caller cannot mutate an idle report behind the owner', () => {
    const reporter = createSessionWorkReporter(() => now);
    const state = { ...idle, isUploading: true };
    reporter.report(state);
    state.isUploading = false;
    expect(safe(reporter.read())).toBe(false);
  });
});

describe('request-time work probe', () => {
  const evidence = {
    snapshot: { state: idle, reportedAt: now },
    hasUnsentInput: false,
  };
  const options = {
    read: async (): Promise<unknown> => evidence,
    isCurrentDocument: () => true,
    isAuthenticating: () => false,
    now: () => now,
  };

  it('times out a frozen renderer without permanently holding the single-flight check', async () => {
    vi.useFakeTimers();
    try {
      const pending = probeSessionWorkSafety({
        ...options,
        read: () => new Promise(() => {}),
      });
      await vi.advanceTimersByTimeAsync(SESSION_WORK_PROBE_TIMEOUT_MS);
      expect(await pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks a hidden stream, upload, pending action and DOM-only drafts', async () => {
    expect(await probeSessionWorkSafety(options)).toBe(true);
    for (const flag of ['isStreaming', 'isUploading', 'hasPendingAction']) {
      expect(
        await probeSessionWorkSafety({
          ...options,
          read: async () => ({
            ...evidence,
            snapshot: { state: { ...idle, [flag]: true }, reportedAt: now },
          }),
        })
      ).toBe(false);
    }
    expect(
      await probeSessionWorkSafety({
        ...options,
        read: async () => ({ ...evidence, hasUnsentInput: true }),
      })
    ).toBe(false);
  });

  it('fails closed for unreadable or malformed renderer and draft evidence', async () => {
    for (const result of [
      null,
      undefined,
      false,
      {},
      { ...evidence, hasUnsentInput: 0 },
    ]) {
      expect(
        await probeSessionWorkSafety({ ...options, read: async () => result })
      ).toBe(false);
    }
    expect(
      await probeSessionWorkSafety({
        ...options,
        read: async () => {
          throw new Error('renderer gone');
        },
      })
    ).toBe(false);
  });

  it('rejects evidence when navigation or authentication starts during the read', async () => {
    let resolve = (_value: unknown) => {};
    let current = true;
    let authenticating = false;
    const read = () =>
      new Promise<unknown>(r => {
        resolve = r;
      });
    const pending = probeSessionWorkSafety({
      ...options,
      read,
      isCurrentDocument: () => current,
    });
    current = false;
    resolve(evidence);
    expect(await pending).toBe(false);
    const authPending = probeSessionWorkSafety({
      ...options,
      read,
      isAuthenticating: () => authenticating,
    });
    authenticating = true;
    resolve(evidence);
    expect(await authPending).toBe(false);
  });
});

describe('all-window unattended restart', () => {
  it.each(['navigation', 'new-work', 'new-window', 'loading', 'auth'] as const)(
    'rechecks %s after a slower second window answers',
    async change => {
      const first = { generation: 1, loading: false };
      const second = { generation: 1, loading: false };
      const windows = [first, second];
      let authenticating = false;
      let finishSecond = (_safe: boolean) => {};
      const pending = probeAllWindowWorkSafety({
        getWindows: () => [...windows],
        getGeneration: window => window.generation,
        isLoading: window => window.loading,
        probe: window =>
          window === first
            ? Promise.resolve(true)
            : new Promise<boolean>(resolve => {
                finishSecond = resolve;
              }),
        isAuthenticating: () => authenticating,
      });
      await Promise.resolve();
      if (change === 'navigation' || change === 'new-work')
        first.generation += 1;
      if (change === 'new-window')
        windows.push({ generation: 0, loading: false });
      if (change === 'loading') first.loading = true;
      if (change === 'auth') authenticating = true;
      finishSecond(true);
      expect(await pending).toBe(false);
    }
  );

  it('allows an empty nightly launch but blocks pending auth and any busy window', async () => {
    const options = {
      getWindows: () => [] as number[],
      getGeneration: () => 1,
      isLoading: () => false,
      probe: async () => false,
      isAuthenticating: () => false,
    };
    expect(await probeAllWindowWorkSafety(options)).toBe(true);
    expect(
      await probeAllWindowWorkSafety({
        ...options,
        isAuthenticating: () => true,
      })
    ).toBe(false);
    expect(
      await probeAllWindowWorkSafety({ ...options, getWindows: () => [1] })
    ).toBe(false);
  });
});

describe('single-flight build checks', () => {
  it('joins overlapping wake/timer checks and permits a later check', async () => {
    let complete = () => {};
    const task = vi.fn(
      () =>
        new Promise<void>(resolve => {
          complete = resolve;
        })
    );
    const check = singleFlight(task);
    const first = check();
    expect(check()).toBe(first);
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
    complete();
    await first;
    const next = check();
    expect(next).not.toBe(first);
    await Promise.resolve();
    complete();
    await next;
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('releases a failed check so the next wake can retry', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const check = singleFlight(task);
    await expect(check()).rejects.toThrow('offline');
    await expect(check()).resolves.toBeUndefined();
    expect(task).toHaveBeenCalledTimes(2);
  });
});

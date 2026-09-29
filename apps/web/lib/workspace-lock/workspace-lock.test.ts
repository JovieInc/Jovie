import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspacePrivacyLockState,
  isMoneyHiddenCookieValue,
  isWorkspaceLockCookieValue,
  MONEY_HIDDEN_COOKIE,
  updateWorkspacePrivacyLock,
  WORKSPACE_LOCK_COOKIE,
  WorkspacePrivacyLockError,
} from './workspace-lock';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.cookie = `${WORKSPACE_LOCK_COOKIE}=; path=/; Max-Age=0`;
  document.cookie = `${MONEY_HIDDEN_COOKIE}=; path=/; Max-Age=0`;
});

describe('workspace lock cookies', () => {
  it('treats only "1" as locked / hidden', () => {
    expect(isWorkspaceLockCookieValue('1')).toBe(true);
    expect(isWorkspaceLockCookieValue('0')).toBe(false);
    expect(isWorkspaceLockCookieValue(undefined)).toBe(false);
    expect(isWorkspaceLockCookieValue(null)).toBe(false);
    expect(isMoneyHiddenCookieValue('1')).toBe(true);
    expect(isMoneyHiddenCookieValue('yes')).toBe(false);
  });
});

describe('server-owned Ovie privacy lock client', () => {
  it('reads server state without caching and validates the receipt', async () => {
    const state = { enabled: true, locked: true, unlockedUntil: null };
    fetchMock.mockResolvedValue({ ok: true, json: async () => state });

    await expect(getWorkspacePrivacyLockState()).resolves.toEqual(state);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ovie/privacy-lock',
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' })
    );
  });

  it('posts a typed opt-in action and returns the confirmed server state', async () => {
    const state = { enabled: true, locked: true, unlockedUntil: null };
    fetchMock.mockResolvedValue({ ok: true, json: async () => state });

    await expect(updateWorkspacePrivacyLock('enable')).resolves.toEqual(state);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ovie/privacy-lock',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable' }),
      })
    );
  });

  it.each([
    ['UNAUTHORIZED', 'Your session expired. Sign in again to unlock Ovie.'],
    ['unauthenticated', 'Your session expired. Sign in again to unlock Ovie.'],
    ['FORBIDDEN', 'You do not have permission to unlock Ovie.'],
    ['forbidden', 'You do not have permission to unlock Ovie.'],
    [
      'PASSKEY_STEP_UP_REQUIRED',
      'This passkey cannot unlock Ovie. Use the passkey set up for admin access.',
    ],
    [
      'PASSKEY_SETUP_REQUIRED',
      'Set up an admin-capable passkey before enabling Ovie privacy lock.',
    ],
    [
      'PRIVACY_UNLOCK_REQUIRED',
      'Unlock Ovie before changing this privacy setting.',
    ],
  ])('maps %s into a useful failure', async (code, message) => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ code, error: code }),
    });

    await expect(updateWorkspacePrivacyLock('enable')).rejects.toMatchObject({
      name: 'WorkspacePrivacyLockError',
      code,
      message,
    });
  });

  it('uses a generic action when the backend failure code is unknown', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        code: 'STORAGE_UNAVAILABLE',
        error: 'internal detail',
      }),
    });

    await expect(getWorkspacePrivacyLockState()).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
      message:
        'Could not confirm the Ovie privacy lock. Check your connection and try again.',
    });
  });

  it('fails closed when the endpoint returns unreadable JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid JSON');
      },
    });

    await expect(getWorkspacePrivacyLockState()).rejects.toBeInstanceOf(
      WorkspacePrivacyLockError
    );
  });

  it('fails closed on a network error', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(getWorkspacePrivacyLockState()).rejects.toMatchObject({
      name: 'WorkspacePrivacyLockError',
      message: expect.stringContaining('Check your connection'),
    });
  });

  it.each([
    { enabled: false, locked: false, unlockedUntil: null },
    { enabled: true, locked: true, unlockedUntil: null },
    { enabled: true, locked: false, unlockedUntil: '2026-09-29T21:00:00.000Z' },
  ])('accepts a valid server state: %o', async state => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T20:00:00.000Z'));
    fetchMock.mockResolvedValue({ ok: true, json: async () => state });

    await expect(getWorkspacePrivacyLockState()).resolves.toEqual(state);
  });

  it('rejects missing, inconsistent, invalid, and expired unlock receipts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T20:00:00.000Z'));
    const invalidStates = [
      { enabled: true, locked: false },
      { enabled: false, locked: true, unlockedUntil: null },
      { enabled: true, locked: true, unlockedUntil: '2026-09-30T20:00:00Z' },
      { enabled: true, locked: false, unlockedUntil: null },
      { enabled: true, locked: false, unlockedUntil: 'not-a-date' },
      { enabled: true, locked: false, unlockedUntil: '2026-09-29T19:59:59Z' },
    ];

    for (const state of invalidStates) {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => state });
      await expect(getWorkspacePrivacyLockState()).rejects.toBeInstanceOf(
        WorkspacePrivacyLockError
      );
    }
  });

  it('aborts a stalled request and settles with a bounded error', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null = null;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      requestSignal = init.signal ?? null;
      return new Promise((_, reject) => {
        requestSignal?.addEventListener('abort', () =>
          reject(new Error('aborted'))
        );
      });
    });

    const request = updateWorkspacePrivacyLock('lock');
    const rejection = expect(request).rejects.toMatchObject({
      code: 'timeout',
      message: expect.stringContaining('took too long'),
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    expect(requestSignal?.aborted).toBe(true);
  });
});

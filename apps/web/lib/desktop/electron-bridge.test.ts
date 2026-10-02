/**
 * @vitest-environment jsdom
 *
 * Regression test for the "shame-on-me" bug:
 *   `Uncaught TypeError: E.onUpdateAvailable is not a function`
 *
 * Caused by an installed desktop binary whose preload only exposed
 * `versions` (predates PR #8273). The renderer trusted window.electronAPI's
 * shape and called methods that didn't exist, throwing a raw TypeError
 * that surfaced as a minified error in production.
 *
 * The bridge wrappers now check `typeof === 'function'` before calling and
 * fall back gracefully. These tests pin that behavior so the original
 * regression cannot return.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testing,
  isDesktopEnvironment,
  notifyDesktopComposerReadiness,
  observeDesktopVisualActivity,
  reportDesktopWorkState,
  useDesktopBuildIdentity,
} from './electron-bridge';

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn().mockResolvedValue(undefined),
}));

import { captureWarning } from '@/lib/error-tracking';

const captureWarningMock = vi.mocked(captureWarning);

const originalWindowOpen = window.open;
let windowOpenSpy: ReturnType<typeof vi.fn>;

function clearElectronAPI(): void {
  Reflect.deleteProperty(window, 'electronAPI');
}

function setElectronAPI(api: object): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  });
}

beforeEach(() => {
  __testing.reset();
  captureWarningMock.mockClear();
  clearElectronAPI();
  windowOpenSpy = vi.fn();
  Object.defineProperty(window, 'open', {
    configurable: true,
    writable: true,
    value: windowOpenSpy,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'open', {
    configurable: true,
    writable: true,
    value: originalWindowOpen,
  });
});

describe('electron-bridge — defensive guards', () => {
  it('reports work only through a supported bridge and tolerates stale or throwing shells', () => {
    expect(reportDesktopWorkState(null)).toBe(false);
    setElectronAPI({ versions: { app: 'old' } });
    expect(reportDesktopWorkState(null)).toBe(false);
    const setWorkState = vi.fn();
    setElectronAPI({ setWorkState });
    expect(reportDesktopWorkState(null)).toBe(true);
    expect(setWorkState).toHaveBeenCalledWith(null);
    setWorkState.mockImplementation(() => {
      throw new Error('disposed');
    });
    expect(reportDesktopWorkState(null)).toBe(false);
  });

  it('omits visual subscription on old and partial bridges', () => {
    const callback = vi.fn();
    const subscribe = vi.fn();
    for (const api of [
      {},
      { onVisualActivity: subscribe },
      { getVisualActivity: vi.fn() },
    ]) {
      setElectronAPI(api);
      observeDesktopVisualActivity(callback)();
    }
    expect(subscribe).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps a newer visibility event over a delayed initial snapshot', async () => {
    let resolveSnapshot: ((active: boolean) => void) | undefined;
    let listener: ((active: boolean) => void) | undefined;
    const unsubscribe = vi.fn();
    setElectronAPI({
      getVisualActivity: () =>
        new Promise<boolean>(resolve => {
          resolveSnapshot = resolve;
        }),
      onVisualActivity: (callback: (active: boolean) => void) => {
        listener = callback;
        return unsubscribe;
      },
    });
    const callback = vi.fn();
    const dispose = observeDesktopVisualActivity(callback);
    listener?.(false);
    resolveSnapshot?.(true);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
    dispose();
    listener?.(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('reads the initial native state and tolerates rejected or malformed snapshots', async () => {
    const callback = vi.fn();
    for (const snapshot of [
      Promise.resolve(false),
      Promise.resolve(null),
      Promise.reject(new Error('old shell')),
    ]) {
      setElectronAPI({
        getVisualActivity: () => snapshot,
        onVisualActivity: () => () => undefined,
      });
      const dispose = observeDesktopVisualActivity(callback);
      await Promise.resolve();
      await Promise.resolve();
      dispose();
    }
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
  });
  it('isDesktopEnvironment returns false in pure browser context', () => {
    expect(isDesktopEnvironment()).toBe(false);
  });

  it('isDesktopEnvironment returns true when window.electronAPI exists', () => {
    setElectronAPI({});
    expect(isDesktopEnvironment()).toBe(true);
  });

  it('notifyDesktopAppBooted no-ops without a bridge and does not warn', () => {
    document.documentElement.dataset.desktopRuntime = 'electron';
    __testing.notifyDesktopAppBooted();
    expect(captureWarningMock).not.toHaveBeenCalled();
    Reflect.deleteProperty(document.documentElement.dataset, 'desktopRuntime');
  });

  it('notifyDesktopAppBooted re-sends so HMR can re-arm the shell watchdog', () => {
    const notifyAppBooted = vi.fn();
    setElectronAPI({ notifyAppBooted });
    document.documentElement.dataset.desktopRuntime = 'electron';
    __testing.notifyDesktopAppBooted();
    __testing.notifyDesktopAppBooted();
    expect(notifyAppBooted).toHaveBeenCalledTimes(2);
    Reflect.deleteProperty(document.documentElement.dataset, 'desktopRuntime');
  });

  it('safeOnUpdateAvailable does NOT throw when bridge is missing the method (stale binary)', () => {
    setElectronAPI({
      versions: { app: '0.1.0' },
    });
    const cb = vi.fn();
    expect(() => __testing.safeOnUpdateAvailable(cb)).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });

  it('safeOnUpdateAvailable captures a Sentry warning when method is missing', () => {
    setElectronAPI({
      versions: { app: '0.1.0' },
    });
    __testing.safeOnUpdateAvailable(() => {});
    expect(captureWarningMock).toHaveBeenCalledTimes(1);
    const [message, , context] = captureWarningMock.mock.calls[0];
    expect(message).toContain('onUpdateAvailable');
    expect(context).toMatchObject({
      route: 'desktop/electron-bridge',
      bridgeMethod: 'onUpdateAvailable',
      installedAppVersion: '0.1.0',
    });
  });

  it('captures the missing-method warning ONCE per session, not on every call', () => {
    setElectronAPI({});
    __testing.safeOnUpdateAvailable(() => {});
    __testing.safeOnUpdateAvailable(() => {});
    __testing.safeOnUpdateAvailable(() => {});
    expect(captureWarningMock).toHaveBeenCalledTimes(1);
  });

  it('safeOnUpdateAvailable invokes the bridge when method exists', () => {
    const onUpdateAvailable = vi.fn();
    setElectronAPI({
      onUpdateAvailable,
    });
    const cb = vi.fn();
    __testing.safeOnUpdateAvailable(cb);
    expect(onUpdateAvailable).toHaveBeenCalledWith(cb);
    expect(captureWarningMock).not.toHaveBeenCalled();
  });

  it('safeOnUpdateDownloaded invokes the bridge when method exists', () => {
    const onUpdateDownloaded = vi.fn();
    setElectronAPI({
      onUpdateDownloaded,
    });
    const cb = vi.fn();
    __testing.safeOnUpdateDownloaded(cb);
    expect(onUpdateDownloaded).toHaveBeenCalledWith(cb);
    expect(captureWarningMock).not.toHaveBeenCalled();
  });

  it('safeInstallUpdateAndRestart reports failure when the bridge method is missing', async () => {
    setElectronAPI({
      versions: { app: '0.1.0' },
    });
    await expect(__testing.safeInstallUpdateAndRestart()).resolves.toBe(false);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      __testing.RELEASE_DOWNLOAD_URL,
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('safeInstallUpdateAndRestart reports failure when the bridge throws', async () => {
    const installUpdateAndRestart = vi.fn(() => {
      throw new Error('IPC channel closed');
    });
    setElectronAPI({
      installUpdateAndRestart,
    });
    await expect(__testing.safeInstallUpdateAndRestart()).resolves.toBe(false);
    expect(installUpdateAndRestart).toHaveBeenCalled();
    expect(windowOpenSpy).toHaveBeenCalledWith(
      __testing.RELEASE_DOWNLOAD_URL,
      '_blank',
      'noopener,noreferrer'
    );
    expect(captureWarningMock).toHaveBeenCalled();
  });

  it('safeInstallUpdateAndRestart falls back when bridge resolves ok false', async () => {
    const installUpdateAndRestart = vi.fn(async () => ({
      ok: false,
      reason: 'No downloaded update',
    }));
    setElectronAPI({
      installUpdateAndRestart,
    });
    await expect(__testing.safeInstallUpdateAndRestart()).resolves.toBe(false);
    expect(installUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      __testing.RELEASE_DOWNLOAD_URL,
      '_blank',
      'noopener,noreferrer'
    );
    expect(captureWarningMock).toHaveBeenCalled();
  });

  it('safeInstallUpdateAndRestart reports success when the bridge starts installation', async () => {
    const installUpdateAndRestart = vi.fn();
    setElectronAPI({
      installUpdateAndRestart,
    });
    await expect(__testing.safeInstallUpdateAndRestart()).resolves.toBe(true);
    expect(installUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('safeInstallUpdateAndRestart reports failure when the IPC promise rejects', async () => {
    setElectronAPI({
      installUpdateAndRestart: vi.fn(async () => {
        throw new Error('IPC channel closed');
      }),
    });
    await expect(__testing.safeInstallUpdateAndRestart()).resolves.toBe(false);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      __testing.RELEASE_DOWNLOAD_URL,
      '_blank',
      'noopener,noreferrer'
    );
    expect(captureWarningMock).toHaveBeenCalled();
  });

  it('openDesktopAuthUrl uses the explicit bridge method when available', async () => {
    const openDesktopAuthUrl = vi.fn(async () => ({ ok: true }));
    setElectronAPI({
      openDesktopAuthUrl,
    });

    await expect(
      __testing.openDesktopAuthUrl(
        'https://jov.ie/auth/start?client=electron&intent=sign_in&return_to=%2Fapp&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    ).resolves.toEqual({ ok: true });

    expect(openDesktopAuthUrl).toHaveBeenCalledWith(
      'https://jov.ie/auth/start?client=electron&intent=sign_in&return_to=%2Fapp&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
    );
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('openPublicProfileInBrowser uses the isolated preview bridge action', async () => {
    const openPublicProfileInBrowser = vi.fn(async () => ({ ok: true }));
    setElectronAPI({ openPublicProfileInBrowser });

    await expect(__testing.openPublicProfileInBrowser()).resolves.toEqual({
      ok: true,
    });
    expect(openPublicProfileInBrowser).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('openPublicProfileInBrowser fails closed when the stale bridge lacks the method', async () => {
    setElectronAPI({ versions: { app: '0.1.0' } });
    await expect(__testing.openPublicProfileInBrowser()).resolves.toEqual({
      ok: false,
      reason: 'profile-browser-bridge-unavailable',
    });
  });

  it('openDesktopAuthUrl returns the bridge failure reason when open fails', async () => {
    const openDesktopAuthUrl = vi.fn(async () => ({
      ok: false,
      reason: 'invalid-auth-url',
    }));
    setElectronAPI({
      openDesktopAuthUrl,
    });

    await expect(
      __testing.openDesktopAuthUrl(
        'https://jov.ie/auth/start?client=electron&intent=sign_in&return_to=%2Fapp&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    ).resolves.toEqual({ ok: false, reason: 'invalid-auth-url' });

    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('copyDesktopAuthUrl uses only the explicit validated bridge method', async () => {
    const copyDesktopAuthUrl = vi.fn(async () => ({ ok: true }));
    setElectronAPI({ copyDesktopAuthUrl });
    const authUrl = 'https://jov.ie/signin?runtime=electron';

    await expect(__testing.copyDesktopAuthUrl(authUrl)).resolves.toEqual({
      ok: true,
    });
    expect(copyDesktopAuthUrl).toHaveBeenCalledWith(authUrl);
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('redeems return codes only through the explicit bridge method', async () => {
    const redeemDesktopAuthReturnCode = vi.fn(
      async (): Promise<{ ok: boolean; reason?: string }> => ({
        ok: false,
        reason: 'invalid-code',
      })
    );
    setElectronAPI({ redeemDesktopAuthReturnCode });

    expect(__testing.supportsDesktopAuthReturnCode()).toBe(true);
    await expect(
      __testing.redeemDesktopAuthReturnCode('BCDF-GHJK')
    ).resolves.toEqual({ ok: false, reason: 'invalid-code' });
    expect(redeemDesktopAuthReturnCode).toHaveBeenCalledWith('BCDF-GHJK');

    redeemDesktopAuthReturnCode.mockResolvedValueOnce({ ok: true });
    await expect(
      __testing.redeemDesktopAuthReturnCode('BCDF-GHJK')
    ).resolves.toEqual({ ok: true });
  });

  it('reads Touch ID state through the bridge and fails closed without it', async () => {
    const getDesktopPasskeyState = vi.fn(async () => ({
      available: true,
      enrolled: 'yes',
      dismissed: false,
    }));
    const setDesktopPasskeyState = vi.fn(
      async (): Promise<{ ok: boolean; reason?: string }> => ({ ok: true })
    );
    const completeDesktopPasskeySignIn = vi.fn(
      async (): Promise<{ ok: boolean; reason?: string }> => ({
        ok: false,
        reason: 'invalid-request',
      })
    );
    setElectronAPI({
      getDesktopPasskeyState,
      setDesktopPasskeyState,
      completeDesktopPasskeySignIn,
    });

    await expect(__testing.getDesktopPasskeyState()).resolves.toEqual({
      available: true,
      enrolled: false,
      dismissed: false,
    });
    await expect(__testing.setDesktopPasskeyState('enrolled')).resolves.toEqual(
      { ok: true }
    );
    expect(setDesktopPasskeyState).toHaveBeenCalledWith('enrolled');
    await expect(__testing.completeDesktopPasskeySignIn()).resolves.toEqual({
      ok: false,
      reason: 'invalid-request',
    });

    setElectronAPI({ versions: { app: '0.1.0' } });
    await expect(__testing.getDesktopPasskeyState()).resolves.toEqual({
      available: false,
      enrolled: false,
      dismissed: false,
    });
    await expect(__testing.completeDesktopPasskeySignIn()).resolves.toEqual({
      ok: false,
      reason: 'desktop-passkey-bridge-unavailable',
    });
  });

  it('reports return codes unsupported on a stale bridge', async () => {
    setElectronAPI({ versions: { app: '0.1.0' } });

    expect(__testing.supportsDesktopAuthReturnCode()).toBe(false);
    await expect(
      __testing.redeemDesktopAuthReturnCode('BCDF-GHJK')
    ).resolves.toEqual({
      ok: false,
      reason: 'desktop-auth-return-code-bridge-unavailable',
    });
  });

  it('copyDesktopAuthUrl fails closed for a stale bridge', async () => {
    setElectronAPI({ versions: { app: '0.1.0' } });

    await expect(
      __testing.copyDesktopAuthUrl('https://jov.ie/signin?runtime=electron')
    ).resolves.toEqual({
      ok: false,
      reason: 'desktop-auth-copy-bridge-unavailable',
    });
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('copyDesktopAuthUrl preserves a main-process copy failure', async () => {
    const copyDesktopAuthUrl = vi.fn(async () => ({
      ok: false,
      reason: 'clipboard-write-failed',
    }));
    setElectronAPI({ copyDesktopAuthUrl });

    await expect(
      __testing.copyDesktopAuthUrl('https://jov.ie/signin?runtime=electron')
    ).resolves.toEqual({
      ok: false,
      reason: 'clipboard-write-failed',
    });
  });

  it('copyDesktopAuthUrl supplies a bounded default failure reason', async () => {
    const copyDesktopAuthUrl = vi.fn(async () => ({ ok: false }));
    setElectronAPI({ copyDesktopAuthUrl });

    await expect(
      __testing.copyDesktopAuthUrl('https://jov.ie/signin?runtime=electron')
    ).resolves.toEqual({
      ok: false,
      reason: 'desktop-auth-copy-failed',
    });
  });

  it('startDesktopAuthHandoff uses explicit IPC when available', async () => {
    const startDesktopAuthHandoff = vi.fn(async () => ({ ok: true }));
    setElectronAPI({
      startDesktopAuthHandoff,
    });

    await expect(
      __testing.startDesktopAuthHandoff(
        'https://jov.ie/auth/start?client=electron&intent=sign_up&return_to=%2Fstart&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    ).resolves.toEqual({ ok: true });

    expect(startDesktopAuthHandoff).toHaveBeenCalledWith(
      'https://jov.ie/auth/start?client=electron&intent=sign_up&return_to=%2Fstart&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
    );
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('startDesktopAuthHandoff returns the bridge failure reason when IPC rejects', async () => {
    const startDesktopAuthHandoff = vi.fn(async () => ({
      ok: false,
      reason: 'invalid-auth-url',
    }));
    setElectronAPI({
      startDesktopAuthHandoff,
    });

    await expect(
      __testing.startDesktopAuthHandoff(
        'https://jov.ie/auth/start?client=electron&intent=sign_up&return_to=%2Fstart&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    ).resolves.toEqual({ ok: false, reason: 'invalid-auth-url' });

    expect(startDesktopAuthHandoff).toHaveBeenCalledWith(
      'https://jov.ie/auth/start?client=electron&intent=sign_up&return_to=%2Fstart&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
    );
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('consumeDesktopAuthCompletion returns a validated one-time completion payload', async () => {
    const completion = {
      code: 'code_123',
      state: 'state_123',
      codeVerifier: 'verifier_123',
    };
    const consumeDesktopAuthCompletion = vi.fn(async () => ({
      ok: true,
      completion,
    }));
    setElectronAPI({
      consumeDesktopAuthCompletion,
    });

    await expect(__testing.consumeDesktopAuthCompletion()).resolves.toEqual({
      ok: true,
      completion,
    });
  });

  it('consumeDesktopAuthCompletion rejects malformed bridge payloads', async () => {
    const consumeDesktopAuthCompletion = vi.fn(async () => ({
      ok: true,
      completion: { code: 'code_123' },
    }));
    setElectronAPI({
      consumeDesktopAuthCompletion,
    });

    await expect(__testing.consumeDesktopAuthCompletion()).resolves.toEqual({
      ok: false,
      reason: 'invalid-completion',
    });
  });

  it('safeGetDictationStatus allows browser Web Speech outside Electron', async () => {
    await expect(__testing.safeGetDictationStatus()).resolves.toMatchObject({
      ok: true,
      mode: 'web-speech',
      webSpeechFallbackAllowed: true,
    });
    expect(captureWarningMock).not.toHaveBeenCalled();
  });

  it('safeGetDictationStatus disables stale Electron binaries quietly', async () => {
    setElectronAPI({
      versions: { app: '0.1.0' },
    });

    await expect(__testing.safeGetDictationStatus()).resolves.toMatchObject({
      ok: false,
      mode: 'unavailable',
      webSpeechFallbackAllowed: false,
    });
    expect(captureWarningMock).toHaveBeenCalledTimes(1);
    const [message, , context] = captureWarningMock.mock.calls[0];
    expect(message).toContain('getDictationStatus');
    expect(context).toMatchObject({
      route: 'desktop/electron-bridge',
      bridgeMethod: 'getDictationStatus',
      installedAppVersion: '0.1.0',
    });
  });

  it('safeGetDictationStatus invokes the desktop bridge when present', async () => {
    const getDictationStatus = vi.fn().mockResolvedValue({
      ok: true,
      nativeAvailable: false,
      webSpeechFallbackAllowed: true,
      mode: 'web-speech',
      reason: 'native-unavailable',
    });
    setElectronAPI({ getDictationStatus });

    await expect(__testing.safeGetDictationStatus()).resolves.toMatchObject({
      ok: true,
      mode: 'web-speech',
      webSpeechFallbackAllowed: true,
    });
    expect(getDictationStatus).toHaveBeenCalledTimes(1);
    expect(captureWarningMock).not.toHaveBeenCalled();
  });

  it('safeGetDictationStatus rejects malformed bridge payloads', async () => {
    const getDictationStatus = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'web-speech',
    });
    setElectronAPI({ getDictationStatus });

    await expect(__testing.safeGetDictationStatus()).resolves.toMatchObject({
      ok: false,
      mode: 'unavailable',
      webSpeechFallbackAllowed: false,
    });
    expect(getDictationStatus).toHaveBeenCalledTimes(1);
    expect(captureWarningMock).toHaveBeenCalledTimes(1);
    const [message, , context] = captureWarningMock.mock.calls[0];
    expect(message).toContain('invalid payload');
    expect(context).toMatchObject({
      route: 'desktop/electron-bridge',
      bridgeMethod: 'getDictationStatus',
    });
  });

  describe('setDesktopTrayState / onDesktopTrayAction — tray bridge', () => {
    it('setDesktopTrayState silently no-ops when electronAPI is absent', async () => {
      await expect(
        __testing.setDesktopTrayState('idle')
      ).resolves.toBeUndefined();
      expect(captureWarningMock).not.toHaveBeenCalled();
    });

    it('setDesktopTrayState silently no-ops when setTrayState is missing (stale binary)', async () => {
      setElectronAPI({ versions: { app: '0.1.0' } });
      await expect(
        __testing.setDesktopTrayState('active', 3)
      ).resolves.toBeUndefined();
      expect(captureWarningMock).not.toHaveBeenCalled();
    });

    it('setDesktopTrayState calls the bridge with state + unreadCount', async () => {
      const setTrayState = vi.fn().mockResolvedValue({ ok: true });
      setElectronAPI({ setTrayState });

      await __testing.setDesktopTrayState('unread', 5);
      expect(setTrayState).toHaveBeenCalledWith({
        state: 'unread',
        unreadCount: 5,
      });
    });

    it('setDesktopTrayState omits unreadCount when not provided', async () => {
      const setTrayState = vi.fn().mockResolvedValue({ ok: true });
      setElectronAPI({ setTrayState });

      await __testing.setDesktopTrayState('idle');
      expect(setTrayState).toHaveBeenCalledWith({
        state: 'idle',
        unreadCount: undefined,
      });
    });

    it('onDesktopTrayAction returns a noop unsubscribe when electronAPI is absent', () => {
      const cb = vi.fn();
      const unsub = __testing.onDesktopTrayAction(cb);
      expect(typeof unsub).toBe('function');
      expect(() => unsub()).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });

    it('onDesktopTrayAction returns a noop unsubscribe when onTrayAction is missing', () => {
      setElectronAPI({ versions: { app: '0.1.0' } });
      const cb = vi.fn();
      const unsub = __testing.onDesktopTrayAction(cb);
      expect(typeof unsub).toBe('function');
      expect(() => unsub()).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });

    it('onDesktopTrayAction wires up the bridge listener and returns an unsubscribe', () => {
      const mockUnsub = vi.fn();
      const onTrayAction = vi.fn().mockReturnValue(mockUnsub);
      setElectronAPI({ onTrayAction });

      const cb = vi.fn();
      const unsub = __testing.onDesktopTrayAction(cb);

      expect(onTrayAction).toHaveBeenCalledWith(cb);
      expect(typeof unsub).toBe('function');
      unsub();
      expect(mockUnsub).toHaveBeenCalledTimes(1);
    });

    it('onDesktopTrayAction falls back to noop when bridge returns non-function', () => {
      const onTrayAction = vi.fn().mockReturnValue(undefined);
      setElectronAPI({ onTrayAction });

      const unsub = __testing.onDesktopTrayAction(vi.fn());
      expect(typeof unsub).toBe('function');
      expect(() => unsub()).not.toThrow();
    });
  });

  describe('showDesktopNotification — native notification bridge', () => {
    it('silently no-ops when electronAPI is absent (browser)', async () => {
      await expect(
        __testing.showDesktopNotification({ title: 'New message' })
      ).resolves.toBeUndefined();
      expect(captureWarningMock).not.toHaveBeenCalled();
    });

    it('silently no-ops when showNotification is missing (stale binary)', async () => {
      setElectronAPI({ versions: { app: '0.1.0' } });
      await expect(
        __testing.showDesktopNotification({ title: 'New message' })
      ).resolves.toBeUndefined();
      expect(captureWarningMock).not.toHaveBeenCalled();
    });

    it('passes the payload through to the bridge', async () => {
      const showNotification = vi.fn().mockResolvedValue({ ok: true });
      setElectronAPI({ showNotification });

      const payload = {
        title: 'New fan DM',
        body: 'Alex sent you a message',
        url: '/inbox?thread=123',
      };
      await __testing.showDesktopNotification(payload);
      expect(showNotification).toHaveBeenCalledWith(payload);
    });
  });
});

/**
 * JOV-5996: the identity handoff is a single invoke that runs while a cold
 * relaunch is mid-way through the splash → hosted swap; a transiently dropped
 * or rejected invoke must not latch the titlebar on "Unknown". Bounded retries
 * let the trusted reply land while a persistently untrusted reply still
 * settles to undefined.
 */
describe('useDesktopBuildIdentity — build-identity handoff', () => {
  const verifiedIdentity = {
    channel: 'production',
    version: '26.9.1',
    sourceRevision: 'a'.repeat(40),
    builtAt: '2026-09-09T00:00:00.000Z',
    provenance: 'verified' as const,
  };

  it('resolves the verified identity from a trusted invoke', async () => {
    setElectronAPI({
      getBuildIdentity: vi.fn().mockResolvedValue(verifiedIdentity),
    });
    const { result } = renderHook(() => useDesktopBuildIdentity());
    await waitFor(() => expect(result.current).toEqual(verifiedIdentity));
  });

  it('recovers when the first invoke is dropped mid-handoff', async () => {
    vi.useFakeTimers();
    try {
      const getBuildIdentity = vi
        .fn()
        .mockRejectedValueOnce(new Error('frame was detached'))
        .mockResolvedValue(verifiedIdentity);
      setElectronAPI({ getBuildIdentity });
      const { result } = renderHook(() => useDesktopBuildIdentity());

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current).toBeUndefined();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(result.current).toEqual(verifiedIdentity);
      expect(getBuildIdentity).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles to undefined after bounded retries when the reply stays untrusted', async () => {
    vi.useFakeTimers();
    try {
      const getBuildIdentity = vi.fn().mockResolvedValue(null);
      setElectronAPI({ getBuildIdentity });
      const { result } = renderHook(() => useDesktopBuildIdentity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(result.current).toBeUndefined();
      // Initial call + bounded retries — then it gives up.
      expect(getBuildIdentity).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays undefined when the bridge lacks getBuildIdentity (stale binary)', async () => {
    setElectronAPI({ versions: { app: '0.1.0' } });
    const { result } = renderHook(() => useDesktopBuildIdentity());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeUndefined();
  });
});

describe('narrow current Ovie browser bridge', () => {
  it('passes no destination to native and never uses window.open', async () => {
    const open = vi.fn(async () => ({ ok: true }));
    setElectronAPI({ openCurrentOvieInBrowser: open });
    expect(await __testing.openCurrentOvieInBrowser()).toEqual({ ok: true });
    expect(open).toHaveBeenCalledExactlyOnceWith();
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
  it('fails closed for stale binary or ordinary browser', async () => {
    expect((await __testing.openCurrentOvieInBrowser()).ok).toBe(false);
    setElectronAPI({});
    expect(await __testing.openCurrentOvieInBrowser()).toEqual({
      ok: false,
      reason: 'ovie-browser-bridge-unavailable',
    });
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
  it.each([null, { ok: false }, { ok: false, reason: 'blocked-url' }])(
    'preserves explicit native failure %j',
    async result => {
      setElectronAPI({ openCurrentOvieInBrowser: vi.fn(async () => result) });
      expect((await __testing.openCurrentOvieInBrowser()).ok).toBe(false);
      expect(windowOpenSpy).not.toHaveBeenCalled();
    }
  );
  it('converts rejected IPC into actionable failure', async () => {
    setElectronAPI({
      openCurrentOvieInBrowser: vi.fn().mockRejectedValue(Error('IPC lost')),
    });
    expect(await __testing.openCurrentOvieInBrowser()).toEqual({
      ok: false,
      reason: 'ovie-browser-open-failed',
    });
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});

describe('passive composer launch readiness bridge', () => {
  it('silently tolerates browsers, old binaries, and a failed IPC', async () => {
    expect(await notifyDesktopComposerReadiness('visible-editable')).toBe(
      false
    );
    setElectronAPI({});
    expect(await notifyDesktopComposerReadiness('focused')).toBe(false);
    setElectronAPI({
      notifyComposerReadiness: vi.fn().mockRejectedValue(new Error('closed')),
    });
    expect(await notifyDesktopComposerReadiness('focused')).toBe(false);
    expect(captureWarningMock).not.toHaveBeenCalled();
  });
  it('forwards only the milestone and requires a positive main-process receipt', async () => {
    const notifyComposerReadiness = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    setElectronAPI({ notifyComposerReadiness });
    expect(await notifyDesktopComposerReadiness('visible-editable')).toBe(
      false
    );
    expect(await notifyDesktopComposerReadiness('focused')).toBe(true);
    expect(notifyComposerReadiness.mock.calls).toEqual([
      ['visible-editable'],
      ['focused'],
    ]);
  });
});

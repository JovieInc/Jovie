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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testing, isDesktopEnvironment } from './electron-bridge';

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
  it('isDesktopEnvironment returns false in pure browser context', () => {
    expect(isDesktopEnvironment()).toBe(false);
  });

  it('isDesktopEnvironment returns true when window.electronAPI exists', () => {
    setElectronAPI({});
    expect(isDesktopEnvironment()).toBe(true);
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

  it('safeInstallUpdateAndRestart falls back to opening releases URL when method is missing', () => {
    setElectronAPI({
      versions: { app: '0.1.0' },
    });
    __testing.safeInstallUpdateAndRestart();
    expect(windowOpenSpy).toHaveBeenCalledWith(
      __testing.RELEASE_DOWNLOAD_URL,
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('safeInstallUpdateAndRestart falls back to download URL when bridge throws', () => {
    const installUpdateAndRestart = vi.fn(() => {
      throw new Error('IPC channel closed');
    });
    setElectronAPI({
      installUpdateAndRestart,
    });
    __testing.safeInstallUpdateAndRestart();
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
    __testing.safeInstallUpdateAndRestart();
    await Promise.resolve();
    expect(installUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      __testing.RELEASE_DOWNLOAD_URL,
      '_blank',
      'noopener,noreferrer'
    );
    expect(captureWarningMock).toHaveBeenCalled();
  });

  it('safeInstallUpdateAndRestart triggers bridge cleanly when method exists', () => {
    const installUpdateAndRestart = vi.fn();
    setElectronAPI({
      installUpdateAndRestart,
    });
    __testing.safeInstallUpdateAndRestart();
    expect(installUpdateAndRestart).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).not.toHaveBeenCalled();
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
});

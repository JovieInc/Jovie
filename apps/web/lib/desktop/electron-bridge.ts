'use client';

import { useEffect, useState } from 'react';
import { captureWarning } from '@/lib/error-tracking';

// ---------------------------------------------------------------------------
// ElectronAPI contract — mirrors what apps/desktop/src/preload.ts exposes.
//
// THIS IS THE CONTRACT. Any change to the preload bridge MUST update this
// type AND bump the contract version below so the renderer can detect
// stale binaries and fail gracefully instead of throwing at the user.
// ---------------------------------------------------------------------------

export interface ElectronAPI {
  readonly platform: NodeJS.Platform;
  readonly electronVersion: string;
  /** Register a callback that fires when electron-updater detects a new version. */
  readonly onUpdateAvailable: (cb: () => void) => void | (() => void);
  /** Register a callback that fires when the update download is complete. */
  readonly onUpdateDownloaded: (cb: () => void) => void | (() => void);
  /** Trigger quit-and-install in the main process. */
  readonly installUpdateAndRestart: () => void | Promise<{
    readonly ok: boolean;
    readonly reason?: string;
  }>;
  /** Navigate back in the SPA history stack. */
  readonly goBack: () => Promise<void>;
  /** Navigate forward in the SPA history stack. */
  readonly goForward: () => Promise<void>;
  /** Subscribe to nav-state changes; returns unsubscribe. */
  readonly onNavStateChanged: (
    cb: (state: { canGoBack: boolean; canGoForward: boolean }) => void
  ) => () => void;
  /** Ask the main process to show the dedicated auth handoff window. */
  readonly startDesktopAuthHandoff?: (authUrl: string) => Promise<{
    readonly ok: boolean;
    readonly reason?: string;
  }>;
  /** Open the desktop auth URL in the system browser from the handoff window. */
  readonly openDesktopAuthUrl?: (authUrl: string) => Promise<{
    readonly ok: boolean;
    readonly reason?: string;
  }>;
  /** Close the dedicated desktop auth handoff window. */
  readonly closeDesktopAuthWindow?: () => Promise<{
    readonly ok: boolean;
    readonly reason?: string;
  }>;
  /** Consume the one-time auth completion payload delivered by the desktop deep link. */
  readonly consumeDesktopAuthCompletion?: () => Promise<DesktopAuthCompletionResult>;
  /**
   * Desktop dictation capability probe. Native OS dictation APIs are not
   * exposed directly to the sandboxed renderer; this tells the web composer
   * whether Electron has explicitly allowed the trusted Web Speech fallback.
   */
  readonly getDictationStatus?: () => Promise<DesktopDictationStatus>;
}

export interface DesktopAuthCompletion {
  readonly code: string;
  readonly state: string;
  readonly codeVerifier: string;
}

export type DesktopAuthCompletionResult =
  | {
      readonly ok: true;
      readonly completion: DesktopAuthCompletion;
    }
  | {
      readonly ok: false;
      readonly reason?: string;
    };

export interface DesktopAuthActionResult {
  readonly ok: boolean;
  readonly reason?: string;
}

type InstallUpdateResult = Awaited<
  ReturnType<ElectronAPI['installUpdateAndRestart']>
>;

/** Public download fallback when the auto-update bridge is unusable. */
const RELEASE_DOWNLOAD_URL =
  'https://github.com/JovieInc/Jovie/releases/latest';

// ---------------------------------------------------------------------------
// Defensive bridge accessor
//
// "Shame-on-me" prevention: a stale installed binary may expose a partial
// `window.electronAPI` (e.g. only `versions`). Calling missing methods used
// to throw a raw `TypeError` that surfaced as `E.onUpdateAvailable is not a
// function` in production. Now every accessor checks `typeof === 'function'`
// first, captures a one-time Sentry warning identifying the missing method
// and the installed app's version, and falls back to a no-op or a download
// link so the user is never confronted with a raw renderer error.
// ---------------------------------------------------------------------------

const reportedMissing = new Set<string>();
const noopUnsubscribe = () => undefined;

function reportMissingBridgeMethod(method: keyof ElectronAPI): void {
  if (reportedMissing.has(method)) return;
  reportedMissing.add(method);

  const raw = (globalThis as { window?: { electronAPI?: unknown } }).window
    ?.electronAPI;
  const installedVersion =
    typeof raw === 'object' && raw !== null && 'versions' in raw
      ? ((raw as { versions?: { app?: string } }).versions?.app ?? 'unknown')
      : 'unknown';

  void captureWarning(
    `electronAPI.${method} missing — stale desktop binary?`,
    `Renderer expected window.electronAPI.${method} but it was not a function. ` +
      `Likely the installed Jovie desktop app predates the bridge change that added this method. ` +
      `User should download the latest release from ${RELEASE_DOWNLOAD_URL}.`,
    {
      route: 'desktop/electron-bridge',
      bridgeMethod: method,
      installedAppVersion: installedVersion,
    }
  );
}

function getRawElectronAPI(): Partial<ElectronAPI> | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = (window as Window & { electronAPI?: Partial<ElectronAPI> })
    .electronAPI;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw;
}

export function getElectronAPI(): ElectronAPI | undefined {
  const api = getRawElectronAPI();
  if (!api) return undefined;
  if (
    typeof api.platform === 'string' &&
    typeof api.electronVersion === 'string' &&
    typeof api.onUpdateAvailable === 'function' &&
    typeof api.onUpdateDownloaded === 'function' &&
    typeof api.installUpdateAndRestart === 'function' &&
    typeof api.goBack === 'function' &&
    typeof api.goForward === 'function' &&
    typeof api.onNavStateChanged === 'function'
  ) {
    return api as ElectronAPI;
  }
  return undefined;
}

/**
 * Returns true when running inside the Electron desktop shell (regardless of
 * which bridge methods exist). Use this to gate desktop-only UI; for actual
 * bridge calls always go through the wrappers below — never the raw object.
 */
export function isDesktopEnvironment(): boolean {
  return getRawElectronAPI() !== undefined;
}

/**
 * Subscribe to "update-available" if the bridge supports it.
 * No-op + Sentry warning if the installed binary lacks the method.
 */
function safeOnUpdateAvailable(cb: () => void): () => void {
  const api = getRawElectronAPI();
  if (!api) return noopUnsubscribe;
  if (typeof api.onUpdateAvailable !== 'function') {
    reportMissingBridgeMethod('onUpdateAvailable');
    return noopUnsubscribe;
  }
  const unsubscribe = api.onUpdateAvailable(cb);
  return typeof unsubscribe === 'function' ? unsubscribe : noopUnsubscribe;
}

function safeOnUpdateDownloaded(cb: () => void): () => void {
  const api = getRawElectronAPI();
  if (!api) return noopUnsubscribe;
  if (typeof api.onUpdateDownloaded !== 'function') {
    reportMissingBridgeMethod('onUpdateDownloaded');
    return noopUnsubscribe;
  }
  const unsubscribe = api.onUpdateDownloaded(cb);
  return typeof unsubscribe === 'function' ? unsubscribe : noopUnsubscribe;
}

function openManualDownload(): void {
  // Fallback: open the releases page in the system browser (or in-app).
  // window.open is safe in both browser and Electron contexts; Electron's
  // shell handler will route it via shell.openExternal.
  if (typeof window !== 'undefined') {
    window.open(RELEASE_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
  }
}

function openBrowserFallback(url: string): DesktopAuthActionResult {
  if (typeof window !== 'undefined') {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    return opened
      ? { ok: true }
      : { ok: false, reason: 'browser-window-open-blocked' };
  }
  return { ok: false, reason: 'browser-window-unavailable' };
}

function reportInstallFailure(error: unknown): void {
  void captureWarning(
    'installUpdateAndRestart threw — falling back to manual download',
    error,
    { route: 'desktop/electron-bridge' }
  );
  openManualDownload();
}

function handleInstallResult(result: InstallUpdateResult): void {
  if (result && result.ok === false) {
    reportInstallFailure(
      new Error(result.reason ?? 'installUpdateAndRestart returned ok=false')
    );
  }
}

/**
 * Trigger quit-and-install. If the bridge is missing the method (stale
 * binary), opens the GitHub releases page so the user can manually download
 * the latest signed build — the fix for the chicken-and-egg where unsigned
 * stale binaries can't auto-update themselves.
 */
function safeInstallUpdateAndRestart(): void {
  const api = getRawElectronAPI();

  if (api && typeof api.installUpdateAndRestart === 'function') {
    try {
      const result = api.installUpdateAndRestart();
      if (result && typeof result.then === 'function') {
        void result.then(handleInstallResult).catch(reportInstallFailure);
      }
      return;
    } catch (error) {
      reportInstallFailure(error);
      return;
    }
  } else if (api) {
    reportMissingBridgeMethod('installUpdateAndRestart');
  }

  openManualDownload();
}

export function isElectronRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDesktopEnvironment()) return true;
  return document.documentElement.dataset.desktopRuntime === 'electron';
}

export function useIsElectronRuntime(): boolean {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(isElectronRuntime());
  }, []);

  return isElectron;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface DesktopUpdateState {
  /** True once electron-updater fires `update-available`. */
  readonly available: boolean;
  /** True once the update download completes (ready to install). */
  readonly downloaded: boolean;
  /** Trigger quit-and-install, or fall back to opening the download page. */
  readonly install: () => void;
}

/**
 * useDesktopUpdate — subscribes to Electron auto-updater IPC events.
 *
 * Returns `available: false` when running in a plain browser context or when
 * the installed desktop binary's bridge is partial/stale. Never throws.
 */
export function useDesktopUpdate(): DesktopUpdateState {
  const [available, setAvailable] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const unsubscribeAvailable = safeOnUpdateAvailable(() =>
      setAvailable(true)
    );
    const unsubscribeDownloaded = safeOnUpdateDownloaded(() =>
      setDownloaded(true)
    );

    return () => {
      unsubscribeAvailable();
      unsubscribeDownloaded();
    };
  }, []);

  return {
    available,
    downloaded,
    install: safeInstallUpdateAndRestart,
  };
}

export async function startDesktopAuthHandoff(
  authUrl: string
): Promise<DesktopAuthActionResult> {
  const api = getRawElectronAPI();
  if (api && typeof api.startDesktopAuthHandoff === 'function') {
    const result = await api.startDesktopAuthHandoff(authUrl);
    if (result?.ok) return { ok: true };
    if (result) {
      return {
        ok: false,
        reason: result.reason ?? 'desktop-auth-handoff-failed',
      };
    }
    return openBrowserFallback(authUrl);
  }
  if (api) {
    reportMissingBridgeMethod('startDesktopAuthHandoff');
  }
  return openBrowserFallback(authUrl);
}

export async function openDesktopAuthUrl(
  authUrl: string
): Promise<DesktopAuthActionResult> {
  const api = getRawElectronAPI();
  if (api && typeof api.openDesktopAuthUrl === 'function') {
    const result = await api.openDesktopAuthUrl(authUrl);
    if (result.ok) return { ok: true };
    return {
      ok: false,
      reason: result.reason ?? 'desktop-auth-open-failed',
    };
  } else if (api) {
    reportMissingBridgeMethod('openDesktopAuthUrl');
  }
  return openBrowserFallback(authUrl);
}

export async function closeDesktopAuthWindow(): Promise<void> {
  const api = getRawElectronAPI();
  if (api && typeof api.closeDesktopAuthWindow === 'function') {
    await api.closeDesktopAuthWindow();
  }
}

function isDesktopAuthCompletion(
  value: unknown
): value is DesktopAuthCompletion {
  if (value === null || typeof value !== 'object') return false;
  const completion = value as Partial<DesktopAuthCompletion>;
  return (
    typeof completion.code === 'string' &&
    completion.code.length > 0 &&
    typeof completion.state === 'string' &&
    completion.state.length > 0 &&
    typeof completion.codeVerifier === 'string' &&
    completion.codeVerifier.length > 0
  );
}

export async function consumeDesktopAuthCompletion(): Promise<DesktopAuthCompletionResult> {
  const api = getRawElectronAPI();
  if (api && typeof api.consumeDesktopAuthCompletion === 'function') {
    const result = await api.consumeDesktopAuthCompletion();
    if (!result.ok) {
      return { ok: false, reason: result.reason ?? 'missing-completion' };
    }
    if (isDesktopAuthCompletion(result.completion)) {
      return {
        ok: true,
        completion: result.completion,
      };
    }
    return { ok: false, reason: 'invalid-completion' };
  }

  if (api) {
    reportMissingBridgeMethod('consumeDesktopAuthCompletion');
  }

  return { ok: false, reason: 'desktop-auth-completion-bridge-unavailable' };
}

export interface DesktopNavState {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly goBack: () => void;
  readonly goForward: () => void;
}

export interface DesktopDictationStatus {
  readonly ok: boolean;
  readonly nativeAvailable: boolean;
  readonly webSpeechFallbackAllowed: boolean;
  readonly mode: 'native' | 'web-speech' | 'unavailable';
  readonly reason?: string;
}

const DESKTOP_DICTATION_UNAVAILABLE: DesktopDictationStatus = {
  ok: false,
  nativeAvailable: false,
  webSpeechFallbackAllowed: false,
  mode: 'unavailable',
  reason: 'desktop-dictation-bridge-unavailable',
};

function isDesktopDictationMode(
  value: unknown
): value is DesktopDictationStatus['mode'] {
  return (
    value === 'native' || value === 'web-speech' || value === 'unavailable'
  );
}

function isDesktopDictationStatus(
  value: unknown
): value is DesktopDictationStatus {
  if (value === null || typeof value !== 'object') return false;
  const status = value as Partial<DesktopDictationStatus>;
  return (
    typeof status.ok === 'boolean' &&
    typeof status.nativeAvailable === 'boolean' &&
    typeof status.webSpeechFallbackAllowed === 'boolean' &&
    isDesktopDictationMode(status.mode) &&
    (status.reason === undefined || typeof status.reason === 'string')
  );
}

/**
 * useDesktopNavigation — subscribes to Electron webContents nav-state IPC.
 *
 * Returns `canGoBack: false, canGoForward: false` in browser contexts or when
 * the bridge is partial/stale. Never throws.
 */
export function useDesktopNavigation(): DesktopNavState {
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;
    return api.onNavStateChanged(({ canGoBack: back, canGoForward: fwd }) => {
      setCanGoBack(back);
      setCanGoForward(fwd);
    });
  }, []);

  return {
    canGoBack,
    canGoForward,
    goBack: () => {
      void getElectronAPI()?.goBack();
    },
    goForward: () => {
      void getElectronAPI()?.goForward();
    },
  };
}

async function safeGetDictationStatus(): Promise<DesktopDictationStatus> {
  const api = getRawElectronAPI();
  if (!api) {
    return {
      ok: true,
      nativeAvailable: false,
      webSpeechFallbackAllowed: true,
      mode: 'web-speech',
      reason: 'browser-context',
    };
  }

  if (typeof api.getDictationStatus !== 'function') {
    reportMissingBridgeMethod('getDictationStatus');
    return DESKTOP_DICTATION_UNAVAILABLE;
  }

  try {
    const status = await api.getDictationStatus();
    if (isDesktopDictationStatus(status)) return status;

    void captureWarning(
      'getDictationStatus returned invalid payload',
      'Renderer expected a DesktopDictationStatus payload from the Electron bridge.',
      {
        route: 'desktop/electron-bridge',
        bridgeMethod: 'getDictationStatus',
      }
    );
    return DESKTOP_DICTATION_UNAVAILABLE;
  } catch (error) {
    void captureWarning('getDictationStatus threw', error, {
      route: 'desktop/electron-bridge',
      bridgeMethod: 'getDictationStatus',
    });
    return DESKTOP_DICTATION_UNAVAILABLE;
  }
}

export function useDesktopDictationStatus(): DesktopDictationStatus {
  const [status, setStatus] = useState<DesktopDictationStatus>(() => {
    if (!isElectronRuntime()) {
      return {
        ok: true,
        nativeAvailable: false,
        webSpeechFallbackAllowed: true,
        mode: 'web-speech',
        reason: 'browser-context',
      };
    }
    return DESKTOP_DICTATION_UNAVAILABLE;
  });

  useEffect(() => {
    let isActive = true;
    void safeGetDictationStatus().then(nextStatus => {
      if (isActive) setStatus(nextStatus);
    });
    return () => {
      isActive = false;
    };
  }, []);

  return status;
}

// Exported for tests only — do not call directly from product code.
export const __testing = {
  reset: () => reportedMissing.clear(),
  safeInstallUpdateAndRestart,
  safeGetDictationStatus,
  safeOnUpdateAvailable,
  safeOnUpdateDownloaded,
  startDesktopAuthHandoff,
  openDesktopAuthUrl,
  closeDesktopAuthWindow,
  consumeDesktopAuthCompletion,
  RELEASE_DOWNLOAD_URL,
};

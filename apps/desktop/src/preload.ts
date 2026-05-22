import { contextBridge, ipcRenderer } from 'electron';
import { APP_URL } from './env';

const TRUSTED_APP_ORIGINS = new Set([
  new URL(APP_URL).origin,
  'https://jov.ie',
  'https://staging.app.jov.ie',
]);
const UPDATE_AVAILABLE_CHANNEL = 'update-available';
const UPDATE_DOWNLOADED_CHANNEL = 'update-downloaded';
const QUIT_AND_INSTALL_CHANNEL = 'quit-and-install';
const GO_BACK_CHANNEL = 'go-back';
const GO_FORWARD_CHANNEL = 'go-forward';
const NAV_STATE_CHANNEL = 'nav-state-changed';
const START_DESKTOP_AUTH_HANDOFF_CHANNEL = 'start-desktop-auth-handoff';
const OPEN_DESKTOP_AUTH_URL_CHANNEL = 'open-desktop-auth-url';
const CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL = 'close-desktop-auth-window';
const DICTATION_STATUS_CHANNEL = 'dictation-status';

interface MinimalDocument {
  readonly documentElement?: {
    readonly dataset: Record<string, string | undefined>;
  };
  addEventListener?: (
    type: 'DOMContentLoaded',
    listener: () => void,
    options?: { once: boolean }
  ) => void;
}

interface MinimalLocation {
  readonly origin?: unknown;
}

function getCurrentOrigin(): string | null {
  const maybeLocation = (globalThis as { location?: MinimalLocation }).location;
  const origin = maybeLocation?.origin;
  return typeof origin === 'string' ? origin : null;
}

function isTrustedAppOrigin(): boolean {
  return TRUSTED_APP_ORIGINS.has(getCurrentOrigin() ?? '');
}

function markElectronRuntime(): boolean {
  const maybeDocument = (globalThis as { document?: MinimalDocument }).document;
  const root = maybeDocument?.documentElement;
  if (!root) return false;

  root.dataset.desktopRuntime = 'electron';
  root.dataset.electronPlatform = process.platform;
  return true;
}

function installElectronRuntimeMarker(): void {
  if (markElectronRuntime()) return;

  const maybeDocument = (globalThis as { document?: MinimalDocument }).document;
  maybeDocument?.addEventListener?.('DOMContentLoaded', markElectronRuntime, {
    once: true,
  });
}

type UpdateChannel =
  | typeof UPDATE_AVAILABLE_CHANNEL
  | typeof UPDATE_DOWNLOADED_CHANNEL;

function onUpdateChannel(channel: UpdateChannel, cb: () => void): () => void {
  if (typeof cb !== 'function') return () => undefined;

  const listener = () => cb();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

if (isTrustedAppOrigin()) {
  installElectronRuntimeMarker();

  contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    electronVersion: process.versions.electron,

    /** Fires when electron-updater detects a new version is available for download. */
    onUpdateAvailable: (cb: () => void) => {
      return onUpdateChannel(UPDATE_AVAILABLE_CHANNEL, cb);
    },

    /** Fires when the update has been fully downloaded and is ready to install. */
    onUpdateDownloaded: (cb: () => void) => {
      return onUpdateChannel(UPDATE_DOWNLOADED_CHANNEL, cb);
    },

    /** Quits the app and installs the downloaded update. */
    installUpdateAndRestart: () => {
      return ipcRenderer.invoke(QUIT_AND_INSTALL_CHANNEL) as Promise<{
        ok: boolean;
        reason?: string;
      }>;
    },

    /** Navigate back in the SPA history stack. */
    goBack: () => {
      return ipcRenderer.invoke(GO_BACK_CHANNEL);
    },

    /** Navigate forward in the SPA history stack. */
    goForward: () => {
      return ipcRenderer.invoke(GO_FORWARD_CHANNEL);
    },

    /** Subscribe to nav-state changes (canGoBack / canGoForward). */
    onNavStateChanged: (
      cb: (state: { canGoBack: boolean; canGoForward: boolean }) => void
    ): (() => void) => {
      const listener = (
        _: unknown,
        state: { canGoBack: boolean; canGoForward: boolean }
      ) => cb(state);
      ipcRenderer.on(NAV_STATE_CHANNEL, listener);
      return () => ipcRenderer.removeListener(NAV_STATE_CHANNEL, listener);
    },

    /** Ask the main process to show the dedicated desktop auth handoff window. */
    startDesktopAuthHandoff: (authUrl: string) => {
      return ipcRenderer.invoke(
        START_DESKTOP_AUTH_HANDOFF_CHANNEL,
        authUrl
      ) as Promise<{ ok: boolean; reason?: string }>;
    },

    /** Open auth in the system browser from the dedicated handoff page. */
    openDesktopAuthUrl: (authUrl: string) => {
      return ipcRenderer.invoke(
        OPEN_DESKTOP_AUTH_URL_CHANNEL,
        authUrl
      ) as Promise<{
        ok: boolean;
        reason?: string;
      }>;
    },

    /** Close the dedicated handoff window without exposing window controls. */
    closeDesktopAuthWindow: () => {
      return ipcRenderer.invoke(
        CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL
      ) as Promise<{
        ok: boolean;
        reason?: string;
      }>;
    },

    /** Probe desktop dictation support without exposing node/native APIs. */
    getDictationStatus: () => {
      return ipcRenderer.invoke(DICTATION_STATUS_CHANNEL);
    },
  });
}

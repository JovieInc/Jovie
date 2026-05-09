import { contextBridge, ipcRenderer } from 'electron';

const TRUSTED_APP_ORIGINS = new Set([
  'https://jov.ie',
  'https://staging.app.jov.ie',
]);
const UPDATE_AVAILABLE_CHANNEL = 'update-available';
const UPDATE_DOWNLOADED_CHANNEL = 'update-downloaded';
const QUIT_AND_INSTALL_CHANNEL = 'quit-and-install';

interface MinimalDocument {
  readonly documentElement?: {
    readonly dataset: Record<string, string | undefined>;
  };
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

function markElectronRuntime(): void {
  const maybeDocument = (globalThis as { document?: MinimalDocument }).document;
  const root = maybeDocument?.documentElement;
  if (!root) return;

  root.dataset.desktopRuntime = 'electron';
  root.dataset.electronPlatform = process.platform;
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
  markElectronRuntime();

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
  });
}

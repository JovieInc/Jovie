import { contextBridge, ipcRenderer } from 'electron';
import { createSessionWorkReporter } from './session-work-state';

// Scoped to this document's isolated world; full navigation cannot inherit idle.
const sessionWorkReporter = createSessionWorkReporter();
const WORK_STATE_CHANGED_CHANNEL = 'desktop-work-state-changed';

const UPDATE_AVAILABLE_CHANNEL = 'update-available';
const UPDATE_DOWNLOADED_CHANNEL = 'update-downloaded';
const QUIT_AND_INSTALL_CHANNEL = 'quit-and-install';
const GO_BACK_CHANNEL = 'go-back';
const GO_FORWARD_CHANNEL = 'go-forward';
const NAV_STATE_CHANNEL = 'nav-state-changed';
const CLIENT_NAVIGATION_CHANNEL = 'desktop-client-navigation';
const CLIENT_NAVIGATION_READY_CHANNEL = 'desktop-client-navigation-ready';
const START_DESKTOP_AUTH_HANDOFF_CHANNEL = 'start-desktop-auth-handoff';
const OPEN_DESKTOP_AUTH_URL_CHANNEL = 'open-desktop-auth-url';
const OPEN_CURRENT_OVIE_IN_BROWSER_CHANNEL = 'open-current-ovie-in-browser';
const COPY_DESKTOP_AUTH_URL_CHANNEL = 'copy-desktop-auth-url';
const OPEN_PUBLIC_PROFILE_IN_BROWSER_CHANNEL = 'open-public-profile-in-browser';
const CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL = 'close-desktop-auth-window';
const REDEEM_DESKTOP_AUTH_RETURN_CODE_CHANNEL =
  'redeem-desktop-auth-return-code';
const GET_DESKTOP_PASSKEY_STATE_CHANNEL = 'get-desktop-passkey-state';
const SET_DESKTOP_PASSKEY_STATE_CHANNEL = 'set-desktop-passkey-state';
const COMPLETE_DESKTOP_PASSKEY_SIGN_IN_CHANNEL =
  'complete-desktop-passkey-sign-in';
const CONSUME_DESKTOP_AUTH_COMPLETION_CHANNEL =
  'consume-desktop-auth-completion';
const DICTATION_STATUS_CHANNEL = 'dictation-status';
const TRAY_SET_STATE_CHANNEL = 'tray-set-state';
const TRAY_ACTION_CHANNEL = 'tray-action';
const DESKTOP_NOTIFICATION_CHANNEL = 'desktop-notification-show';
const APP_BOOTED_CHANNEL = 'app-booted';
const DESKTOP_COMPOSER_READINESS_CHANNEL = 'desktop-composer-readiness';
const LAUNCH_OPERATOR_CONTROL_CHANNEL = 'launch-operator-control';
const GET_BUILD_IDENTITY_CHANNEL = 'get-build-identity';
const GET_VISUAL_ACTIVITY_CHANNEL = 'desktop-get-visual-activity';
const VISUAL_ACTIVITY_CHANNEL = 'desktop-visual-activity';
const DESKTOP_UPDATE_STATE_CHANNEL = 'desktop-update-state';
const DESKTOP_UPDATE_GET_STATE_CHANNEL = 'desktop-update-get-state';
const DESKTOP_UPDATE_CHECK_CHANNEL = 'desktop-update-check';
const DESKTOP_UPDATE_DOWNLOAD_CHANNEL = 'desktop-update-download';
const DESKTOP_UPDATE_INSTALL_CHANNEL = 'desktop-update-install';

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

installElectronRuntimeMarker();

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  getBuildIdentity: () => ipcRenderer.invoke(GET_BUILD_IDENTITY_CHANNEL),
  setWorkState: (state: unknown) => {
    sessionWorkReporter.report(state);
    // Revoke any in-flight main-process idle decision, never assert safety.
    ipcRenderer.send(WORK_STATE_CHANGED_CHANNEL);
  },
  getWorkState: () => sessionWorkReporter.read(),
  getVisualActivity: () => ipcRenderer.invoke(GET_VISUAL_ACTIVITY_CHANNEL),
  onVisualActivity: (callback: (active: boolean) => void) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event: unknown, active: unknown) => {
      if (typeof active === 'boolean') callback(active);
    };
    ipcRenderer.on(VISUAL_ACTIVITY_CHANNEL, listener);
    return () => ipcRenderer.removeListener(VISUAL_ACTIVITY_CHANNEL, listener);
  },

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

  /** Announce readiness only while a client-router listener is installed. */
  onNavigate: (cb: (path: string) => void): (() => void) => {
    if (typeof cb !== 'function') return () => undefined;
    const listener = (_: unknown, path: unknown) => {
      if (typeof path === 'string') cb(path);
    };
    ipcRenderer.on(CLIENT_NAVIGATION_CHANNEL, listener);
    ipcRenderer.send(CLIENT_NAVIGATION_READY_CHANNEL, true);
    return () => {
      ipcRenderer.removeListener(CLIENT_NAVIGATION_CHANNEL, listener);
      ipcRenderer.send(CLIENT_NAVIGATION_READY_CHANNEL, false);
    };
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

  /** Copy a main-process-validated auth URL after an explicit user action. */
  copyDesktopAuthUrl: (authUrl: string) => {
    return ipcRenderer.invoke(
      COPY_DESKTOP_AUTH_URL_CHANNEL,
      authUrl
    ) as Promise<{
      ok: boolean;
      reason?: string;
    }>;
  },

  /** Continue the current Ovie route in an independent browser session. */
  openCurrentOvieInBrowser: () =>
    ipcRenderer.invoke(OPEN_CURRENT_OVIE_IN_BROWSER_CHANNEL) as Promise<{
      ok: boolean;
      reason?: string;
    }>,

  /** Open this isolated public profile in the system browser. */
  openPublicProfileInBrowser: () => {
    return ipcRenderer.invoke(
      OPEN_PUBLIC_PROFILE_IN_BROWSER_CHANNEL
    ) as Promise<{ ok: boolean; reason?: string }>;
  },

  /** Close the dedicated handoff window without exposing window controls. */
  redeemDesktopAuthReturnCode: (returnCode: string) => {
    return ipcRenderer.invoke(
      REDEEM_DESKTOP_AUTH_RETURN_CODE_CHANNEL,
      returnCode
    ) as Promise<{
      ok: boolean;
      reason?: string;
    }>;
  },
  getDesktopPasskeyState: () => {
    return ipcRenderer.invoke(GET_DESKTOP_PASSKEY_STATE_CHANNEL) as Promise<{
      available: boolean;
      enrolled: boolean;
      dismissed: boolean;
    }>;
  },
  setDesktopPasskeyState: (update: 'enrolled' | 'dismissed' | 'reset') => {
    return ipcRenderer.invoke(SET_DESKTOP_PASSKEY_STATE_CHANNEL, update) as Promise<{
      ok: boolean;
      reason?: string;
    }>;
  },
  completeDesktopPasskeySignIn: () => {
    return ipcRenderer.invoke(
      COMPLETE_DESKTOP_PASSKEY_SIGN_IN_CHANNEL
    ) as Promise<{
      ok: boolean;
      reason?: string;
    }>;
  },
  closeDesktopAuthWindow: () => {
    return ipcRenderer.invoke(CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL) as Promise<{
      ok: boolean;
      reason?: string;
    }>;
  },

  /** Consume the one-time desktop auth completion payload after deep-link return. */
  consumeDesktopAuthCompletion: () => {
    return ipcRenderer.invoke(
      CONSUME_DESKTOP_AUTH_COMPLETION_CHANNEL
    ) as Promise<{
      ok: boolean;
      reason?: string;
      completion?: {
        code: string;
        state: string;
        codeVerifier: string;
      };
    }>;
  },

  /** Probe desktop dictation support without exposing node/native APIs. */
  getDictationStatus: () => {
    return ipcRenderer.invoke(DICTATION_STATUS_CHANNEL);
  },

  /**
   * Push the current app state to the macOS menu bar extra.
   * No-op on non-macOS or when the main process tray is unavailable.
   */
  setTrayState: (payload: { state: string; unreadCount?: number }) => {
    return ipcRenderer.invoke(TRAY_SET_STATE_CHANNEL, payload) as Promise<{
      ok: boolean;
      reason?: string;
    }>;
  },

  /**
   * Subscribe to tray quick-action events (e.g. "new-message") fired by the
   * main process when the user clicks a menu bar context-menu item.
   */
  onTrayAction: (cb: (action: string) => void): (() => void) => {
    if (typeof cb !== 'function') return () => undefined;
    const listener = (_: unknown, action: string) => cb(action);
    ipcRenderer.on(TRAY_ACTION_CHANNEL, listener);
    return () => ipcRenderer.removeListener(TRAY_ACTION_CHANNEL, listener);
  },

  /**
   * Post a native OS notification (JOV-6716). The main process validates the
   * payload and, on click, routes `url` through the same URL disposition rules
   * as in-app navigation — deep links land on the right screen, unsafe URLs
   * just focus the window.
   */
  showNotification: (payload: {
    title: string;
    body?: string;
    url?: string;
  }) =>
    ipcRenderer.invoke(DESKTOP_NOTIFICATION_CHANNEL, payload) as Promise<{
      ok: boolean;
      reason?: string;
    }>,

  notifyComposerReadiness: (phase: 'visible-editable' | 'focused') => {
    if (phase !== 'visible-editable' && phase !== 'focused')
      return Promise.resolve(false);
    return ipcRenderer.invoke(
      DESKTOP_COMPOSER_READINESS_CHANNEL,
      phase
    ) as Promise<boolean>;
  },

  /**
   * First successful hosted-app paint (JOV-3595). Cancels the main-process
   * boot watchdog so a 200-but-never-interactive load surfaces recovery UI
   * instead of a permanent black window. Fire-and-forget (send, not invoke).
   */
  notifyAppBooted: () => {
    ipcRenderer.send(APP_BOOTED_CHANNEL);
  },

  launchOperatorControl: (request: {
    id: string;
    kind: 'web' | 'ssh';
    href?: string;
    sshHost?: string;
  }) =>
    ipcRenderer.invoke(LAUNCH_OPERATOR_CONTROL_CHANNEL, request) as Promise<{
      ok: boolean;
      reason?: string;
    }>,
});

// Typed updater surface (JOV-6683). Separate namespace so a stale binary
// leaves `window.jovieDesktop` undefined and the renderer renders nothing.
contextBridge.exposeInMainWorld('jovieDesktop', {
  updates: {
    getState: () => ipcRenderer.invoke(DESKTOP_UPDATE_GET_STATE_CHANNEL),
    check: () => ipcRenderer.invoke(DESKTOP_UPDATE_CHECK_CHANNEL),
    download: () => ipcRenderer.invoke(DESKTOP_UPDATE_DOWNLOAD_CHANNEL),
    install: () => ipcRenderer.invoke(DESKTOP_UPDATE_INSTALL_CHANNEL),
    onState: (cb: (phase: unknown) => void): (() => void) => {
      if (typeof cb !== 'function') return () => undefined;
      const listener = (_: unknown, phase: unknown) => cb(phase);
      ipcRenderer.on(DESKTOP_UPDATE_STATE_CHANNEL, listener);
      return () =>
        ipcRenderer.removeListener(DESKTOP_UPDATE_STATE_CHANNEL, listener);
    },
  },
});

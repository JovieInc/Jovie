import {
  isChromiumErrorDocument,
  isLocalDevSiblingOrigin,
  shouldRecoverAuthHandoffToCanonicalShell,
} from './renderer-recovery';

/** Marker embedded in the packaged load-failure data URL. */
export const DESKTOP_LOAD_FAILURE_DOCUMENT_MARKER =
  'data-desktop-recovery="load-failure"';

export function isDesktopLoadFailureDocument(url: string): boolean {
  if (!url.startsWith('data:text/html')) return false;
  try {
    const comma = url.indexOf(',');
    if (comma < 0) return false;
    const payload = decodeURIComponent(url.slice(comma + 1));
    return payload.includes(DESKTOP_LOAD_FAILURE_DOCUMENT_MARKER);
  } catch {
    return url.includes('data-desktop-recovery');
  }
}

export function isDesktopBootSplashDocument(url: string): boolean {
  if (!url.startsWith('data:text/html')) return false;
  try {
    const comma = url.indexOf(',');
    if (comma < 0) return false;
    const payload = decodeURIComponent(url.slice(comma + 1));
    return payload.includes('data-desktop-splash="cinematic"');
  } catch {
    return url.includes('data-desktop-splash');
  }
}

export type WakeRendererRecoveryAction =
  | 'ignore'
  | 'reload-hosted'
  | 'begin-unlatch';

/**
 * After sleep/wake, Chromium can leave a blank, chrome-error, or failure
 * surface without firing a new navigation. Update checks alone do not heal
 * that — recover to a Retry shell or reload the last hosted entry.
 */
export function decideWakeRendererRecovery(input: {
  readonly windowDestroyed: boolean;
  readonly currentUrl: string;
  readonly rendererBooted: boolean;
  readonly rendererCrashed: boolean;
  readonly appOrigin: string;
}): WakeRendererRecoveryAction {
  if (input.windowDestroyed) return 'ignore';
  if (input.rendererCrashed) return 'reload-hosted';

  const url = input.currentUrl;
  if (isDesktopLoadFailureDocument(url)) return 'begin-unlatch';
  if (isChromiumErrorDocument(url)) return 'reload-hosted';
  if (shouldRecoverAuthHandoffToCanonicalShell(url)) return 'reload-hosted';
  if (isDesktopBootSplashDocument(url)) return 'reload-hosted';

  if (input.rendererBooted) return 'ignore';

  try {
    const parsed = new URL(url);
    if (
      parsed.origin === input.appOrigin ||
      isLocalDevSiblingOrigin(url, input.appOrigin)
    ) {
      // Hosted document is visible but this generation never painted — a hung
      // load that outlived sleep, or a recovery reload that never sent
      // app-booted. Reload instead of trusting a dead canvas.
      return 'reload-hosted';
    }
  } catch {
    // Invalid URL — leave existing watchdogs / handlers alone.
  }

  return 'ignore';
}

interface PowerWakeEvents {
  on(event: 'resume' | 'unlock-screen', listener: () => void): unknown;
}

/** Bind resume/unlock to one recovery callback (JOV-14765). */
export function scheduleWakeRendererRecovery(input: {
  readonly powerMonitor: PowerWakeEvents;
  readonly recover: () => void;
}): void {
  const onWake = () => {
    input.recover();
  };
  input.powerMonitor.on('resume', onWake);
  input.powerMonitor.on('unlock-screen', onWake);
}

export function applyWakeRendererRecovery(input: {
  readonly action: WakeRendererRecoveryAction;
  readonly beginUnlatch: () => void;
  readonly reloadHosted: () => void;
}): void {
  if (input.action === 'ignore') return;
  if (input.action === 'begin-unlatch') {
    input.beginUnlatch();
    return;
  }
  input.reloadHosted();
}

export function recoverDesktopWindowAfterWake(input: {
  readonly isAuthHandoffInteractive: () => boolean;
  readonly getMainWindow: () => {
    readonly isDestroyed: () => boolean;
    readonly webContents: { readonly id: number };
  } | null;
  readonly getController: (
    id: number
  ) => { readonly recoverAfterWake: () => void } | undefined;
}): void {
  if (input.isAuthHandoffInteractive()) return;
  const win = input.getMainWindow();
  if (!win || win.isDestroyed()) return;
  input.getController(win.webContents.id)?.recoverAfterWake();
}

export function createRecoverAfterWake(input: {
  readonly isDestroyed: () => boolean;
  readonly getCurrentUrl: () => string;
  readonly isRendererBooted: () => boolean;
  readonly isRendererCrashed: () => boolean;
  readonly appOrigin: string;
  readonly beginUnlatch: () => void;
  readonly reloadHosted: () => void;
}): () => void {
  return () => {
    if (input.isDestroyed()) return;
    applyWakeRendererRecovery({
      action: decideWakeRendererRecovery({
        windowDestroyed: input.isDestroyed(),
        currentUrl: input.getCurrentUrl(),
        rendererBooted: input.isRendererBooted(),
        rendererCrashed: input.isRendererCrashed(),
        appOrigin: input.appOrigin,
      }),
      beginUnlatch: input.beginUnlatch,
      reloadHosted: input.reloadHosted,
    });
  };
}

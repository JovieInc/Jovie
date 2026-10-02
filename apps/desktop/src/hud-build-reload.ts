export interface HudBuildInfo {
  readonly buildId?: unknown;
  readonly commitSha?: unknown;
}

export interface HudBuildReloadDecision {
  readonly nextFingerprint: string | null;
  readonly shouldReload: boolean;
}

const INVALID_BUILD_IDS = new Set(['unknown', 'development']);

function normalizedNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getHudBuildFingerprint(buildInfo: unknown): string | null {
  if (buildInfo === null || typeof buildInfo !== 'object') return null;

  const record = buildInfo as HudBuildInfo;
  const commitSha = normalizedNonEmptyString(record.commitSha);
  if (commitSha) return `sha:${commitSha}`;

  const buildId = normalizedNonEmptyString(record.buildId);
  if (!buildId || INVALID_BUILD_IDS.has(buildId)) {
    return null;
  }

  return `build:${buildId}`;
}

export function decideHudBuildReload(input: {
  readonly currentFingerprint: string | null;
  readonly nextFingerprint: string | null;
}): HudBuildReloadDecision {
  if (!input.nextFingerprint) {
    return {
      nextFingerprint: input.currentFingerprint,
      shouldReload: false,
    };
  }

  if (!input.currentFingerprint) {
    return {
      nextFingerprint: input.nextFingerprint,
      shouldReload: false,
    };
  }

  return {
    nextFingerprint: input.nextFingerprint,
    shouldReload: input.nextFingerprint !== input.currentFingerprint,
  };
}

export function isHudRoutePath(pathname: string): boolean {
  return pathname === '/hud' || pathname.startsWith('/hud/');
}

/**
 * Hosted surfaces that pick up a new web deploy by reloading in place. The
 * Ovie door opens the OV shell under /app (PR #18574), so /hud alone left the
 * Mac app pinned to whichever web build it first loaded.
 */
export function isWebBuildReloadPath(pathname: string): boolean {
  return (
    isHudRoutePath(pathname) ||
    pathname === '/app' ||
    pathname.startsWith('/app/')
  );
}

/** Keyboard/mouse idle time before a visible app window may reload. */
export const WEB_BUILD_RELOAD_IDLE_SECONDS = 10 * 60;

export interface WebBuildReloadWindowState {
  readonly isHud: boolean;
  readonly visible: boolean;
  readonly focused: boolean;
  readonly audible: boolean;
  readonly hasUnsentInput: boolean;
  readonly workStateSafe: boolean;
  readonly systemIdleSeconds: number;
}

/**
 * Every surface requires fresh idle work evidence. Eligible HUD/hidden windows
 * can then reload immediately; visible app windows require sustained idle.
 * Routes without a work owner stay unknown and cannot reload unattended.
 */
export function shouldReloadWindowForWebBuild(
  input: WebBuildReloadWindowState
): boolean {
  if (!input.workStateSafe || input.audible || input.hasUnsentInput) return false;
  if (input.isHud || !input.visible) return true;
  return (
    !input.focused && input.systemIdleSeconds >= WEB_BUILD_RELOAD_IDLE_SECONDS
  );
}

/**
 * Renderer probe: true when a composer (textarea or contenteditable) holds
 * text. Reloading or restarting would silently drop it.
 */
export const UNSENT_INPUT_PROBE = `(() => {
  const fields = document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]');
  return Array.from(fields).some(field => {
    const text = typeof field.value === 'string' ? field.value : field.textContent;
    return typeof text === 'string' && text.trim().length > 0;
  });
})()`;

/** Read typed work and draft evidence in the same renderer turn. */
export const SESSION_WORK_PROBE = `(() => ({
  snapshot: globalThis.electronAPI?.getWorkState?.() ?? null,
  hasUnsentInput: ${UNSENT_INPUT_PROBE}
}))()`;

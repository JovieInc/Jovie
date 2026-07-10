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
  return (
    pathname === '/hud' ||
    pathname.startsWith('/hud/') ||
    pathname === '/hud-tv' ||
    pathname.startsWith('/hud-tv/') ||
    pathname === '/app/admin/ops' ||
    pathname.startsWith('/app/admin/ops/')
  );
}

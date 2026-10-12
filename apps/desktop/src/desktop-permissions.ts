import type { WebContents } from 'electron';

export function isTrustedPermissionOrigin(
  urlString: string | undefined,
  parseUrl: (value: string) => URL | null,
  appOrigin: string
): boolean {
  const parsed = parseUrl(urlString ?? '');
  return parsed?.origin === appOrigin;
}

export function isTrustedPermissionRequest(
  webContents: WebContents | null,
  requestingOrigin: string | undefined,
  parseUrl: (value: string) => URL | null,
  appOrigin: string
): boolean {
  if (requestingOrigin !== undefined) {
    return isTrustedPermissionOrigin(requestingOrigin, parseUrl, appOrigin);
  }

  return (
    webContents !== null &&
    isTrustedPermissionOrigin(webContents.getURL(), parseUrl, appOrigin)
  );
}

export function isAudioOnlyMediaPermissionRequest(details: unknown): boolean {
  if (details === null || typeof details !== 'object') return false;
  const mediaTypes = (details as { mediaTypes?: unknown }).mediaTypes;
  return (
    Array.isArray(mediaTypes) &&
    mediaTypes.includes('audio') &&
    !mediaTypes.includes('video')
  );
}

export function isAudioMediaPermissionCheck(details: unknown): boolean {
  if (details === null || typeof details !== 'object') return false;
  return (details as { mediaType?: unknown }).mediaType === 'audio';
}

/** Screen capture starts on Ovie. Add `/app` here when user screen video ships. */
export const DESKTOP_CAPTURE_ROUTE_PREFIXES = ['/hud'] as const;

export function isDesktopCaptureRouteUrl(
  urlString: string | undefined,
  parseUrl: (value: string) => URL | null
): boolean {
  const parsed = parseUrl(urlString ?? '');
  if (!parsed) return false;
  return DESKTOP_CAPTURE_ROUTE_PREFIXES.some(
    prefix =>
      parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
  );
}

export function isDisplayCapturePermission(permission: string): boolean {
  return permission === 'display-capture' || permission === 'displayCapture';
}

export function isScreenMediaPermissionRequest(details: unknown): boolean {
  if (details === null || typeof details !== 'object') return false;
  const mediaTypes = (details as { mediaTypes?: unknown }).mediaTypes;
  return Array.isArray(mediaTypes) && mediaTypes.includes('video');
}

export function isScreenMediaPermissionCheck(details: unknown): boolean {
  if (details === null || typeof details !== 'object') return false;
  return (details as { mediaType?: unknown }).mediaType === 'video';
}

/** Display capture reaches Electron's media permission with an empty device list.
 * Legacy desktop capture has the same shape; this grants the HUD principal,
 * not proof that arbitrary HUD scripts use the system picker.
 */
function isDesktopMediaRequest(details: unknown): boolean {
  if (details === null || typeof details !== 'object') return false;
  const mediaTypes = (details as { mediaTypes?: unknown }).mediaTypes;
  return Array.isArray(mediaTypes) && mediaTypes.length === 0;
}

function isCurrentHudDocument(input: {
  readonly details: unknown;
  readonly webContents: WebContents | null;
  readonly requestingOrigin?: string;
  readonly parseUrl: (value: string) => URL | null;
  readonly appOrigin: string;
}): boolean {
  const { details, webContents, parseUrl, appOrigin } = input;
  if (
    !webContents ||
    webContents.isDestroyed() ||
    !details ||
    typeof details !== 'object'
  )
    return false;
  const request = details as {
    requestingUrl?: unknown;
    isMainFrame?: unknown;
    securityOrigin?: unknown;
  };
  if (request.isMainFrame !== true || typeof request.requestingUrl !== 'string')
    return false;
  const url = parseUrl(request.requestingUrl);
  if (
    !url ||
    url.origin !== appOrigin ||
    !isDesktopCaptureRouteUrl(url.href, parseUrl)
  )
    return false;
  if (parseUrl(webContents.getURL())?.href !== url.href) return false;
  if (
    input.requestingOrigin !== undefined &&
    !isTrustedPermissionOrigin(input.requestingOrigin, parseUrl, appOrigin)
  )
    return false;
  return (
    request.securityOrigin === undefined ||
    (typeof request.securityOrigin === 'string' &&
      isTrustedPermissionOrigin(request.securityOrigin, parseUrl, appOrigin))
  );
}

export function shouldGrantTrustedHudScreenPermission(input: {
  readonly permission: string;
  readonly details: unknown;
  readonly webContents: WebContents | null;
  readonly requestingOrigin?: string;
  readonly parseUrl: (value: string) => URL | null;
  readonly appOrigin: string;
}): boolean {
  if (!isCurrentHudDocument(input)) return false;

  if (isDisplayCapturePermission(input.permission)) {
    return true;
  }

  return (
    input.permission === 'media' &&
    (isScreenMediaPermissionRequest(input.details) ||
      isDesktopMediaRequest(input.details))
  );
}

export function shouldGrantTrustedHudScreenPermissionCheck(input: {
  readonly permission: string;
  readonly details: unknown;
  readonly webContents: WebContents | null;
  readonly requestingOrigin: string;
  readonly parseUrl: (value: string) => URL | null;
  readonly appOrigin: string;
}): boolean {
  if (!isCurrentHudDocument(input)) return false;
  if (isDisplayCapturePermission(input.permission)) {
    return true;
  }
  return (
    input.permission === 'media' && isScreenMediaPermissionCheck(input.details)
  );
}

export function shouldGrantTrustedAudioPermission(input: {
  readonly permission: string;
  readonly details: unknown;
  readonly webContents: WebContents | null;
  readonly requestingOrigin?: string;
  readonly parseUrl: (value: string) => URL | null;
  readonly appOrigin: string;
}): boolean {
  return (
    input.permission === 'media' &&
    isAudioOnlyMediaPermissionRequest(input.details) &&
    isTrustedPermissionRequest(
      input.webContents,
      input.requestingOrigin,
      input.parseUrl,
      input.appOrigin
    )
  );
}

export function shouldGrantTrustedAudioPermissionCheck(input: {
  readonly permission: string;
  readonly details: unknown;
  readonly webContents: WebContents | null;
  readonly requestingOrigin: string;
  readonly parseUrl: (value: string) => URL | null;
  readonly appOrigin: string;
}): boolean {
  if (input.permission !== 'media') return false;
  if (!isAudioMediaPermissionCheck(input.details)) return false;
  return isTrustedPermissionRequest(
    input.webContents,
    input.requestingOrigin,
    input.parseUrl,
    input.appOrigin
  );
}

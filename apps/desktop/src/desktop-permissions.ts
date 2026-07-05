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

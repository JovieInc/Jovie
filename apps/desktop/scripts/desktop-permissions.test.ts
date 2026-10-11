import { expect, test } from 'vitest';
import {
  isAudioMediaPermissionCheck,
  isAudioOnlyMediaPermissionRequest,
  isDesktopCaptureRouteUrl,
  isDisplayCapturePermission,
  isScreenMediaPermissionCheck,
  isScreenMediaPermissionRequest,
  isTrustedPermissionOrigin,
  isTrustedPermissionRequest,
  shouldGrantTrustedAudioPermission,
  shouldGrantTrustedAudioPermissionCheck,
  shouldGrantTrustedHudScreenPermission,
  shouldGrantTrustedHudScreenPermissionCheck,
} from '../src/desktop-permissions.ts';
import { parseUrl } from '../src/navigation.ts';

const APP_ORIGIN = 'https://jov.ie';
const HUD_URL = 'https://jov.ie/hud';
const APP_URL = 'https://jov.ie/app/chat';

const hudContents = { getURL: () => HUD_URL, isDestroyed: () => false };
const appContents = { getURL: () => APP_URL, isDestroyed: () => false };
const foreignContents = { getURL: () => 'https://evil.example/hud' };

test('permission origin is trusted only for the exact app origin', () => {
  expect(isTrustedPermissionOrigin(HUD_URL, parseUrl, APP_ORIGIN)).toBe(true);
  expect(
    isTrustedPermissionOrigin('https://evil.example/hud', parseUrl, APP_ORIGIN)
  ).toBe(false);
  expect(
    isTrustedPermissionOrigin(
      'https://jov.ie.evil.example/hud',
      parseUrl,
      APP_ORIGIN
    )
  ).toBe(false);
  expect(isTrustedPermissionOrigin(undefined, parseUrl, APP_ORIGIN)).toBe(
    false
  );
  expect(isTrustedPermissionOrigin('not a url', parseUrl, APP_ORIGIN)).toBe(
    false
  );
});

test('permission request prefers the explicit requesting origin over the webContents URL', () => {
  expect(
    isTrustedPermissionRequest(
      hudContents as never,
      'https://evil.example',
      parseUrl,
      APP_ORIGIN
    )
  ).toBe(false);
  expect(
    isTrustedPermissionRequest(
      foreignContents as never,
      'https://jov.ie',
      parseUrl,
      APP_ORIGIN
    )
  ).toBe(true);
});

test('permission request falls back to the webContents URL and fails closed on null contents', () => {
  expect(
    isTrustedPermissionRequest(
      hudContents as never,
      undefined,
      parseUrl,
      APP_ORIGIN
    )
  ).toBe(true);
  expect(
    isTrustedPermissionRequest(
      foreignContents as never,
      undefined,
      parseUrl,
      APP_ORIGIN
    )
  ).toBe(false);
  expect(
    isTrustedPermissionRequest(null, undefined, parseUrl, APP_ORIGIN)
  ).toBe(false);
});

test('capture route is limited to the Ovie HUD surface', () => {
  expect(isDesktopCaptureRouteUrl(HUD_URL, parseUrl)).toBe(true);
  expect(isDesktopCaptureRouteUrl('https://jov.ie/hud/ovie', parseUrl)).toBe(
    true
  );
  expect(isDesktopCaptureRouteUrl('https://jov.ie/hudx', parseUrl)).toBe(false);
  expect(isDesktopCaptureRouteUrl(APP_URL, parseUrl)).toBe(false);
  expect(isDesktopCaptureRouteUrl('https://jov.ie/', parseUrl)).toBe(false);
  expect(isDesktopCaptureRouteUrl(undefined, parseUrl)).toBe(false);
});

test('media classifiers distinguish audio-only requests from screen capture', () => {
  expect(isAudioOnlyMediaPermissionRequest({ mediaTypes: ['audio'] })).toBe(
    true
  );
  expect(
    isAudioOnlyMediaPermissionRequest({ mediaTypes: ['audio', 'video'] })
  ).toBe(false);
  expect(isAudioOnlyMediaPermissionRequest({ mediaTypes: ['video'] })).toBe(
    false
  );
  expect(isAudioOnlyMediaPermissionRequest({})).toBe(false);
  expect(isAudioOnlyMediaPermissionRequest(null)).toBe(false);

  expect(isAudioMediaPermissionCheck({ mediaType: 'audio' })).toBe(true);
  expect(isAudioMediaPermissionCheck({ mediaType: 'video' })).toBe(false);
  expect(isAudioMediaPermissionCheck(null)).toBe(false);

  expect(isScreenMediaPermissionRequest({ mediaTypes: ['video'] })).toBe(true);
  expect(
    isScreenMediaPermissionRequest({ mediaTypes: ['audio', 'video'] })
  ).toBe(true);
  expect(isScreenMediaPermissionRequest({ mediaTypes: ['audio'] })).toBe(false);
  expect(isScreenMediaPermissionRequest(null)).toBe(false);

  expect(isScreenMediaPermissionCheck({ mediaType: 'video' })).toBe(true);
  expect(isScreenMediaPermissionCheck({ mediaType: 'audio' })).toBe(false);
  expect(isScreenMediaPermissionCheck(null)).toBe(false);

  expect(isDisplayCapturePermission('display-capture')).toBe(true);
  expect(isDisplayCapturePermission('displayCapture')).toBe(true);
  expect(isDisplayCapturePermission('media')).toBe(false);
});

const hudDetails = {
  requestingUrl: HUD_URL,
  securityOrigin: APP_ORIGIN,
  isMainFrame: true,
};

test('HUD screen permission grants display-capture and screen media on a trusted capture route', () => {
  const request = {
    parseUrl,
    appOrigin: APP_ORIGIN,
    webContents: hudContents as never,
    requestingOrigin: APP_ORIGIN,
  };

  expect(
    shouldGrantTrustedHudScreenPermission({
      ...request,
      permission: 'display-capture',
      details: hudDetails,
    })
  ).toBe(true);
  expect(
    shouldGrantTrustedHudScreenPermission({
      ...request,
      permission: 'media',
      details: { ...hudDetails, mediaTypes: ['video'] },
    })
  ).toBe(true);
  expect(
    shouldGrantTrustedHudScreenPermission({
      ...request,
      permission: 'media',
      details: { ...hudDetails, mediaTypes: ['audio', 'video'] },
    })
  ).toBe(true);
});

test('HUD screen permission denies untrusted origins, non-capture routes, and non-screen media', () => {
  const request = {
    parseUrl,
    appOrigin: APP_ORIGIN,
    webContents: hudContents as never,
    requestingOrigin: APP_ORIGIN,
  };

  expect(
    shouldGrantTrustedHudScreenPermission({
      ...request,
      requestingOrigin: 'https://evil.example/hud',
      permission: 'display-capture',
      details: hudDetails,
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedHudScreenPermission({
      ...request,
      requestingOrigin: APP_ORIGIN,
      permission: 'display-capture',
      details: { ...hudDetails, requestingUrl: APP_URL },
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedHudScreenPermission({
      ...request,
      permission: 'media',
      details: { ...hudDetails, mediaTypes: ['audio'] },
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedHudScreenPermission({
      ...request,
      permission: 'clipboard-read',
      details: hudDetails,
    })
  ).toBe(false);
});

test('HUD screen permission uses explicit document attribution even without the optional requesting origin', () => {
  expect(
    shouldGrantTrustedHudScreenPermission({
      parseUrl,
      appOrigin: APP_ORIGIN,
      webContents: hudContents as never,
      permission: 'display-capture',
      details: hudDetails,
    })
  ).toBe(true);
  expect(
    shouldGrantTrustedHudScreenPermission({
      parseUrl,
      appOrigin: APP_ORIGIN,
      webContents: appContents as never,
      permission: 'display-capture',
      details: hudDetails,
    })
  ).toBe(false);
});

test('permission-check variants apply the same trusted capture-route contract', () => {
  const check = {
    parseUrl,
    appOrigin: APP_ORIGIN,
    webContents: hudContents as never,
    requestingOrigin: APP_ORIGIN,
  };

  expect(
    shouldGrantTrustedHudScreenPermissionCheck({
      ...check,
      permission: 'displayCapture',
      details: hudDetails,
    })
  ).toBe(true);
  expect(
    shouldGrantTrustedHudScreenPermissionCheck({
      ...check,
      permission: 'media',
      details: { ...hudDetails, mediaType: 'video' },
    })
  ).toBe(true);
  expect(
    shouldGrantTrustedHudScreenPermissionCheck({
      ...check,
      permission: 'media',
      details: { ...hudDetails, mediaType: 'audio' },
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedHudScreenPermissionCheck({
      ...check,
      requestingOrigin: APP_ORIGIN,
      permission: 'displayCapture',
      details: { ...hudDetails, requestingUrl: APP_URL },
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedHudScreenPermissionCheck({
      ...check,
      requestingOrigin: 'https://evil.example/hud',
      permission: 'media',
      details: { ...hudDetails, mediaType: 'video' },
    })
  ).toBe(false);
});

test('audio permission grants mic for trusted audio-only media on any app route and nothing else', () => {
  const request = {
    parseUrl,
    appOrigin: APP_ORIGIN,
    webContents: null,
    requestingOrigin: APP_URL,
  };

  expect(
    shouldGrantTrustedAudioPermission({
      ...request,
      permission: 'media',
      details: { mediaTypes: ['audio'] },
    })
  ).toBe(true);
  expect(
    shouldGrantTrustedAudioPermission({
      ...request,
      permission: 'media',
      details: { mediaTypes: ['audio', 'video'] },
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedAudioPermission({
      ...request,
      permission: 'display-capture',
      details: {},
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedAudioPermission({
      ...request,
      requestingOrigin: 'https://evil.example',
      permission: 'media',
      details: { mediaTypes: ['audio'] },
    })
  ).toBe(false);

  const check = { ...request, requestingOrigin: APP_URL };
  expect(
    shouldGrantTrustedAudioPermissionCheck({
      ...check,
      permission: 'media',
      details: { mediaType: 'audio' },
    })
  ).toBe(true);
  expect(
    shouldGrantTrustedAudioPermissionCheck({
      ...check,
      permission: 'media',
      details: { mediaType: 'video' },
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedAudioPermissionCheck({
      ...check,
      requestingOrigin: 'https://evil.example',
      permission: 'media',
      details: { mediaType: 'audio' },
    })
  ).toBe(false);
});

const hudRequest = {
  parseUrl,
  appOrigin: APP_ORIGIN,
  webContents: hudContents as never,
  requestingOrigin: APP_ORIGIN,
};

test('screen admission denies missing, stale, foreign and subframe attribution before native selection', () => {
  for (const overrides of [
    { webContents: null },
    {
      webContents: { getURL: () => HUD_URL, isDestroyed: () => true } as never,
    },
    { webContents: appContents as never },
    { requestingOrigin: 'https://evil.example' },
    { details: { ...hudDetails, requestingUrl: 'https://evil.example/hud' } },
    { details: { ...hudDetails, requestingUrl: APP_URL } },
    { details: { ...hudDetails, requestingUrl: `${HUD_URL}x` } },
    { details: { ...hudDetails, requestingUrl: `${HUD_URL}?old=1` } },
    { details: { ...hudDetails, securityOrigin: 'https://evil.example' } },
    { details: { ...hudDetails, securityOrigin: 42 } },
    { details: { ...hudDetails, isMainFrame: false } },
    { details: { requestingUrl: HUD_URL } },
    { details: { isMainFrame: true } },
    { details: null },
  ]) {
    const input = {
      ...hudRequest,
      permission: 'display-capture',
      details: hudDetails,
      ...overrides,
    };
    expect(shouldGrantTrustedHudScreenPermission(input)).toBe(false);
    expect(shouldGrantTrustedHudScreenPermissionCheck(input)).toBe(false);
  }
});

test('empty-device support does not accept missing or malformed lists or change audio/video classification', () => {
  for (const mediaTypes of [
    undefined,
    null,
    'video',
    {},
    ['audio'],
    ['unknown'],
  ]) {
    expect(
      shouldGrantTrustedHudScreenPermission({
        ...hudRequest,
        permission: 'media',
        details: { ...hudDetails, mediaTypes },
      })
    ).toBe(false);
  }
  expect(
    shouldGrantTrustedHudScreenPermission({
      ...hudRequest,
      permission: 'clipboard-read',
      details: hudDetails,
    })
  ).toBe(false);
  expect(
    shouldGrantTrustedHudScreenPermissionCheck({
      ...hudRequest,
      permission: 'media',
      details: { ...hudDetails, mediaType: 'audio' },
    })
  ).toBe(false);
  expect(isScreenMediaPermissionRequest({ mediaTypes: [] })).toBe(false);
  expect(
    shouldGrantTrustedAudioPermission({
      ...hudRequest,
      permission: 'media',
      details: { ...hudDetails, mediaTypes: [] },
    })
  ).toBe(false);
});

test('empty-device display request is allowed for the current HUD document', () => {
  expect(
    shouldGrantTrustedHudScreenPermission({
      ...hudRequest,
      permission: 'media',
      details: { ...hudDetails, mediaTypes: [] },
    })
  ).toBe(true);
});

import 'server-only';
import { env } from '@/lib/env-server';
import {
  DISPLAY_COOKIE,
  type DisplayDevice,
  parseDisplayDevices,
  readCookie,
  verifyDisplaySession,
} from './session';

export function displayConfig(): {
  readonly devices: DisplayDevice[];
  readonly key: string;
} {
  return {
    devices: parseDisplayDevices(env.OVIE_DISPLAY_DEVICES),
    key: env.OVIE_DISPLAY_SESSION_KEY ?? '',
  };
}

/**
 * True only for a valid read-only display session. Call this from the Home
 * feed GET routes and nowhere else: `display-scope.test.ts` pins the list of
 * importers, so adding a route here is a reviewed change.
 */
export function isDisplayReadRequest(request: Request): boolean {
  const { devices, key } = displayConfig();
  if (devices.length === 0 || !key) return false;
  return (
    verifyDisplaySession({
      token: readCookie(request.headers.get('cookie'), DISPLAY_COOKIE),
      devices,
      key,
      nowMs: Date.now(),
    }) !== null
  );
}

/** Same check for a server component reading `cookies()`. */
export function isDisplayCookieValid(token: string | undefined): boolean {
  const { devices, key } = displayConfig();
  return (
    verifyDisplaySession({ token, devices, key, nowMs: Date.now() }) !== null
  );
}

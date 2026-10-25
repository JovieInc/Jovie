import 'server-only';
import { env } from '@/lib/env-server';
import { getRedis } from '@/lib/redis';
import {
  DISPLAY_COOKIE,
  DISPLAY_PROOF_REPLAY_TTL_SECONDS,
  type DisplayDevice,
  parseDisplayDevices,
  readCookie,
  verifyDisplaySession,
} from './session';

/** Runtime revocation keys (immediate, no redeploy). Values are epoch seconds. */
export const REVOKED_BEFORE_ALL_KEY = 'ovie-display:revoked-before:all';
export const revokedBeforeKey = (deviceId: string) =>
  `ovie-display:revoked-before:${deviceId}`;
export const disabledKey = (deviceId: string) =>
  `ovie-display:disabled:${deviceId}`;
const EXCHANGE_LIMIT_PER_MINUTE = 10;

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
 * Runtime revocation, checked on every display request. Fails closed: if
 * Redis cannot answer, the display is denied (it reads "not authorized"
 * until Redis returns) rather than trusting a possibly revoked session.
 */
export async function displayStillAllowed(
  deviceId: string,
  iat: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const [all, device, disabled] = await Promise.all([
      redis.get<number | string | null>(REVOKED_BEFORE_ALL_KEY),
      redis.get<number | string | null>(revokedBeforeKey(deviceId)),
      redis.get<number | string | null>(disabledKey(deviceId)),
    ]);
    if (disabled !== null && disabled !== undefined) return false;
    for (const value of [all, device]) {
      if (value === null || value === undefined) continue;
      const cutoff = Number(value);
      if (!Number.isFinite(cutoff) || iat < cutoff) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function sessionAllowed(token: string | undefined): Promise<boolean> {
  const { devices, key } = displayConfig();
  if (devices.length === 0 || !key) return false;
  const session = verifyDisplaySession({
    token,
    devices,
    key,
    nowMs: Date.now(),
  });
  if (!session) return false;
  return displayStillAllowed(session.device.id, session.iat);
}

/**
 * True only for a valid, unrevoked, read-only display session. Call this from
 * the Home feed GET routes and nowhere else: `display-scope.test.ts` pins the
 * list of importers, so adding a route here is a reviewed change.
 */
export function isDisplayReadRequest(request: Request): Promise<boolean> {
  return sessionAllowed(
    readCookie(request.headers.get('cookie'), DISPLAY_COOKIE) ?? undefined
  );
}

/** Same check for a server component reading `cookies()`. */
export function isDisplayCookieValid(token: string | undefined) {
  return sessionAllowed(token);
}

/**
 * Single use: the first caller for a device+timestamp wins; everyone else
 * (a replay) loses. Fails closed when Redis is unavailable.
 */
export async function claimDisplayProof(
  deviceId: string,
  ts: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const result = await redis.set(
      `ovie-display:proof:${deviceId}:${ts}`,
      '1',
      { nx: true, ex: DISPLAY_PROOF_REPLAY_TTL_SECONDS }
    );
    return result === 'OK';
  } catch {
    return false;
  }
}

/** Global cap on exchange attempts per minute; fails closed. */
export async function allowDisplayExchangeAttempt(
  nowMs: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const key = `ovie-display:attempts:${Math.floor(nowMs / 60_000)}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 120);
    return count <= EXCHANGE_LIMIT_PER_MINUTE;
  } catch {
    return false;
  }
}

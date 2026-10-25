import 'server-only';
import { createHash } from 'node:crypto';
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
export const EXCHANGE_LIMIT_PER_MINUTE = 10;

/**
 * `ok`, `denied` (a decision), or `unavailable` (the store could not answer:
 * fail closed now, retry later). Callers never treat `unavailable` as allowed.
 */
export type StoreResult = 'ok' | 'denied' | 'unavailable';

export function displayConfig(): {
  readonly devices: DisplayDevice[];
  readonly key: string;
} {
  return {
    devices: parseDisplayDevices(env.OVIE_DISPLAY_DEVICES),
    key: env.OVIE_DISPLAY_SESSION_KEY ?? '',
  };
}

/** Runtime revocation, checked on every display request. */
export async function displayStillAllowed(
  deviceId: string,
  iat: number
): Promise<StoreResult> {
  const redis = getRedis();
  if (!redis) return 'unavailable';
  try {
    const [all, device, disabled] = await Promise.all([
      redis.get<number | string | null>(REVOKED_BEFORE_ALL_KEY),
      redis.get<number | string | null>(revokedBeforeKey(deviceId)),
      redis.get<number | string | null>(disabledKey(deviceId)),
    ]);
    if (disabled !== null && disabled !== undefined) return 'denied';
    for (const value of [all, device]) {
      if (value === null || value === undefined) continue;
      const cutoff = Number(value);
      if (!Number.isFinite(cutoff) || iat < cutoff) return 'denied';
    }
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

/** Session check: signature, registry, expiry, scope, then runtime revocation. */
export async function displayAccess(
  token: string | undefined
): Promise<StoreResult> {
  const { devices, key } = displayConfig();
  if (devices.length === 0 || !key) return 'denied';
  const session = verifyDisplaySession({
    token,
    devices,
    key,
    nowMs: Date.now(),
  });
  if (!session) return 'denied';
  return displayStillAllowed(session.device.id, session.iat);
}

/**
 * True only for a valid, unrevoked, read-only display session. Call this from
 * the Home feed GET routes and nowhere else: `display-scope.test.ts` pins the
 * importers of this module and of the session verifier.
 */
export async function isDisplayReadRequest(request: Request): Promise<boolean> {
  return (
    (await displayAccess(
      readCookie(request.headers.get('cookie'), DISPLAY_COOKIE) ?? undefined
    )) === 'ok'
  );
}

/**
 * Single use: the first caller for a device+timestamp wins ('ok'); a replay is
 * 'denied'. 'unavailable' never spends the proof, so the caller can retry
 * within the proof window.
 */
export async function claimDisplayProof(
  deviceId: string,
  ts: number
): Promise<StoreResult> {
  const redis = getRedis();
  if (!redis) return 'unavailable';
  try {
    const result = await redis.set(
      `ovie-display:proof:${deviceId}:${ts}`,
      '1',
      {
        nx: true,
        ex: DISPLAY_PROOF_REPLAY_TTL_SECONDS,
      }
    );
    return result === 'OK' ? 'ok' : 'denied';
  } catch {
    return 'unavailable';
  }
}

const DEVICE_HINT = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** The client address behind the platform proxy; hashed before it touches Redis. */
export function clientAddress(headers: Headers): string {
  const raw =
    headers.get('x-vercel-forwarded-for') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0] ??
    '';
  return raw.trim() || 'unknown';
}

/**
 * Exchange attempts per minute, keyed by client address plus the claimed
 * device id, so junk from elsewhere cannot spend the Air's budget. `denied` is
 * over the cap; `unavailable` fails closed for this key only.
 */
export async function allowDisplayExchangeAttempt(input: {
  readonly nowMs: number;
  readonly address: string;
  readonly deviceHint: unknown;
}): Promise<StoreResult> {
  const redis = getRedis();
  if (!redis) return 'unavailable';
  const device =
    typeof input.deviceHint === 'string' && DEVICE_HINT.test(input.deviceHint)
      ? input.deviceHint
      : 'none';
  const who = createHash('sha256')
    .update(input.address)
    .digest('hex')
    .slice(0, 24);
  const key = `ovie-display:attempts:${who}:${device}:${Math.floor(input.nowMs / 60_000)}`;
  let count: number;
  try {
    count = await redis.incr(key);
  } catch {
    return 'unavailable';
  }
  // The bucket is minute-stamped, so a missing TTL cannot outlive its minute's
  // meaning; an expire failure must not fail the request.
  if (count === 1) {
    try {
      await redis.expire(key, 120);
    } catch {
      // see above
    }
  }
  return count <= EXCHANGE_LIMIT_PER_MINUTE ? 'ok' : 'denied';
}

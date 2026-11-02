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

const ATTEMPT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_TOKEN = /^[\w-]{16,400}\.[0-9a-f]{64}$/;

/** One page load of `/display/connect`. Retries reuse it; a stolen proof does not have it. */
export function isDisplayAttemptId(value: unknown): value is string {
  return typeof value === 'string' && ATTEMPT_ID.test(value);
}

export type ProofClaim =
  | { readonly status: 'ok'; readonly token: string }
  | { readonly status: 'denied' }
  | { readonly status: 'unavailable' };

function readStoredClaim(
  stored: unknown
): { readonly attemptId: string; readonly token: string } | null {
  if (typeof stored !== 'string') return null;
  const splitAt = stored.indexOf('.');
  if (splitAt < 0) return null;
  const attemptId = stored.slice(0, splitAt);
  const token = stored.slice(splitAt + 1);
  if (!ATTEMPT_ID.test(attemptId) || !SESSION_TOKEN.test(token)) return null;
  return { attemptId, token };
}

/**
 * One session per device and proof timestamp. The first attempt stores its
 * token; that same attempt redeems it again (the response was lost, the proof
 * was already claimed). A different attempt is denied. `unavailable` never
 * spends the proof.
 */
export async function claimDisplayProof(
  deviceId: string,
  ts: number,
  attemptId: string,
  token: string
): Promise<ProofClaim> {
  if (!isDisplayAttemptId(attemptId) || !SESSION_TOKEN.test(token))
    return { status: 'denied' };
  const redis = getRedis();
  if (!redis) return { status: 'unavailable' };
  const key = `ovie-display:proof:${deviceId}:${ts}`;
  try {
    const created = await redis.set(key, `${attemptId}.${token}`, {
      nx: true,
      ex: DISPLAY_PROOF_REPLAY_TTL_SECONDS,
    });
    if (created === 'OK') return { status: 'ok', token };
    const stored = readStoredClaim(await redis.get(key));
    if (stored?.attemptId === attemptId)
      return { status: 'ok', token: stored.token };
    return { status: 'denied' };
  } catch {
    return { status: 'unavailable' };
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

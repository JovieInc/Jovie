import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Display sessions: the office ultra-wide shows Ovie Home all day without a
 * login. A display is a registered device. It proves possession of a device
 * secret (kept in the Air's keychain, never sent) with a short-lived HMAC, and
 * gets a read-only session cookie that only the Home feeds accept. Pure and
 * deterministic: time and keys come in as arguments.
 */
export const DISPLAY_COOKIE = 'ovie_display';
export const DISPLAY_SCOPE = 'ovie-home-read';
/** Long enough for a working day, short enough that a stolen cookie ages out. */
export const DISPLAY_SESSION_TTL_SECONDS = 12 * 60 * 60;
/** A proof is valid this long either side of the server clock. */
export const DISPLAY_PROOF_SKEW_SECONDS = 60;
const MIN_SECRET_LENGTH = 32;
const DEVICE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

export interface DisplayDevice {
  readonly id: string;
  /** Current secret first; previous secret second during a rotation. */
  readonly secrets: readonly string[];
  /** Sessions minted before this epoch second are dead (per-device revocation). */
  readonly revokedBefore: number;
  readonly disabled: boolean;
}

/**
 * Parse `OVIE_DISPLAY_DEVICES`: JSON array of
 * `{ id, secret, previousSecret?, revokedBefore?, disabled? }`. Anything
 * malformed is dropped, so a typo can only remove access, never widen it.
 */
export function parseDisplayDevices(raw: string | undefined): DisplayDevice[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const devices: DisplayDevice[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, secret, previousSecret, revokedBefore, disabled } =
      entry as Record<string, unknown>;
    if (typeof id !== 'string' || !DEVICE_ID.test(id)) continue;
    if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH)
      continue;
    const secrets = [secret];
    if (typeof previousSecret === 'string') {
      if (previousSecret.length < MIN_SECRET_LENGTH) continue;
      secrets.push(previousSecret);
    }
    if (devices.some(device => device.id === id)) continue;
    devices.push({
      id,
      secrets,
      revokedBefore:
        typeof revokedBefore === 'number' && Number.isFinite(revokedBefore)
          ? revokedBefore
          : 0,
      disabled: disabled === true,
    });
  }
  return devices;
}

const hmacHex = (key: string, message: string) =>
  createHmac('sha256', key).update(message).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** What the device computes: `HMAC(secret, "ovie-display:v1:<id>:<ts>")`. */
export function displayDeviceProof(
  secret: string,
  deviceId: string,
  ts: number
): string {
  return hmacHex(secret, `ovie-display:v1:${deviceId}:${ts}`);
}

export function verifyDeviceProof(input: {
  readonly devices: readonly DisplayDevice[];
  readonly deviceId: unknown;
  readonly ts: unknown;
  readonly proof: unknown;
  readonly nowMs: number;
}): DisplayDevice | null {
  const { deviceId, ts, proof } = input;
  if (typeof deviceId !== 'string' || typeof proof !== 'string') return null;
  if (typeof ts !== 'number' || !Number.isInteger(ts)) return null;
  if (
    Math.abs(Math.floor(input.nowMs / 1000) - ts) > DISPLAY_PROOF_SKEW_SECONDS
  )
    return null;
  const device = input.devices.find(entry => entry.id === deviceId);
  if (!device || device.disabled) return null;
  // Compare against every secret (no early exit) so timing does not reveal
  // which one matched.
  let ok = false;
  for (const secret of device.secrets)
    ok = safeEqual(proof, displayDeviceProof(secret, deviceId, ts)) || ok;
  return ok ? device : null;
}

const b64 = (value: string) => Buffer.from(value).toString('base64url');

export function mintDisplaySession(input: {
  readonly device: DisplayDevice;
  readonly key: string;
  readonly nowMs: number;
}): { readonly token: string; readonly expiresAt: number } {
  const iat = Math.floor(input.nowMs / 1000);
  const exp = iat + DISPLAY_SESSION_TTL_SECONDS;
  const body = b64(
    JSON.stringify({ v: 1, s: DISPLAY_SCOPE, d: input.device.id, iat, exp })
  );
  return {
    token: `${body}.${hmacHex(input.key, `ovie-display-session:${body}`)}`,
    expiresAt: exp,
  };
}

/** The device behind a valid, unexpired, unrevoked session, else null. */
export function verifyDisplaySession(input: {
  readonly token: string | null | undefined;
  readonly devices: readonly DisplayDevice[];
  readonly key: string;
  readonly nowMs: number;
}): DisplayDevice | null {
  const { token } = input;
  if (!token || input.key.length < MIN_SECRET_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  if (!safeEqual(sig, hmacHex(input.key, `ovie-display-session:${body}`)))
    return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const now = Math.floor(input.nowMs / 1000);
  if (claims.v !== 1 || claims.s !== DISPLAY_SCOPE) return null;
  if (typeof claims.d !== 'string' || typeof claims.iat !== 'number')
    return null;
  if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
  const device = input.devices.find(entry => entry.id === claims.d);
  if (!device || device.disabled || claims.iat < device.revokedBefore)
    return null;
  return device;
}

export function readCookie(
  header: string | null | undefined,
  name: string
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
}

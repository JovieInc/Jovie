import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  type AuthClient,
  type AuthIntent,
  type AuthStateRecord,
  buildNativeExchangeCodeRecord,
  createAuthStateRecord,
  isAuthClient,
  isAuthIntent,
  isValidNativeAttempt,
  type NativeAuthClient,
  type NativeExchangeCodeRecord,
  type NativeExchangeValidationResult,
  validateNativeExchange,
} from '@jovie/auth-routing';
import { auth } from '@/lib/auth/better-auth';
import { env } from '@/lib/env-server';

const AUTH_STATE_PREFIX = 'jovie-auth-state';
const NATIVE_EXCHANGE_PREFIX = 'jovie-auth-exchange';
const SEALED_VALUE_VERSION = 'v1';
const NON_PRODUCTION_FALLBACK_SECRET =
  'jovie-non-production-better-auth-fallback-secret';

function buildAuthStateKey(state: string): string {
  return `${AUTH_STATE_PREFIX}:${state}`;
}

function buildNativeExchangeKey(code: string): string {
  return `${NATIVE_EXCHANGE_PREFIX}:${code}`;
}

function getAuthRoutingEncryptionKey(): Buffer {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret && env.VERCEL_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required for auth routing state');
  }

  return createHash('sha256')
    .update('jovie-auth-routing-state:v1\0')
    .update(secret ?? NON_PRODUCTION_FALLBACK_SECRET)
    .digest();
}

function sealVerificationValue(identifier: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    getAuthRoutingEncryptionKey(),
    iv
  );
  cipher.setAAD(Buffer.from(identifier, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [
    SEALED_VALUE_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

function unsealVerificationValue(
  identifier: string,
  sealedValue: unknown
): unknown {
  if (typeof sealedValue !== 'string') return null;
  const [version, encodedIv, encodedTag, encodedCiphertext, ...rest] =
    sealedValue.split('.');
  if (
    version !== SEALED_VALUE_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    rest.length > 0
  ) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getAuthRoutingEncryptionKey(),
      Buffer.from(encodedIv, 'base64url')
    );
    decipher.setAAD(Buffer.from(identifier, 'utf8'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as unknown;
  } catch {
    return null;
  }
}

/**
 * Auth routing is a security-critical login dependency, not a cache. Keep its
 * short-lived one-time records in Better Auth's Postgres verification store
 * so a Redis quota or network outage can shed rate-limit counters without
 * blocking sign-in. The verification adapter provides atomic consume
 * semantics. Sessions are Postgres rows plus the cookie cache; Redis is not
 * in that path.
 */
async function createVerificationRecord(
  identifier: string,
  value: unknown,
  expiresAt: number
): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.createVerificationValue({
    identifier,
    value: sealVerificationValue(identifier, value),
    expiresAt: new Date(expiresAt),
  });
}

async function readVerificationRecord(identifier: string): Promise<unknown> {
  const ctx = await auth.$context;
  const record = await ctx.internalAdapter.findVerificationValue(identifier);
  return unsealVerificationValue(identifier, record?.value);
}

async function consumeVerificationRecord(identifier: string): Promise<unknown> {
  const ctx = await auth.$context;
  const record = await ctx.internalAdapter.consumeVerificationValue(identifier);
  return unsealVerificationValue(identifier, record?.value);
}

function parseJsonRecord(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  return value;
}

function parseStoredAuthState(value: unknown): AuthStateRecord | null {
  const parsed = parseJsonRecord(value);
  if (parsed === null || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  if (!isAuthClient(record.client)) return null;
  if (!isAuthIntent(record.intent)) return null;
  if (typeof record.returnTo !== 'string') return null;
  if (typeof record.state !== 'string') return null;
  if (typeof record.createdAt !== 'number') return null;
  if (typeof record.expiresAt !== 'number') return null;
  if (!isValidNativeAttempt(record.client, record.nativeAttempt)) return null;
  if (
    record.codeChallenge !== null &&
    record.codeChallenge !== undefined &&
    typeof record.codeChallenge !== 'string'
  ) {
    return null;
  }

  return {
    client: record.client,
    intent: record.intent,
    returnTo: record.returnTo,
    state: record.state,
    codeChallenge: record.codeChallenge ?? null,
    ...(record.nativeAttempt !== undefined
      ? { nativeAttempt: record.nativeAttempt }
      : {}),
    desktopFlow:
      typeof record.desktopFlow === 'string' ? record.desktopFlow : null,
    desktopReturnCode: record.desktopReturnCode === true,
    desktopLoopbackPort:
      typeof record.desktopLoopbackPort === 'number' &&
      Number.isInteger(record.desktopLoopbackPort) &&
      record.desktopLoopbackPort >= 1 &&
      record.desktopLoopbackPort <= 65535
        ? record.desktopLoopbackPort
        : undefined,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    consumedAt:
      typeof record.consumedAt === 'number' ? record.consumedAt : null,
  };
}

function isNativeClient(client: AuthClient): client is NativeAuthClient {
  return client === 'ios' || client === 'electron';
}

function parseStoredNativeExchange(
  value: unknown
): NativeExchangeCodeRecord | null {
  const parsed = parseJsonRecord(value);
  if (parsed === null || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  if (!isAuthClient(record.client) || !isNativeClient(record.client)) {
    return null;
  }
  if (typeof record.code !== 'string') return null;
  if (typeof record.state !== 'string') return null;
  if (typeof record.userId !== 'string') return null;
  if (typeof record.returnTo !== 'string') return null;
  if (typeof record.createdAt !== 'number') return null;
  if (typeof record.expiresAt !== 'number') return null;
  if (!isValidNativeAttempt(record.client, record.nativeAttempt)) return null;
  if (
    record.codeChallenge !== null &&
    record.codeChallenge !== undefined &&
    typeof record.codeChallenge !== 'string'
  ) {
    return null;
  }
  if (
    record.ott !== null &&
    record.ott !== undefined &&
    typeof record.ott !== 'string'
  ) {
    return null;
  }

  return {
    code: record.code,
    client: record.client,
    state: record.state,
    userId: record.userId,
    returnTo: record.returnTo,
    codeChallenge: record.codeChallenge ?? null,
    ...(record.nativeAttempt !== undefined
      ? { nativeAttempt: record.nativeAttempt }
      : {}),
    ott: typeof record.ott === 'string' ? record.ott : null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    consumedAt:
      typeof record.consumedAt === 'number' ? record.consumedAt : null,
  };
}

export async function createStoredAuthState(input: {
  readonly client: AuthClient;
  readonly intent: AuthIntent;
  readonly returnTo: string;
  readonly state: string;
  readonly codeChallenge?: string | null;
  readonly nativeAttempt?: string;
  readonly desktopFlow?: string | null;
  readonly desktopReturnCode?: boolean;
  readonly desktopLoopbackPort?: number | null;
  readonly now?: number;
}): Promise<AuthStateRecord> {
  const record = createAuthStateRecord({
    client: input.client,
    intent: input.intent,
    returnTo: input.returnTo,
    state: input.state,
    codeChallenge: input.codeChallenge,
    nativeAttempt: input.nativeAttempt,
    desktopFlow: input.desktopFlow,
    desktopReturnCode: input.desktopReturnCode,
    desktopLoopbackPort: input.desktopLoopbackPort,
    now: input.now ?? Date.now(),
  });

  await createVerificationRecord(
    buildAuthStateKey(record.state),
    record,
    record.expiresAt
  );

  return record;
}

export async function readStoredAuthState(input: {
  readonly state: string;
  readonly now?: number;
}): Promise<AuthStateRecord | null> {
  const stored = await readVerificationRecord(buildAuthStateKey(input.state));
  const record = parseStoredAuthState(stored);
  if (!record) return null;

  const now = input.now ?? Date.now();
  if (
    record.state !== input.state ||
    record.consumedAt ||
    now > record.expiresAt
  ) {
    return null;
  }

  return record;
}

export async function consumeStoredAuthState(input: {
  readonly state: string;
  readonly now?: number;
}): Promise<AuthStateRecord | null> {
  const stored = await consumeVerificationRecord(
    buildAuthStateKey(input.state)
  );
  const record = parseStoredAuthState(stored);
  if (!record) return null;

  const now = input.now ?? Date.now();
  if (
    record.state !== input.state ||
    record.consumedAt ||
    now > record.expiresAt
  ) {
    return null;
  }

  return record;
}

export async function createStoredNativeExchangeCode(input: {
  readonly code: string;
  readonly client: NativeAuthClient;
  readonly state: string;
  readonly userId: string;
  readonly returnTo: string;
  readonly codeChallenge?: string | null;
  readonly nativeAttempt?: string;
  readonly ott?: string | null;
  readonly now?: number;
}): Promise<NativeExchangeCodeRecord> {
  const record = buildNativeExchangeCodeRecord({
    code: input.code,
    client: input.client,
    state: input.state,
    userId: input.userId,
    returnTo: input.returnTo,
    codeChallenge: input.codeChallenge,
    nativeAttempt: input.nativeAttempt,
    ott: input.ott,
    now: input.now ?? Date.now(),
  });

  await createVerificationRecord(
    buildNativeExchangeKey(record.code),
    record,
    record.expiresAt
  );

  return record;
}

type StoredNativeExchangeValidationResult = NativeExchangeValidationResult & {
  readonly exchangePhase?: 'preconsume';
};

export async function consumeStoredNativeExchangeCode(input: {
  readonly client: NativeAuthClient;
  readonly code: string;
  readonly state: string;
  readonly codeVerifier?: string | null;
  readonly nativeAttempt?: string;
  readonly now?: number;
  readonly createCodeChallenge: (verifier: string) => string;
}): Promise<StoredNativeExchangeValidationResult> {
  const now = input.now ?? Date.now();
  const identifier = buildNativeExchangeKey(input.code);
  const stored = await readVerificationRecord(identifier);
  const candidate = parseStoredNativeExchange(stored);
  const preliminary = validateNativeExchange({
    record: candidate,
    client: input.client,
    code: input.code,
    state: input.state,
    codeVerifier: input.codeVerifier,
    nativeAttempt: input.nativeAttempt,
    now,
    createCodeChallenge: input.createCodeChallenge,
  });

  // Preserve the record on a verifier mismatch so an invalid attempt cannot
  // consume the real user's one-time exchange. Once validation succeeds, the
  // database adapter atomically claims the row; concurrent attempts cannot
  // both succeed.
  if (!preliminary.ok) {
    return { ...preliminary, exchangePhase: 'preconsume' };
  }

  const consumed = await consumeVerificationRecord(identifier);
  const record = parseStoredNativeExchange(consumed);
  return validateNativeExchange({
    record,
    client: input.client,
    code: input.code,
    state: input.state,
    codeVerifier: input.codeVerifier,
    nativeAttempt: input.nativeAttempt,
    now,
    createCodeChallenge: input.createCodeChallenge,
  });
}

// Desktop handback that does not depend on the jovie:// deep link. When the
// browser cannot hand control back (no URL scheme handler, another copy of
// the app owns it, a blocked prompt, or sign-in finished on another device),
// the return page shows a short return code. The user types it into the Mac
// app, which redeems it with its PKCE verifier for the same code/state pair
// the deep link carries.
//
// The code is shown to a human on purpose. An automatic poll would let
// anyone who crafts a sign-in link with their own verifier collect a
// victim's session once the victim signs in (device-code phishing). Here
// the attacker needs both the verifier and the code the victim reads.
const DESKTOP_HANDBACK_PREFIX = 'jovie-auth-desktop-handback';
// RFC 8628 section 6.1: consonants only, no vowels, no look-alikes.
export const DESKTOP_RETURN_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const DESKTOP_RETURN_CODE_LENGTH = 8;

interface DesktopHandbackRecord {
  readonly code: string;
  readonly state: string;
  readonly desktopFlow: string;
  readonly codeChallenge: string;
  readonly returnCodeHash: string;
  readonly expiresAt: number;
}

function buildDesktopHandbackKey(desktopFlow: string): string {
  const flowHash = createHash('sha256').update(desktopFlow).digest('base64url');
  return `${DESKTOP_HANDBACK_PREFIX}:${flowHash}`;
}

export function normalizeDesktopReturnCode(value: string): string | null {
  const normalized = value.toUpperCase().replaceAll(/[\s-]/g, '');
  if (normalized.length !== DESKTOP_RETURN_CODE_LENGTH) return null;
  for (const char of normalized) {
    if (!DESKTOP_RETURN_CODE_ALPHABET.includes(char)) return null;
  }
  return normalized;
}

export function createDesktopReturnCode(): string {
  // 240 is the largest multiple of 20 below 256; rejecting the rest keeps
  // every letter equally likely.
  let code = '';
  while (code.length < DESKTOP_RETURN_CODE_LENGTH) {
    for (const byte of randomBytes(DESKTOP_RETURN_CODE_LENGTH * 2)) {
      if (byte >= 240) continue;
      code += DESKTOP_RETURN_CODE_ALPHABET[byte % 20];
      if (code.length === DESKTOP_RETURN_CODE_LENGTH) break;
    }
  }
  return code;
}

function hashDesktopReturnCode(
  desktopFlow: string,
  returnCode: string
): string {
  return createHash('sha256')
    .update('jovie-desktop-return-code:v1\0')
    .update(desktopFlow)
    .update('\0')
    .update(returnCode)
    .digest('base64url');
}

function parseDesktopHandbackRecord(
  value: unknown
): DesktopHandbackRecord | null {
  const parsed = parseJsonRecord(value);
  if (parsed === null || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  if (
    typeof record.code !== 'string' ||
    typeof record.state !== 'string' ||
    typeof record.desktopFlow !== 'string' ||
    typeof record.codeChallenge !== 'string' ||
    typeof record.returnCodeHash !== 'string' ||
    typeof record.expiresAt !== 'number'
  ) {
    return null;
  }

  return {
    code: record.code,
    state: record.state,
    desktopFlow: record.desktopFlow,
    codeChallenge: record.codeChallenge,
    returnCodeHash: record.returnCodeHash,
    expiresAt: record.expiresAt,
  };
}

/** Stores the handback and returns the human-readable return code. */
export async function createStoredDesktopHandback(input: {
  readonly code: string;
  readonly state: string;
  readonly desktopFlow: string;
  readonly codeChallenge: string;
  readonly expiresAt: number;
  readonly returnCode?: string;
}): Promise<string> {
  const returnCode = input.returnCode ?? createDesktopReturnCode();
  await createVerificationRecord(
    buildDesktopHandbackKey(input.desktopFlow),
    {
      code: input.code,
      state: input.state,
      desktopFlow: input.desktopFlow,
      codeChallenge: input.codeChallenge,
      returnCodeHash: hashDesktopReturnCode(input.desktopFlow, returnCode),
      expiresAt: input.expiresAt,
    } satisfies DesktopHandbackRecord,
    input.expiresAt
  );
  return returnCode;
}

export type DesktopHandbackRedeemResult =
  | { readonly status: 'invalid' }
  | {
      readonly status: 'complete';
      readonly code: string;
      readonly state: string;
    };

/**
 * Read-verify-consume, mirroring `consumeStoredNativeExchangeCode`: a wrong
 * verifier or return code never consumes the record, so a typo does not
 * burn the handback. Only the PKCE verifier holder can redeem, and the
 * redeemed code still needs that verifier at `/api/auth/native/exchange`.
 * Unknown, expired, already-redeemed and mismatched requests all answer
 * `invalid` so the endpoint is not an oracle.
 */
export async function redeemStoredDesktopHandback(input: {
  readonly desktopFlow: string;
  readonly codeVerifier: string;
  readonly returnCode: string;
  readonly createCodeChallenge: (verifier: string) => string;
  readonly now?: number;
}): Promise<DesktopHandbackRedeemResult> {
  const now = input.now ?? Date.now();
  const returnCode = normalizeDesktopReturnCode(input.returnCode);
  if (!returnCode) return { status: 'invalid' };

  const identifier = buildDesktopHandbackKey(input.desktopFlow);
  const candidate = parseDesktopHandbackRecord(
    await readVerificationRecord(identifier)
  );
  if (
    !candidate ||
    candidate.desktopFlow !== input.desktopFlow ||
    now > candidate.expiresAt ||
    input.createCodeChallenge(input.codeVerifier) !== candidate.codeChallenge ||
    hashDesktopReturnCode(input.desktopFlow, returnCode) !==
      candidate.returnCodeHash
  ) {
    return { status: 'invalid' };
  }

  const consumed = parseDesktopHandbackRecord(
    await consumeVerificationRecord(identifier)
  );
  if (!consumed || consumed.code !== candidate.code) {
    return { status: 'invalid' };
  }

  return { status: 'complete', code: consumed.code, state: consumed.state };
}

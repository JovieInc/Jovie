import 'server-only';

import crypto from 'node:crypto';
import {
  type AuthStateRecord,
  type NativeAuthClient,
  type NativeExchangeCodeRecord,
  type NativeExchangeValidationResult,
  sanitizeReturnTo,
  validateNativeExchange,
} from '@jovie/auth-routing';
import type { NextResponse } from 'next/server';
import { env } from '@/lib/env-server';

const AUTH_STATE_COOKIE = 'jovie_auth_state_fallback';
const AUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const ENVELOPE_VERSION = 'v1';
const AUTH_STATE_PURPOSE = 'auth-state-fallback';
const NATIVE_EXCHANGE_PURPOSE = 'native-exchange-fallback';
const NATIVE_EXCHANGE_PREFIX = 'jvex1.';

interface AuthStateFallbackEnvelope {
  readonly record: AuthStateRecord;
  readonly allowPrimaryMiss: boolean;
}

export interface AuthStateFallbackResolution {
  readonly record: AuthStateRecord;
  readonly allowPrimaryMiss: boolean;
}

function getKey(purpose: string): Buffer {
  const secret = env.URL_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('URL_ENCRYPTION_KEY is required for auth routing fallback');
  }
  return crypto.createHmac('sha256', secret).update(purpose).digest();
}

function seal(value: unknown, purpose: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(purpose), iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  const decoded = Buffer.from(value, 'base64url');
  return decoded.toString('base64url') === value ? decoded : null;
}

function open(value: string, purpose: string): unknown | null {
  try {
    const [version, iv, encrypted, authTag, extra] = value.split('.');
    if (
      version !== ENVELOPE_VERSION ||
      !iv ||
      !encrypted ||
      !authTag ||
      extra
    ) {
      return null;
    }
    const ivBuffer = decodeCanonicalBase64Url(iv);
    const encryptedBuffer = decodeCanonicalBase64Url(encrypted);
    const authTagBuffer = decodeCanonicalBase64Url(authTag);
    if (!ivBuffer || !encryptedBuffer || !authTagBuffer) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getKey(purpose),
      ivBuffer
    );
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(authTagBuffer);
    const plaintext = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as unknown;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function parseAuthStateRecord(value: unknown): AuthStateRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<AuthStateRecord>;
  if (
    (record.client !== 'web' &&
      record.client !== 'ios' &&
      record.client !== 'electron') ||
    (record.intent !== 'sign_in' && record.intent !== 'sign_up') ||
    typeof record.returnTo !== 'string' ||
    sanitizeReturnTo(record.client, record.returnTo) !== record.returnTo ||
    typeof record.state !== 'string' ||
    typeof record.createdAt !== 'number' ||
    typeof record.expiresAt !== 'number' ||
    (record.codeChallenge != null &&
      typeof record.codeChallenge !== 'string') ||
    (record.desktopFlow != null && typeof record.desktopFlow !== 'string')
  ) {
    return null;
  }
  if (record.client !== 'web' && !record.codeChallenge) return null;
  return {
    client: record.client,
    intent: record.intent,
    returnTo: record.returnTo,
    state: record.state,
    codeChallenge: record.codeChallenge ?? null,
    desktopFlow: record.desktopFlow ?? null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    consumedAt: null,
  };
}

function parseNativeExchangeRecord(
  value: unknown
): NativeExchangeCodeRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<NativeExchangeCodeRecord>;
  if (
    (record.client !== 'ios' && record.client !== 'electron') ||
    typeof record.state !== 'string' ||
    typeof record.userId !== 'string' ||
    typeof record.returnTo !== 'string' ||
    sanitizeReturnTo(record.client, record.returnTo) !== record.returnTo ||
    typeof record.createdAt !== 'number' ||
    typeof record.expiresAt !== 'number' ||
    typeof record.codeChallenge !== 'string' ||
    (record.ott != null && typeof record.ott !== 'string')
  ) {
    return null;
  }
  return {
    code: '',
    client: record.client,
    state: record.state,
    userId: record.userId,
    returnTo: record.returnTo,
    codeChallenge: record.codeChallenge,
    ott: record.ott ?? null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    consumedAt: null,
  };
}

export function sealAuthStateFallback(
  record: AuthStateRecord,
  options: { readonly allowPrimaryMiss: boolean }
): string {
  return seal(
    { record, allowPrimaryMiss: options.allowPrimaryMiss },
    AUTH_STATE_PURPOSE
  );
}

export function readAuthStateFallback(input: {
  request: Request;
  state: string;
  now?: number;
}): AuthStateFallbackResolution | null {
  const value = readCookie(input.request, AUTH_STATE_COOKIE);
  if (!value) return null;
  const opened = open(value, AUTH_STATE_PURPOSE);
  if (!opened || typeof opened !== 'object') return null;
  const envelope = opened as Partial<AuthStateFallbackEnvelope>;
  if (typeof envelope.allowPrimaryMiss !== 'boolean') return null;
  const record = parseAuthStateRecord(envelope.record);
  const now = input.now ?? Date.now();
  if (!record || record.state !== input.state || now > record.expiresAt)
    return null;
  return { record, allowPrimaryMiss: envelope.allowPrimaryMiss };
}

export function setAuthStateFallbackCookie(
  response: NextResponse,
  value: string
): void {
  response.cookies.set(AUTH_STATE_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/auth',
    maxAge: AUTH_STATE_MAX_AGE_SECONDS,
  });
}

export function clearAuthStateFallbackCookie(response: NextResponse): void {
  response.cookies.set(AUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 0,
  });
}

export function sealNativeExchangeFallback(
  record: NativeExchangeCodeRecord
): string {
  return `${NATIVE_EXCHANGE_PREFIX}${seal(record, NATIVE_EXCHANGE_PURPOSE)}`;
}

export function consumeNativeExchangeFallback(input: {
  client: NativeAuthClient;
  code: string;
  state: string;
  codeVerifier?: string | null;
  now?: number;
  createCodeChallenge: (verifier: string) => string;
}): NativeExchangeValidationResult {
  if (!input.code.startsWith(NATIVE_EXCHANGE_PREFIX)) {
    return { ok: false, reason: 'missing' };
  }
  const record = parseNativeExchangeRecord(
    open(
      input.code.slice(NATIVE_EXCHANGE_PREFIX.length),
      NATIVE_EXCHANGE_PURPOSE
    )
  );
  return validateNativeExchange({
    record: record ? { ...record, code: input.code } : null,
    client: input.client,
    code: input.code,
    state: input.state,
    codeVerifier: input.codeVerifier,
    now: input.now ?? Date.now(),
    createCodeChallenge: input.createCodeChallenge,
  });
}

export const AUTH_STATE_FALLBACK_COOKIE_NAME = AUTH_STATE_COOKIE;

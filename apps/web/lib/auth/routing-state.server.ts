import 'server-only';

import {
  type AuthClient,
  type AuthIntent,
  type AuthStateRecord,
  buildNativeExchangeCodeRecord,
  createAuthStateRecord,
  isAuthClient,
  isAuthIntent,
  type NativeAuthClient,
  type NativeExchangeCodeRecord,
  type NativeExchangeValidationResult,
  validateNativeExchange,
} from '@jovie/auth-routing';
import { getRedis } from '@/lib/redis';

const AUTH_STATE_TTL_SECONDS = 10 * 60;
const NATIVE_EXCHANGE_TTL_SECONDS = 5 * 60;
const AUTH_STATE_PREFIX = 'auth:state';
const NATIVE_EXCHANGE_PREFIX = 'auth:exchange';

export class AuthRoutingStoreUnavailableError extends Error {
  constructor() {
    super('Redis is required for auth routing state');
    this.name = 'AuthRoutingStoreUnavailableError';
  }
}

function getRequiredRedis() {
  const redis = getRedis();
  if (!redis) {
    throw new AuthRoutingStoreUnavailableError();
  }
  return redis;
}

function buildAuthStateKey(state: string): string {
  return `${AUTH_STATE_PREFIX}:${state}`;
}

function buildNativeExchangeKey(code: string): string {
  return `${NATIVE_EXCHANGE_PREFIX}:${code}`;
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
    desktopFlow:
      typeof record.desktopFlow === 'string' ? record.desktopFlow : null,
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
  readonly desktopFlow?: string | null;
  readonly now?: number;
}): Promise<AuthStateRecord> {
  const redis = getRequiredRedis();
  const record = createAuthStateRecord({
    client: input.client,
    intent: input.intent,
    returnTo: input.returnTo,
    state: input.state,
    codeChallenge: input.codeChallenge,
    desktopFlow: input.desktopFlow,
    now: input.now ?? Date.now(),
  });

  await redis.set(buildAuthStateKey(record.state), JSON.stringify(record), {
    ex: AUTH_STATE_TTL_SECONDS,
  });

  return record;
}

export async function readStoredAuthState(input: {
  readonly state: string;
  readonly now?: number;
}): Promise<AuthStateRecord | null> {
  const redis = getRequiredRedis();
  const key = buildAuthStateKey(input.state);
  const stored = await redis.get(key);
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
  const record = await readStoredAuthState(input);
  if (!record) return null;

  const redis = getRequiredRedis();
  await redis.del(buildAuthStateKey(input.state));
  return record;
}

export async function createStoredNativeExchangeCode(input: {
  readonly code: string;
  readonly client: NativeAuthClient;
  readonly state: string;
  readonly userId: string;
  readonly returnTo: string;
  readonly codeChallenge?: string | null;
  readonly ott?: string | null;
  readonly now?: number;
}): Promise<NativeExchangeCodeRecord> {
  const redis = getRequiredRedis();
  const record = buildNativeExchangeCodeRecord({
    code: input.code,
    client: input.client,
    state: input.state,
    userId: input.userId,
    returnTo: input.returnTo,
    codeChallenge: input.codeChallenge,
    ott: input.ott,
    now: input.now ?? Date.now(),
  });

  await redis.set(buildNativeExchangeKey(record.code), JSON.stringify(record), {
    ex: NATIVE_EXCHANGE_TTL_SECONDS,
  });

  return record;
}

export async function consumeStoredNativeExchangeCode(input: {
  readonly client: NativeAuthClient;
  readonly code: string;
  readonly state: string;
  readonly codeVerifier?: string | null;
  readonly now?: number;
  readonly createCodeChallenge: (verifier: string) => string;
}): Promise<NativeExchangeValidationResult> {
  const redis = getRequiredRedis();
  const key = buildNativeExchangeKey(input.code);
  const now = input.now ?? Date.now();
  // Atomically claim the code so concurrent exchange attempts cannot both succeed.
  const stored = await redis.getdel(key);
  const record = parseStoredNativeExchange(stored);
  const result = validateNativeExchange({
    record,
    client: input.client,
    code: input.code,
    state: input.state,
    codeVerifier: input.codeVerifier,
    now,
    createCodeChallenge: input.createCodeChallenge,
  });

  if (!result.ok && result.reason === 'wrong_verifier' && record) {
    const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt - now) / 1000));
    await redis.set(key, JSON.stringify(record), { ex: ttlSeconds });
  }

  return result;
}

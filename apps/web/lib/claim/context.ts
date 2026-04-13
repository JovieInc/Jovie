import 'server-only';

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { env, isSecureEnv } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import type { ClaimEntryMode, PendingClaimContext } from './types';

export const PENDING_CLAIM_COOKIE = 'jovie_pending_claim';
export const PENDING_CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_CLAIM_SECRET_DOMAIN = 'pending-claim-cookie';

function getPendingClaimSecret(): string {
  const secret = env.URL_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'URL_ENCRYPTION_KEY must be configured for pending claim cookies'
    );
  }

  return crypto
    .createHmac('sha256', secret)
    .update(PENDING_CLAIM_SECRET_DOMAIN)
    .digest('hex');
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', getPendingClaimSecret())
    .update(payload)
    .digest('hex');
}

function serializePendingClaim(context: PendingClaimContext): string {
  const body = Buffer.from(JSON.stringify(context)).toString('base64url');
  return `${body}.${signPayload(body)}`;
}

function parsePendingClaimCookie(value: string): PendingClaimContext | null {
  const [body, signature] = value.split('.');
  if (!body || !signature) {
    return null;
  }

  const expected = signPayload(body);
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const parsed = JSON.parse(
    Buffer.from(body, 'base64url').toString('utf8')
  ) as PendingClaimContext;

  if (
    !parsed?.creatorProfileId ||
    !parsed.username ||
    (parsed.mode !== 'token_backed' && parsed.mode !== 'direct_profile')
  ) {
    return null;
  }

  if (parsed.expiresAt <= Date.now()) {
    return null;
  }

  return {
    ...parsed,
    username: parsed.username.toLowerCase(),
  };
}

function createPendingClaimContext(
  input: Omit<PendingClaimContext, 'issuedAt' | 'expiresAt'>
): PendingClaimContext {
  const now = Date.now();
  return {
    ...input,
    username: input.username.toLowerCase(),
    issuedAt: now,
    expiresAt: now + PENDING_CLAIM_TTL_MS,
  };
}

export async function writePendingClaimContext(input: {
  mode: ClaimEntryMode;
  creatorProfileId: string;
  username: string;
  claimTokenHash?: string | null;
  leadId?: string | null;
  expectedSpotifyArtistId?: string | null;
}): Promise<PendingClaimContext> {
  const context = createPendingClaimContext(input);
  const cookieStore = await cookies();

  cookieStore.set(PENDING_CLAIM_COOKIE, serializePendingClaim(context), {
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(PENDING_CLAIM_TTL_MS / 1000),
  });

  return context;
}

export async function readPendingClaimContext(options?: {
  username?: string;
}): Promise<PendingClaimContext | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PENDING_CLAIM_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  try {
    const parsed = parsePendingClaimCookie(raw);
    if (!parsed) {
      cookieStore.delete(PENDING_CLAIM_COOKIE);
      return null;
    }

    if (
      options?.username &&
      parsed.username !== options.username.trim().toLowerCase()
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    cookieStore.delete(PENDING_CLAIM_COOKIE);
    await captureError('Failed to parse pending claim cookie', error, {
      route: 'lib/claim/context',
    });
    return null;
  }
}

export async function clearPendingClaimContext(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_CLAIM_COOKIE);
}

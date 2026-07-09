import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { buildIosAuthCompleteUrl, sanitizeReturnTo } from '@jovie/auth-routing';
import { NextRequest, NextResponse } from 'next/server';
import {
  ensureLiveDevTestAuthActor,
  getDevTestAuthAvailability,
  parseDevTestAuthPersona,
} from '@/lib/auth/dev-test-auth.server';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import { resolveConfiguredNativeTestBetterAuthUserId } from '@/lib/auth/native-test-clerk-user.server';
import { createStoredNativeExchangeCode } from '@/lib/auth/routing-state.server';
import { isTrustedTestBypassRequest } from '@/lib/auth/test-mode';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

interface MobileCallbackRequest {
  readonly codeVerifier?: unknown;
  readonly persona?: unknown;
  readonly returnTo?: unknown;
}

function getRequestDevTestAuthAvailability(request: NextRequest) {
  const availability = getDevTestAuthAvailability(request.nextUrl.hostname);
  if (
    availability.trustedHost ||
    !availability.enabled ||
    !isTrustedTestBypassRequest(request.headers)
  ) {
    return availability;
  }

  return {
    enabled: true,
    trustedHost: true,
    reason: null,
  };
}

function createOpaqueValue(): string {
  return randomUUID().replaceAll('-', '');
}

function createCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function readBodyObject(body: unknown): MobileCallbackRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }

  return body as MobileCallbackRequest;
}

function resolvePersona(value: unknown): DevTestAuthPersona | null {
  if (value === undefined) {
    return 'creator-ready';
  }

  if (typeof value !== 'string') {
    return null;
  }

  return parseDevTestAuthPersona(value);
}

function resolveCodeVerifier(value: unknown): string | null {
  if (value === undefined) {
    return createCodeVerifier();
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveReturnTo(value: unknown): string | null {
  if (value === undefined) {
    return '/app';
  }

  if (typeof value !== 'string') {
    return null;
  }

  return sanitizeReturnTo('ios', value);
}

export async function POST(request: NextRequest) {
  const availability = getRequestDevTestAuthAvailability(request);

  if (!availability.enabled || !availability.trustedHost) {
    return NextResponse.json(
      {
        success: false,
        error: availability.reason,
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const body = readBodyObject(await request.json().catch(() => null));
  const persona = resolvePersona(body.persona);
  if (!persona) {
    return NextResponse.json(
      { success: false, error: 'Invalid persona' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const codeVerifier = resolveCodeVerifier(body.codeVerifier);
  if (!codeVerifier) {
    return NextResponse.json(
      { success: false, error: 'Invalid code verifier' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const returnTo = resolveReturnTo(body.returnTo);
  if (!returnTo) {
    return NextResponse.json(
      { success: false, error: 'Invalid return_to' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let userId = await resolveConfiguredNativeTestBetterAuthUserId();
  let responsePersona = persona;
  if (!userId) {
    const actor = await ensureLiveDevTestAuthActor(persona);
    userId = actor.clerkUserId;
    responsePersona = actor.persona;
  }
  const code = createOpaqueValue();
  const state = createOpaqueValue();

  await createStoredNativeExchangeCode({
    code,
    client: 'ios',
    state,
    userId,
    returnTo,
    codeChallenge: createCodeChallenge(codeVerifier),
  });

  return NextResponse.json(
    {
      success: true,
      client: 'ios',
      callbackUrl: buildIosAuthCompleteUrl({ code, state }),
      codeVerifier,
      state,
      returnTo,
      persona: responsePersona,
      userId,
    },
    { headers: NO_STORE_HEADERS }
  );
}

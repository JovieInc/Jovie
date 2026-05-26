import { randomUUID } from 'node:crypto';
import { buildIosAuthCompleteUrl, sanitizeReturnTo } from '@jovie/auth-routing';
import { NextRequest, NextResponse } from 'next/server';
import {
  ensureLiveDevTestAuthActor,
  getDevTestAuthAvailability,
  parseDevTestAuthPersona,
} from '@/lib/auth/dev-test-auth.server';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import { resolveConfiguredNativeTestClerkUserId } from '@/lib/auth/native-test-clerk-user.server';
import { createStoredNativeExchangeCode } from '@/lib/auth/routing-state.server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

function createOpaqueValue(): string {
  return randomUUID().replaceAll('-', '');
}

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

function hasValidTunnelToken(request: NextRequest): boolean {
  if (isProductionDeployment()) {
    return false;
  }

  const expectedToken = readTrimmedEnv('JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN');
  if (!expectedToken) {
    return false;
  }

  return request.nextUrl.searchParams.get('test_token') === expectedToken;
}

function getRequestDevTestAuthAvailability(request: NextRequest) {
  if (isProductionDeployment()) {
    return {
      enabled: false,
      trustedHost: false,
      reason: 'Not available in production',
    };
  }

  if (hasValidTunnelToken(request)) {
    return {
      enabled: true,
      trustedHost: true,
      reason: null,
    };
  }

  const availability = getDevTestAuthAvailability(request.nextUrl.hostname);
  if (availability.trustedHost || !availability.enabled) {
    return availability;
  }

  return availability;
}

function resolvePersona(value: string | null): DevTestAuthPersona | null {
  if (value === null) {
    return 'creator-ready';
  }

  return parseDevTestAuthPersona(value);
}

function resolveReturnTo(value: string | null): string | null {
  if (value === null) {
    return '/app';
  }

  return sanitizeReturnTo('ios', value);
}

function resolveCodeChallenge(request: NextRequest): string | null {
  const codeChallenge = request.nextUrl.searchParams
    .get('code_challenge')
    ?.trim();
  const codeChallengeMethod = request.nextUrl.searchParams.get(
    'code_challenge_method'
  );

  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return null;
  }

  return codeChallenge;
}

export async function GET(request: NextRequest) {
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

  const persona = resolvePersona(request.nextUrl.searchParams.get('persona'));
  if (!persona) {
    return NextResponse.json(
      { success: false, error: 'Invalid persona' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const returnTo = resolveReturnTo(
    request.nextUrl.searchParams.get('return_to')
  );
  if (!returnTo) {
    return NextResponse.json(
      { success: false, error: 'Invalid return_to' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const codeChallenge = resolveCodeChallenge(request);
  if (!codeChallenge) {
    return NextResponse.json(
      { success: false, error: 'Native auth requires PKCE' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let userId = await resolveConfiguredNativeTestClerkUserId();
  if (!userId) {
    const actor = await ensureLiveDevTestAuthActor(persona);
    userId = actor.clerkUserId;
  }

  const code = createOpaqueValue();
  const state = createOpaqueValue();
  await createStoredNativeExchangeCode({
    code,
    client: 'ios',
    state,
    userId,
    returnTo,
    codeChallenge,
  });

  return NextResponse.redirect(buildIosAuthCompleteUrl({ code, state }), {
    headers: NO_STORE_HEADERS,
  });
}

import 'server-only';
// @coverage-via apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts

import { makeSignature } from 'better-auth/crypto';
import { seedAdminMfaStepUpBestEffort } from '@/lib/admin/mfa-seed';
import { auth } from '@/lib/auth/better-auth';
import type { DevTestAuthActor } from '@/lib/auth/dev-test-auth-types';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
} from '@/lib/auth/test-mode';

const DEV_TEST_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

export async function buildBetterAuthSessionCookieDescriptor(
  actor: DevTestAuthActor,
  secure: boolean
) {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(
    actor.clerkUserId,
    false
  );
  if (!session?.token) {
    throw new Error(
      'Better Auth performance session creation returned no token'
    );
  }

  if (actor.isAdmin && typeof session.id === 'string' && session.id) {
    // enter?session=better-auth skips the test-mode cookie, so auth uses the
    // real BA session id — seed that receipt too for admin personas.
    await seedAdminMfaStepUpBestEffort('session', session.id);
  }

  const signature = await makeSignature(session.token, ctx.secret);
  const attributes = ctx.authCookies.sessionToken.attributes;
  const configuredSameSite =
    typeof attributes.sameSite === 'string'
      ? attributes.sameSite.toLowerCase()
      : 'lax';
  const sameSite: 'lax' | 'strict' | 'none' =
    configuredSameSite === 'strict' || configuredSameSite === 'none'
      ? configuredSameSite
      : 'lax';

  return {
    name: ctx.authCookies.sessionToken.name,
    value: `${session.token}.${signature}`,
    httpOnly: attributes.httpOnly ?? true,
    maxAge: ctx.sessionConfig.expiresIn,
    path: attributes.path ?? '/',
    sameSite,
    secure: secure || (attributes.secure ?? false),
  };
}

export function buildDevTestAuthCookieDescriptors(
  actor: DevTestAuthActor,
  secure: boolean
) {
  const baseCookie = {
    httpOnly: true,
    maxAge: DEV_TEST_AUTH_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax' as const,
    secure,
  };

  return [
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      ...baseCookie,
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: actor.clerkUserId,
      ...baseCookie,
    },
    {
      name: TEST_PERSONA_COOKIE,
      value: actor.persona,
      ...baseCookie,
    },
  ];
}

export const DEV_TEST_AUTH_COOKIE_NAMES = [
  TEST_MODE_COOKIE,
  TEST_USER_ID_COOKIE,
  TEST_PERSONA_COOKIE,
] as const;

export function sanitizeDevTestAuthRedirectPath(
  value: string | null | undefined
): string | null {
  if (!value) {
    return '/app';
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  return value;
}

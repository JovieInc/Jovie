import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextMiddleware } from 'next/server';
import { handleProxyRequest } from '@/lib/auth/proxy-request-handler';
import { isStagingHost, resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';

const CLERK_SENSITIVE_PATTERNS = [
  'dummy',
  'mock',
  '1234567890',
  'test-key',
  'placeholder',
] as const;

export function isMockOrMissingClerkConfig(hostname: string): boolean {
  const keys = resolveClerkKeys(hostname);

  if (!keys.publishableKey || !keys.secretKey) return true;

  const publishableLower = keys.publishableKey.toLowerCase();
  const secretLower = keys.secretKey.toLowerCase();

  return CLERK_SENSITIVE_PATTERNS.some(
    pattern =>
      publishableLower.includes(pattern) || secretLower.includes(pattern)
  );
}

// Production Clerk middleware (default keys from env)
const clerkProductionMiddleware = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  return handleProxyRequest(req, userId);
});

// Staging Clerk middleware — lazy-initialized with separate instance keys.
// The same build is promoted staging → production, so staging keys are
// stored as server-only runtime env vars (not NEXT_PUBLIC_).
//
// Key resolution order:
// 1. Explicit _STAGING suffixed vars (if either is set, use only those)
// 2. Standard env vars read at runtime via bracket notation to bypass
//    webpack DefinePlugin (Doppler syncs staging values per-environment)
let _clerkStagingMiddleware: NextMiddleware | null = null;
function getClerkStagingMiddleware() {
  if (_clerkStagingMiddleware === null) {
    const explicitPk = process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    const explicitSk = process.env.CLERK_SECRET_KEY_STAGING;

    let stagingPk: string | undefined;
    let stagingSk: string | undefined;

    if (explicitPk || explicitSk) {
      // Explicit _STAGING vars present — use only those (fail closed on partial)
      stagingPk = explicitPk;
      stagingSk = explicitSk;
    } else {
      // Fall back to runtime standard vars (bracket notation bypasses DefinePlugin)
      stagingPk =
        (process.env as Record<string, string | undefined>)[
          'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
        ] || undefined;
      stagingSk = process.env.CLERK_SECRET_KEY || undefined;
    }

    if (stagingPk && stagingSk) {
      // Read proxyUrl at runtime using bracket notation to bypass webpack
      // DefinePlugin. NEXT_PUBLIC_CLERK_PROXY_URL is inlined at build time with
      // the production value, but staging and production share the same path
      // (/__clerk), so the inlined value is correct. The bracket notation is
      // used here for symmetry with the other runtime env reads above and to
      // ensure the correct value is used if the env var differs per environment.
      const stagingProxyUrl =
        (process.env as Record<string, string | undefined>)[
          'NEXT_PUBLIC_CLERK_PROXY_URL'
        ] || '/__clerk';

      _clerkStagingMiddleware = clerkMiddleware(
        async (auth, req) => {
          const { userId } = await auth();
          return handleProxyRequest(req, userId);
        },
        {
          publishableKey: stagingPk,
          secretKey: stagingSk,
          proxyUrl: stagingProxyUrl,
        }
      );
    }
  }
  return _clerkStagingMiddleware;
}

/**
 * Select the correct Clerk middleware for the request hostname.
 * Staging uses a separate Clerk instance with its own keys; returns null
 * when the staging instance can't be initialized (missing keys).
 */
export function selectClerkMiddleware(hostname: string): NextMiddleware | null {
  return isStagingHost(hostname)
    ? getClerkStagingMiddleware()
    : clerkProductionMiddleware;
}

import { headers } from 'next/headers';
import { getRequestLocationFromHeaders } from '@/components/providers/clerkAvailability';
import { STAGING_HOSTNAMES } from '@/constants/domains';
import type { ClerkKeyStatus } from '@/lib/auth/clerk-key-status';
import { publicEnv } from '@/lib/env-public';

/**
 * Runtime Clerk key resolution for staging environments.
 *
 * The same build is promoted staging → production via `vercel promote`.
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is inlined at build time (always production).
 * Staging uses separate Clerk instance keys stored as server-only runtime env vars.
 */

export function isStagingHost(hostname: string): boolean {
  return STAGING_HOSTNAMES.has(hostname);
}

interface ClerkKeys {
  publishableKey: string | undefined;
  secretKey: string | undefined;
  status: ClerkKeyStatus;
}

/**
 * Read a NEXT_PUBLIC_* env var at runtime, bypassing webpack DefinePlugin.
 *
 * Dot-notation access (process.env.NEXT_PUBLIC_X) is replaced at build time
 * with the production literal. Bracket notation is NOT replaced, so it reads
 * the actual runtime value from the deployment environment.
 */
function runtimePublicEnv(key: string): string | undefined {
  return (process.env as Record<string, string | undefined>)[key] || undefined;
}

/**
 * Resolve Clerk keys for a given hostname.
 * Returns staging keys when on a staging host and staging keys are configured.
 * Staging must never silently fall back to production keys.
 */
export function resolveClerkKeys(hostname: string): ClerkKeys {
  if (isStagingHost(hostname)) {
    const explicitPk = process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    const explicitSk = process.env.CLERK_SECRET_KEY_STAGING;

    // When explicit _STAGING vars exist, use only those (fail closed on partial).
    if (explicitPk || explicitSk) {
      if (!explicitPk || !explicitSk) {
        return {
          publishableKey: undefined,
          secretKey: undefined,
          status: 'staging_missing',
        };
      }
      return {
        publishableKey: explicitPk,
        secretKey: explicitSk,
        status: 'ok',
      };
    }

    // No _STAGING vars at all: fall back to the standard env vars read at
    // runtime. Doppler syncs these directly to Vercel per-environment, so the
    // staging deployment has staging values even though the build inlined
    // production values via DefinePlugin.
    const runtimePk = runtimePublicEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    const runtimeSk = process.env.CLERK_SECRET_KEY || undefined;
    if (!runtimePk || !runtimeSk) {
      return {
        publishableKey: undefined,
        secretKey: undefined,
        status: 'staging_missing',
      };
    }
    // If the runtime PK matches the build-time production PK, the staging
    // environment doesn't have staging-specific Clerk keys — the Vercel
    // Preview env just inherited the production value. Using production keys
    // on staging.jov.ie causes Clerk middleware to throw because the domain
    // isn't in the production Clerk app's allowlist.
    const buildTimePk = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (buildTimePk && runtimePk === buildTimePk) {
      return {
        publishableKey: undefined,
        secretKey: undefined,
        status: 'staging_inherits_prod',
      };
    }
    return {
      publishableKey: runtimePk,
      secretKey: runtimeSk,
      status: 'ok',
    };
  }

  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY || undefined;
  return {
    publishableKey,
    secretKey,
    status: publishableKey && secretKey ? 'ok' : 'no_publishable_key',
  };
}

export { CLERK_KEY_STATUS_HEADER } from '@/lib/auth/clerk-key-status';

/**
 * Resolve the publishable key for dynamic server component layouts.
 *
 * Prefers the x-clerk-publishable-key request header injected by middleware
 * (proxy.ts) which resolves the correct key for staging vs production based
 * on hostname — avoiding duplicate hostname-parsing in every layout render.
 *
 * Falls back to hostname-based resolution for environments running without
 * the middleware (e.g., direct Node.js server, some test setups).
 */
export async function resolvePublishableKeyFromHeaders(): Promise<
  string | undefined
> {
  const hdrs = await headers();
  const preResolved = hdrs.get('x-clerk-publishable-key');
  if (preResolved) return preResolved;
  // Fallback: resolve from the Host header directly.
  // Only return the publishable key when the secret key is also present,
  // otherwise ClerkProvider will throw during SSR.
  const hostname = getRequestLocationFromHeaders(hdrs)?.hostname ?? '';
  const keys = resolveClerkKeys(hostname);
  if (keys.publishableKey && keys.secretKey) {
    return keys.publishableKey;
  }
  return undefined;
}

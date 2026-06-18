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
 * Module-scope memoization cache for resolveClerkKeys.
 *
 * Env vars are fixed at container start — caching avoids repeated env reads
 * on every middleware invocation (3-4× per request).
 *
 * SAFETY: only entries with BOTH keys present (status === 'ok') are stored.
 * Incomplete / degraded statuses ('staging_missing', 'staging_inherits_prod',
 * 'no_publishable_key', 'missing') are returned directly and never stored, so
 * a transient env-miss on a cold start cannot be pinned for the worker lifetime.
 *
 * BOUNDED: capped at 50 entries with FIFO eviction. Real hostnames are few
 * (jov.ie, staging.jov.ie, localhost, preview URLs), but `hostname` derives
 * from the attacker-controllable Host header — the cap defends against a
 * scanner spraying unique Host values that would otherwise grow the Map until
 * the worker OOMs.
 *
 * Exported for test teardown only. Do not call from production code.
 */
const RESOLVE_CLERK_KEYS_CACHE_MAX = 50;
export const _resolveClerkKeysCache = new Map<string, ClerkKeys>();

/**
 * Store a resolved key set with FIFO eviction so the cache stays bounded.
 * Only called for status:'ok' results (both keys present).
 */
function cacheClerkKeys(hostname: string, result: ClerkKeys): void {
  if (_resolveClerkKeysCache.size >= RESOLVE_CLERK_KEYS_CACHE_MAX) {
    const firstKey = _resolveClerkKeysCache.keys().next().value;
    if (firstKey !== undefined) _resolveClerkKeysCache.delete(firstKey);
  }
  _resolveClerkKeysCache.set(hostname, result);
}

/**
 * Resolve Clerk keys for a given hostname.
 * Returns staging keys when on a staging host and staging keys are configured.
 * Staging must never silently fall back to production keys.
 */
export function resolveClerkKeys(hostname: string): ClerkKeys {
  const cached = _resolveClerkKeysCache.get(hostname);
  if (cached) return cached;
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
      const result: ClerkKeys = {
        publishableKey: explicitPk,
        secretKey: explicitSk,
        status: 'ok',
      };
      cacheClerkKeys(hostname, result);
      return result;
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
    const stagingResult: ClerkKeys = {
      publishableKey: runtimePk,
      secretKey: runtimeSk,
      status: 'ok',
    };
    cacheClerkKeys(hostname, stagingResult);
    return stagingResult;
  }

  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY || undefined;
  if (publishableKey && secretKey) {
    const prodResult: ClerkKeys = { publishableKey, secretKey, status: 'ok' };
    cacheClerkKeys(hostname, prodResult);
    return prodResult;
  }
  return {
    publishableKey,
    secretKey,
    status: 'no_publishable_key',
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
 *
 * NOTE: Calls headers() which opts the page into dynamic rendering.
 * Use resolvePublishableKeyStaticFirst() for layouts that should remain static
 * on production (e.g., parallel slot layouts that render on marketing routes).
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

/**
 * Resolve the publishable key without calling headers() on production.
 *
 * On the production host (VERCEL_ENV === 'production'), the build-time
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is the correct key. When the deployment
 * also carries staging-specific keys, inspect the request host once so a
 * promoted staging deployment never renders with the production Clerk key.
 * Otherwise return the production key without opting the page into dynamic
 * rendering, preserving static ISR caching for marketing routes.
 *
 * On staging/preview/local (VERCEL_ENV !== 'production'), falls back to
 * resolvePublishableKeyFromHeaders() which reads the x-clerk-publishable-key
 * header set by middleware. Staging is inherently dynamic so calling headers()
 * there is acceptable.
 *
 * Use this in parallel-slot layouts (e.g., @auth/layout.tsx) that mount on
 * every route including marketing pages. Using resolvePublishableKeyFromHeaders()
 * in those layouts forces ALL routes — including static marketing pages — into
 * dynamic rendering, emitting per-request nonce headers that violate the
 * static-marketing rule (.claude/rules/ui.md).
 */
export async function resolvePublishableKeyStaticFirst(): Promise<
  string | undefined
> {
  if (process.env.VERCEL_ENV === 'production') {
    // A promoted staging deployment can also report VERCEL_ENV=production.
    // When staging-specific keys are present, inspect the request host so
    // staging auth never renders with the production Clerk frontend key.
    if (
      process.env.CLERK_PUBLISHABLE_KEY_STAGING ||
      process.env.CLERK_SECRET_KEY_STAGING
    ) {
      const hdrs = await headers();
      const hostname = getRequestLocationFromHeaders(hdrs)?.hostname ?? '';
      if (isStagingHost(hostname)) {
        const preResolved = hdrs.get('x-clerk-publishable-key');
        if (preResolved) return preResolved;
        const keys = resolveClerkKeys(hostname);
        if (keys.publishableKey && keys.secretKey) return keys.publishableKey;
        return undefined;
      }
    }

    // On production the build-time key is correct. Avoid calling headers()
    // so the caller (e.g., @auth slot layout) does not opt marketing routes into
    // dynamic rendering.
    const pk = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (pk && process.env.CLERK_SECRET_KEY) return pk;
    // No valid key pair — Clerk unavailable on production. Caller will show
    // AuthUnavailableCard without opting into dynamic rendering.
    return undefined;
  }

  // Staging, preview, and local: fall back to the per-request header so the
  // correct environment-specific Clerk instance is used.
  return resolvePublishableKeyFromHeaders();
}

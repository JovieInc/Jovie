import { headers } from 'next/headers';
import { publicEnv } from '@/lib/env-public';

/**
 * Runtime Clerk key resolution for staging environments.
 *
 * The same build is promoted staging → production via `vercel promote`.
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is inlined at build time (always production).
 * Staging uses separate Clerk instance keys stored as server-only runtime env vars.
 */

// Keep in sync with STAGING_HOSTNAMES in proxy.ts and constants/domains.ts
const STAGING_HOSTS = new Set(['staging.jov.ie', 'main.jov.ie']);

export function isStagingHost(hostname: string): boolean {
  return STAGING_HOSTS.has(hostname);
}

interface ClerkKeys {
  publishableKey: string | undefined;
  secretKey: string | undefined;
}

/**
 * Resolve Clerk keys for a given hostname.
 * Returns staging keys when on a staging host and staging keys are configured.
 */
export function resolveClerkKeys(hostname: string): ClerkKeys {
  if (isStagingHost(hostname)) {
    const stagingPk = process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    const stagingSk = process.env.CLERK_SECRET_KEY_STAGING;
    if (stagingPk && stagingSk) {
      return { publishableKey: stagingPk, secretKey: stagingSk };
    }
  }
  return {
    publishableKey: publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY || undefined,
  };
}

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
  // Fallback: resolve from the Host header directly
  const host = hdrs.get('host') || hdrs.get('x-forwarded-host') || '';
  const hostname = host.split(':')[0];
  return resolveClerkKeys(hostname).publishableKey;
}

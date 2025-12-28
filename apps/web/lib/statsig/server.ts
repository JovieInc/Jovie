/**
 * @module statsig/server
 *
 * Server-side Statsig utilities for pre-fetching feature flag data.
 *
 * ## Bootstrap Pattern Overview
 *
 * The bootstrap pattern eliminates client-side initialization latency by pre-fetching
 * Statsig data on the server and passing it to the client as initial values. This
 * provides immediate access to feature flags without waiting for a client network request.
 *
 * ### How It Works
 *
 * 1. **Server-side**: Call `fetchStatsigBootstrapData(userId)` to fetch pre-evaluated
 *    feature gates, configs, and layers for the user from Statsig's API
 *
 * 2. **Pass to client**: Include the bootstrap data as a prop to `<MyStatsig bootstrapData={...}>`
 *
 * 3. **Client-side**: The Statsig SDK initializes synchronously with the pre-fetched data,
 *    making feature flags available immediately (0ms vs 100-300ms without bootstrap)
 *
 * ### Fallback Behavior
 *
 * If server-side fetch fails (network error, API error, missing key), functions return `null`.
 * The client-side `MyStatsig` component will detect this and fall back to standard async
 * initialization, ensuring feature flags are always eventually available.
 *
 * @example
 * ```typescript
 * // In a Next.js server component (e.g., layout.tsx):
 * import { fetchStatsigBootstrapData } from '@/lib/statsig/server';
 *
 * export default async function Layout({ children }) {
 *   const { userId } = await getAuth();
 *   const bootstrapData = await fetchStatsigBootstrapData(userId);
 *
 *   return (
 *     <MyStatsig userId={userId} bootstrapData={bootstrapData}>
 *       {children}
 *     </MyStatsig>
 *   );
 * }
 * ```
 */
'server only';

import { cache } from 'react';

import { env } from '@/lib/env-server';
import type { StatsigBootstrapData } from './types';

/**
 * Result from a single feature gate check
 */
export interface StatsigGateCheckResult {
  name: string;
  value: boolean;
  rule_id: string | null;
  group_name: string | null;
}

/**
 * Internal type for parsing Statsig check_gate API response
 * @internal
 */
type StatsigGateCheckResponse = {
  name?: unknown;
  value?: unknown;
  rule_id?: unknown;
  group_name?: unknown;
};

/**
 * Checks a single feature gate for a user via the Statsig API.
 *
 * This function makes a direct API call to Statsig's `/v1/check_gate` endpoint
 * to evaluate a feature gate for the specified user. Unlike the bootstrap approach,
 * this is a synchronous, one-off check suitable for server-side logic that needs
 * to evaluate a specific gate.
 *
 * @param gateName - The name of the feature gate to check
 * @param user - The user object containing at minimum a userID
 * @returns `true` if the gate is passing for this user, `false` otherwise (including on errors)
 *
 * @example
 * ```typescript
 * // Check if a user has access to a feature
 * const hasAccess = await checkStatsigGateForUser('new_dashboard', { userID: userId });
 * if (hasAccess) {
 *   // Show new dashboard
 * }
 * ```
 */
export async function checkStatsigGateForUser(
  gateName: string,
  user: { userID: string }
): Promise<boolean> {
  const apiKey = env.STATSIG_SERVER_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch('https://api.statsig.com/v1/check_gate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'statsig-api-key': apiKey,
      },
      body: JSON.stringify({ gateName, user }),
      cache: 'no-store',
    });

    if (!res.ok) return false;

    const payload = (await res
      .json()
      .catch(() => null)) as StatsigGateCheckResponse | null;

    return Boolean(payload && payload.value === true);
  } catch {
    return false;
  }
}

/**
 * Fetches Statsig client initialization data for a user from the server.
 *
 * This function calls the Statsig `/v1/initialize` endpoint to get pre-evaluated
 * feature gates, dynamic configs, and layer configs for the specified user.
 * The returned data can be used to bootstrap the Statsig client SDK, eliminating
 * the need for a client-side network round-trip on page load.
 *
 * Uses React's `cache()` to deduplicate requests within a single server request
 * lifecycle - multiple calls with the same userId will only make one API call.
 *
 * @param userId - The user ID to fetch initialization data for
 * @returns The Statsig bootstrap data, or null if the fetch fails or API key is missing
 *
 * @example
 * ```typescript
 * // In a server component:
 * const bootstrapData = await fetchStatsigBootstrapData(userId);
 *
 * // Pass to client component:
 * <MyStatsig bootstrapData={bootstrapData}>
 *   {children}
 * </MyStatsig>
 * ```
 */
export const fetchStatsigBootstrapData = cache(
  async (userId: string): Promise<StatsigBootstrapData | null> => {
    const apiKey = env.STATSIG_SERVER_API_KEY;
    if (!apiKey) {
      return null;
    }

    try {
      const res = await fetch('https://api.statsig.com/v1/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'statsig-api-key': apiKey,
        },
        body: JSON.stringify({
          user: { userID: userId },
          hash: 'djb2',
        }),
        cache: 'no-store',
      });

      if (!res.ok) {
        return null;
      }

      const data = (await res.json().catch(() => null)) as unknown;

      // Validate that we received a proper response with expected fields
      if (
        !data ||
        typeof data !== 'object' ||
        !('feature_gates' in data) ||
        !('dynamic_configs' in data)
      ) {
        return null;
      }

      return data as StatsigBootstrapData;
    } catch {
      return null;
    }
  }
);

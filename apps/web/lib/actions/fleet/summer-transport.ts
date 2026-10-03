import 'server-only';
import { getVercelOidcTokenSync } from '@vercel/oidc';
import { env } from '@/lib/env-server';
import { boundedFetch } from '@/lib/http/bounded-fetch';
import { resolveSummerEveCallerOrigin } from '@/lib/ovie/summer-production-pin';
import { eveShadowTransportHeaders } from '@/lib/ovie/summer-shadow-client';

export interface SummerFleetWakeDependencies {
  origin: typeof resolveSummerEveCallerOrigin;
  token: () => Promise<string>;
  headers: typeof eveShadowTransportHeaders;
  fetch: typeof boundedFetch;
  production: boolean;
}
/** Only IDs cross the fixed, verified Summer door. Proposals are never authority. */
export async function sendSummerFleetWake(
  profileId: string,
  eventId: string,
  deps: SummerFleetWakeDependencies = {
    origin: resolveSummerEveCallerOrigin,
    // Production context only: no developer credential refresh fallback.
    token: async () => getVercelOidcTokenSync(),
    headers: eveShadowTransportHeaders,
    fetch: boundedFetch,
    production: env.VERCEL_ENV === 'production',
  }
): Promise<void> {
  if (!deps.production) throw new Error('production_origin_required');
  const { origin } = await deps.origin();
  const response = await deps.fetch(
    new URL('/ovie/v1/summer-fleet/events', origin),
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        ...deps.headers(await deps.token()),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ profileId, eventId }),
      timeoutMs: 25_000,
      retry: { maxRetries: 0, baseDelayMs: 0 },
      context: 'Summer fleet event wake',
    }
  );
  // The wake needs only its acknowledgement status. Release either response
  // body without allowing untrusted cleanup to extend the delivery deadline.
  void response.body?.cancel().catch(() => undefined);
  if (!response.ok) throw new Error('summer_fleet_wake_unavailable');
}

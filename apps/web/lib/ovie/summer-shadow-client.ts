import 'server-only';
import { getVercelOidcToken } from '@vercel/oidc';
import { env } from '@/lib/env-server';
import { boundedFetch } from '@/lib/http/bounded-fetch';

/** Existing production Jovie OIDC boundary, shared by cron observations and founder conversation. */
export function getEveShadowOrigin(): string {
  const deploymentOrigin = env.OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN?.trim();
  if (!deploymentOrigin) throw new Error('exact_eve_deployment_required');
  return deploymentOrigin;
}

export async function fetchSummerShadow(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'production')
    throw new Error('production_origin_required');
  if (!path.startsWith('/ovie/v1/summer-shadow/'))
    throw new Error('invalid_shadow_path');
  const token = await getVercelOidcToken();
  return boundedFetch(new URL(path, getEveShadowOrigin()), {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    redirect: 'error',
    timeoutMs: 45_000,
    retry: { maxRetries: 0, baseDelayMs: 0 },
    context: 'Summer founder conversation',
  });
}

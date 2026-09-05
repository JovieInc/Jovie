import 'server-only';
import { getVercelOidcToken } from '@vercel/oidc';
import { boundedFetch } from '@/lib/http/bounded-fetch';

export const EVE_SHADOW_ORIGIN = 'https://jovie-eve-shadow.vercel.app';
/** Existing production Jovie OIDC boundary, shared by cron observations and founder conversation. */
export async function fetchSummerShadow(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'production')
    throw new Error('production_origin_required');
  if (!path.startsWith('/ovie/v1/summer-shadow/'))
    throw new Error('invalid_shadow_path');
  const token = await getVercelOidcToken();
  return boundedFetch(new URL(path, EVE_SHADOW_ORIGIN), {
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

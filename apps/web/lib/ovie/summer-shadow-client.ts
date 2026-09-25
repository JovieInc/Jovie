import 'server-only';
import { getVercelOidcToken } from '@vercel/oidc';
import { env } from '@/lib/env-server';
import { ServerEnvSchema } from '@/lib/env-server-schema';
import { boundedFetch } from '@/lib/http/bounded-fetch';
import {
  assertSummerProductionPin,
  SummerPinInvalidError,
} from '@/lib/ovie/summer-production-pin';

const EVE_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';
const BYPASS_COOKIE_HEADER = 'x-vercel-set-bypass-cookie';

function headerRecord(
  headers: HeadersInit | undefined
): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

export class InvalidEveProtectionBypassSecretError extends Error {
  constructor() {
    super('invalid_eve_protection_bypass_secret');
    this.name = 'InvalidEveProtectionBypassSecretError';
  }
}

/**
 * Deployment Protection headers for the immutable Eve origin.
 * Trusted Sources reads `x-vercel-trusted-oidc-idp-token`. The optional
 * bypass header is the eve-shadow project's automation secret
 * (eve-shadow = production Summer project, legacy name), never a
 * cookie and never Jovie's own `VERCEL_AUTOMATION_BYPASS_SECRET`.
 */
export function eveShadowTransportHeaders(
  oidcToken: string
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${oidcToken}`,
    'x-vercel-trusted-oidc-idp-token': oidcToken,
  };
  const bypass = env.OVIE_SUMMER_EVE_PROTECTION_BYPASS_SECRET?.trim();
  if (!bypass) return headers;
  if (!/^[\u0021-\u007E]+$/u.test(bypass)) {
    throw new InvalidEveProtectionBypassSecretError();
  }
  headers[EVE_PROTECTION_BYPASS_HEADER] = bypass;
  return headers;
}

/**
 * Production Summer origin (legacy name: eve-shadow), shared by cron
 * observations and founder conversation.
 */
export function getEveShadowOrigin(): string {
  const deploymentOrigin = env.OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN?.trim();
  if (!deploymentOrigin) throw new Error('exact_eve_deployment_required');
  const parsed =
    ServerEnvSchema.shape.OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN.safeParse(
      deploymentOrigin
    );
  if (!parsed.success || !parsed.data)
    throw new Error('invalid_eve_deployment_origin');
  return parsed.data;
}

export async function fetchSummerShadow(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'production')
    throw new Error('production_origin_required');
  if (!path.startsWith('/ovie/v1/summer-shadow/'))
    throw new Error('invalid_shadow_path');
  const origin = getEveShadowOrigin();
  try {
    await assertSummerProductionPin({
      origin,
      deploymentId: env.OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID?.trim(),
    });
  } catch (error) {
    if (error instanceof SummerPinInvalidError) {
      return Response.json(
        { ok: false, code: 'summer_pin_invalid' },
        { status: 503 }
      );
    }
    throw error;
  }
  const token = await getVercelOidcToken();
  const headers: Record<string, string> = {
    ...headerRecord(init.headers),
    ...eveShadowTransportHeaders(token),
    'content-type': 'application/json',
  };
  delete headers[BYPASS_COOKIE_HEADER];
  return boundedFetch(new URL(path, origin), {
    ...init,
    headers,
    redirect: 'error',
    timeoutMs: 45_000,
    retry: { maxRetries: 0, baseDelayMs: 0 },
    context: 'Summer founder conversation',
  });
}

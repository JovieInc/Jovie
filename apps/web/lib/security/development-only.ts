import 'server-only';

import { NextResponse } from 'next/server';

export const DEVELOPMENT_ONLY_ERROR = 'Not available outside development';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * ALLOW gate for dev/test/debug routes.
 *
 * Returns true only when the deployment is explicitly running in development.
 * Preview, staging, test, and production builds all return false.
 *
 * Ref: audit finding #1 (P0) — DENY gates on
 * `(NODE_ENV === 'production' && VERCEL_ENV === 'production')` leave preview
 * deployments reachable because `VERCEL_ENV === 'preview'` there.
 */
export function isExplicitDevelopmentEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'development'
  );
}

/** Hard production deploy check used for defence-in-depth proxy blocks. */
export function isVercelProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

export function developmentOnlyForbiddenResponse(
  init?: ResponseInit
): NextResponse {
  return NextResponse.json(
    { success: false, error: DEVELOPMENT_ONLY_ERROR },
    {
      status: 403,
      headers: NO_STORE_HEADERS,
      ...init,
    }
  );
}

export function developmentOnlyForbiddenJson(
  body: Record<string, unknown> = {},
  init?: ResponseInit
): NextResponse {
  return NextResponse.json(
    { success: false, error: DEVELOPMENT_ONLY_ERROR, ...body },
    {
      status: 403,
      headers: NO_STORE_HEADERS,
      ...init,
    }
  );
}

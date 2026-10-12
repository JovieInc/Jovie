import 'server-only';

import { NextResponse } from 'next/server';
import { isProductScreenshotCapturePath } from './production-blocked-routes';

export const DEVELOPMENT_ONLY_ERROR = 'Not available outside development';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface HeaderReader {
  get(name: string): string | null;
}

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

function extractHostname(value: string | null): string | null {
  const normalized = value?.split(',')[0]?.trim();
  if (!normalized) return null;

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      return new URL(normalized).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  return normalized.replace(/:\d+$/, '').toLowerCase();
}

export function isLocalDevelopmentAutomationHostname(
  hostname: string | null
): boolean {
  const normalized = hostname?.trim().toLowerCase() ?? null;
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    Boolean(normalized?.endsWith('.localhost'))
  );
}

/**
 * Local-only automation escape hatch for production-built test servers.
 * This intentionally requires an existing E2E opt-in and a loopback host.
 */
export function isLocalDevelopmentAutomationRequest(
  headerReader: HeaderReader
): boolean {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS !== '1') return false;

  const hostname =
    extractHostname(headerReader.get('x-forwarded-host')) ??
    extractHostname(headerReader.get('host')) ??
    extractHostname(headerReader.get('origin')) ??
    extractHostname(headerReader.get('referer'));

  return isLocalDevelopmentAutomationHostname(hostname);
}

function isLoopbackE2eAutomationHost(
  hostname: string | null,
  headerReader: HeaderReader
): boolean {
  return (
    isLocalDevelopmentAutomationRequest(headerReader) ||
    (process.env.E2E_USE_TEST_AUTH_BYPASS === '1' &&
      isLocalDevelopmentAutomationHostname(hostname))
  );
}

/** Synthetic shell fixtures require the local server and request authorities. */
function screenshotAuthorityHostname(value: string | null): string | null {
  if (!value || /[\s,@/\\?#]/.test(value)) return null;
  const authority = value.match(/^(\[[^\]]+\]|[^:]+)(?::([0-9]+))?$/);
  if (!authority || (authority[2] && Number(authority[2]) > 65535)) return null;
  const hostname = authority[1].toLowerCase();
  return isLocalDevelopmentAutomationHostname(hostname) ? hostname : null;
}

function isLocalScreenshotFixtureRequest(
  hostname: string | null,
  headerReader: HeaderReader
): boolean {
  if (
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1' ||
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    !isLocalDevelopmentAutomationHostname(process.env.HOSTNAME ?? null) ||
    !isLocalDevelopmentAutomationHostname(hostname)
  ) {
    return false;
  }

  // Do not derive authority from client-controlled forwarding, origin or referer.
  const host = screenshotAuthorityHostname(headerReader.get('host'));
  if (!host) return false;
  const forwardedHost = headerReader.get('x-forwarded-host');
  return (
    forwardedHost === null ||
    screenshotAuthorityHostname(forwardedHost) === host
  );
}

/**
 * Loopback-only escape hatch for production-built CI servers (mobile overflow,
 * screenshot capture). Keeps debug routes blocked on public hosts.
 */
export function shouldBypassProductionBlockedDebugPath(
  pathname: string,
  hostname: string | null,
  headerReader: HeaderReader
): boolean {
  if (
    pathname.startsWith('/demo') &&
    isProductScreenshotCapturePath(pathname)
  ) {
    return isLocalScreenshotFixtureRequest(hostname, headerReader);
  }

  if (!isLoopbackE2eAutomationHost(hostname, headerReader)) {
    return false;
  }

  if (pathname.startsWith('/api/dev/test-auth/')) {
    return true;
  }

  return pathname === '/exp/shell-v1' || pathname.startsWith('/exp/shell-v1/');
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

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export interface VerifyCronRequestOptions {
  route: string;
  cronSecret?: string;
  allowDevelopmentBypass?: boolean;
  requireTrustedOrigin?: boolean;
}

export function extractBearerToken(
  authHeader: string | null
): string | undefined {
  if (!authHeader) return undefined;

  const spaceIndex = authHeader.indexOf(' ');
  if (spaceIndex === -1) return undefined;

  const scheme = authHeader.slice(0, spaceIndex);
  if (scheme.toLowerCase() !== 'bearer') return undefined;

  const token = authHeader.slice(spaceIndex + 1);
  if (token.length === 0 || /\s/.test(token)) return undefined;

  return token;
}

/**
 * Default set of Jovie-owned hosts that are always trusted as cron origins.
 *
 * Explicitly does NOT include a `*.vercel.app` wildcard. Anyone can deploy to
 * `*.vercel.app`, so allowing the whole namespace lets an attacker forge the
 * `x-forwarded-host` header from an unrelated preview project. Legitimate
 * Vercel cron invocations are accepted only via the built-in Jovie-owned hosts
 * plus explicit Jovie-owned aliases in `CRON_TRUSTED_HOSTS`.
 */
const DEFAULT_TRUSTED_CRON_HOSTS: readonly string[] = [
  'jov.ie',
  'www.jov.ie',
  'staging.jov.ie',
];

function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  // `x-forwarded-host` may contain a port and/or a comma-separated list when
  // the request traversed multiple proxies. Take the first entry and drop the
  // port to compare against the allowlist.
  const first = host.split(',')[0]?.trim().toLowerCase();
  if (!first) return null;
  const withoutPort = first.replace(/:\d+$/, '');
  return withoutPort || null;
}

function parseTrustedHostsEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(entry => normalizeHost(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function getTrustedCronHosts(): Set<string> {
  return new Set<string>([
    ...DEFAULT_TRUSTED_CRON_HOSTS,
    ...parseTrustedHostsEnv(env.CRON_TRUSTED_HOSTS),
  ]);
}

/**
 * Validate cron origin using only trusted host headers.
 *
 * `x-vercel-cron` is intentionally ignored because callers can set it
 * themselves. We trust only exact Jovie-owned hosts plus explicitly configured
 * preview aliases in `CRON_TRUSTED_HOSTS`.
 */
export function verifyTrustedCronOrigin(request: Request): boolean {
  const forwardedHost = normalizeHost(request.headers.get('x-forwarded-host'));
  if (forwardedHost) {
    const trustedHosts = getTrustedCronHosts();
    if (trustedHosts.has(forwardedHost)) {
      return true;
    }
  }

  return env.NODE_ENV === 'development';
}

function timingSafeMatch(
  expected: string | undefined,
  provided: string | undefined
): boolean {
  if (!expected || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function verifyCronRequest(
  request: Request,
  options: VerifyCronRequestOptions
): NextResponse | null {
  if (options.allowDevelopmentBypass && env.NODE_ENV !== 'production') {
    return null;
  }

  if (options.requireTrustedOrigin && !verifyTrustedCronOrigin(request)) {
    logger.warn(`[cron] Rejected request from untrusted origin`, {
      route: options.route,
    });
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const cronSecret = options.cronSecret ?? env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[cron] CRON_SECRET is not configured', {
      route: options.route,
    });
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (!timingSafeMatch(cronSecret, token)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  return null;
}

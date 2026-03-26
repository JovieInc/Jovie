import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export interface VerifyCronRequestOptions {
  route: string;
  cronSecret?: string | undefined;
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

export function verifyTrustedCronOrigin(request: Request): boolean {
  const vercelCronHeader = request.headers.get('x-vercel-cron');
  if (vercelCronHeader === '1') {
    return true;
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (
    forwardedHost?.endsWith('.vercel.app') ||
    forwardedHost?.endsWith('.jov.ie') ||
    forwardedHost === 'jov.ie'
  ) {
    return true;
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

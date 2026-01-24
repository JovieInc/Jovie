import crypto from 'node:crypto';
import { revalidateTag, updateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env-server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Timing-safe comparison of Bearer tokens to prevent timing attacks.
 */
function verifyBearerToken(authHeader: string | null, secret: string): boolean {
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  const provided = authHeader.slice(7); // Remove 'Bearer ' prefix
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(secret);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const secret = env.REVALIDATE_SECRET;

  if (env.NODE_ENV === 'production' && !secret) {
    return NextResponse.json(
      { error: 'Revalidation secret not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (!verifyBearerToken(authHeader, secret)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  updateTag('featured-creators');
  revalidateTag('featured-creators', 'max');
  return NextResponse.json(
    { revalidated: true },
    { headers: NO_STORE_HEADERS }
  );
}

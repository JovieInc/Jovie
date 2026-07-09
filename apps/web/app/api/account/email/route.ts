import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  checkAccountEmailRateLimit,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { accountEmailSyncSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request) {
  try {
    const clientIp = getClientIP(request);
    const rateLimitResult = await checkAccountEmailRateLimit(clientIp);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: rateLimitResult.reason ?? 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/account/email',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const payload = parsedBody.data;
    const result = accountEmailSyncSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { email } = result.data;

    return await withDbSession(async userId => {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return NextResponse.json(
        { success: true },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('Failed to sync email address:', error);
    await captureError('Email address sync failed', error, {
      route: '/api/account/email',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Unable to sync email address' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

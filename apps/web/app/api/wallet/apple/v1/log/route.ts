import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { publicClickLimiter } from '@/lib/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const logSchema = z.object({
  logs: z.array(z.string().max(2000)).max(25),
});

export async function POST(request: NextRequest) {
  const clientIP = extractClientIP(request.headers);
  const rateLimit = await publicClickLimiter.limit(clientIP);
  if (!rateLimit.success) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const parsed = logSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid log payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    logger.warn('[apple-wallet] Client logs', {
      logs: parsed.data.logs,
      clientIP,
    });

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    await captureError('Apple Wallet log endpoint failed', error, {
      route: '/api/wallet/apple/v1/log',
    });
    return NextResponse.json(
      { error: 'Unable to record logs' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { publicProfileLimiter } from '@/lib/rate-limit';
import { incrementProfileViews } from '@/lib/services/profile';
import { detectBot } from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const viewSchema = z.object({
  handle: z.string().min(1).max(100),
});

type ViewPayload = z.infer<typeof viewSchema>;

export async function POST(request: NextRequest) {
  try {
    const clientIP = extractClientIP(request.headers);

    // Atomically check-and-decrement to avoid TOCTOU race between getStatus + limit
    const rateLimitResult = await publicProfileLimiter.limit(clientIP);

    if (!rateLimitResult.success) {
      const retryAfterSeconds = Math.ceil(
        (rateLimitResult.reset.getTime() - Date.now()) / 1000
      );
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(Math.max(retryAfterSeconds, 1)),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          },
        }
      );
    }

    const botResult = detectBot(request, '/api/profile/view');
    if (botResult.isBot) {
      return NextResponse.json(
        { success: true, filtered: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsed = viewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { handle } = parsed.data satisfies ViewPayload;

    // Per-handle rate limit: prevent a single IP from inflating views on one profile
    const handleIpKey = `${handle}:${clientIP}`;
    const handleResult = await publicProfileLimiter.limit(handleIpKey);
    if (!handleResult.success) {
      // Silently succeed — don't reveal per-handle limiting, just skip the increment
      return NextResponse.json(
        { success: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    await incrementProfileViews(handle);

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: 'Failed to record view' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

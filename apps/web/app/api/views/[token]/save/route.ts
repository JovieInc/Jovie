import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { createRateLimitHeaders, generalLimiter } from '@/lib/rate-limit';
import {
  PublishViewError,
  saveViewAsDashboard,
} from '@/lib/views/service.server';

export const runtime = 'nodejs';

interface SaveViewRouteContext {
  readonly params: Promise<{ token: string }>;
}

/** Save a shared view into the signed-in viewer's dashboards. */
export async function POST(
  _request: Request,
  { params }: SaveViewRouteContext
) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const rateLimit = await generalLimiter.limit(userId);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a moment.' },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rateLimit) },
      }
    );
  }

  const { token } = await params;
  try {
    const result = await saveViewAsDashboard({ token, userId });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err) {
    if (err instanceof PublishViewError && err.code === 'view_not_found') {
      return NextResponse.json(
        { error: 'View not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Save shared view failed', err, {
      route: '/api/views/[token]/save',
    });
    return NextResponse.json(
      { error: 'Failed to save view' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

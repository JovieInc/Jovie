/**
 * Whole-post What's New dismissal.
 *
 * One record per user per daily post (`release_daily_post_dismissals`
 * `(post_id, user_id)` unique): dismissing suppresses that post across
 * sessions and devices, while the next day's post can appear normally.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCachedAuth } from '@/lib/auth/cached';
import { isCanonicalUuid } from '@/lib/auth/profile-access';
import { captureError } from '@/lib/error-tracking';
import { DrizzleReleaseCommunicationsAdapter } from '@/lib/release-communications/drizzle-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: NextRequest) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  let body: { postId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid json' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (!isCanonicalUuid(body?.postId)) {
    return NextResponse.json(
      { error: 'invalid postId' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    await new DrizzleReleaseCommunicationsAdapter().dismissPost({
      postId: body.postId as string,
      userId,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('whats-new dismissal failed', error, {
      route: 'POST /api/whats-new/dismiss',
    });
    return NextResponse.json(
      { error: 'dismissal failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

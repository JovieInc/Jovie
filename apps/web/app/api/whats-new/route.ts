/**
 * In-app What's New delivery for canonical daily release posts.
 *
 * Returns the latest daily post for the signed-in user when it contains at
 * least one material user-facing entry and the user has not dismissed it.
 * Minor-only posts and dismissed posts return `{ prompt: null }`; the next
 * day's new post resolves normally. Unauthenticated reads are silent.
 */

import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { DrizzleReleaseCommunicationsAdapter } from '@/lib/release-communications/drizzle-adapter';
import { resolveDailyWhatsNewPrompt } from '@/lib/release-communications/prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;
const PRODUCT = 'jovie';
const APP = 'web';

export async function GET() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ prompt: null }, { headers: NO_STORE_HEADERS });
  }

  try {
    const adapter = new DrizzleReleaseCommunicationsAdapter();
    const post = await adapter.getLatestDailyPost({
      product: PRODUCT,
      app: APP,
    });
    const dismissed = post
      ? await adapter.isPostDismissed({ postId: post.id, userId })
      : false;
    const prompt = resolveDailyWhatsNewPrompt({
      post,
      dismissed,
      changelogUrl: `${BASE_URL}/changelog`,
    });
    return NextResponse.json({ prompt }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('whats-new daily prompt resolution failed', error, {
      route: 'GET /api/whats-new',
    });
    return NextResponse.json({ prompt: null }, { headers: NO_STORE_HEADERS });
  }
}

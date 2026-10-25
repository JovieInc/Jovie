import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import { silentlyLinkYouTubeChannel } from '@/lib/onboarding/youtube-silent-link';
import { getYouTubeVerificationView } from '@/lib/onboarding/youtube-verified-channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** Unverified-channel state for the profile setup rail. Owner-only. */
export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get('profileId') ?? '';
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  const access = await getExactProfileAccess(db, userId, profileId);
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  const view = await getYouTubeVerificationView({ userId, profileId });
  return NextResponse.json(view, { status: 200, headers: NO_STORE_HEADERS });
}

/**
 * Silent linking trigger. Owner-only and idempotent (24h server throttle);
 * the client calls it without any UI. Returns only the outcome status.
 */
export async function POST(request: Request) {
  const profileId = new URL(request.url).searchParams.get('profileId') ?? '';
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  const access = await getExactProfileAccess(db, userId, profileId);
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  const result = await silentlyLinkYouTubeChannel(profileId);
  return NextResponse.json(
    { status: result.status },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

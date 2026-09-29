import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { listSocialLinkSnapshots } from '@/lib/security/account-security';

export const runtime = 'nodejs';

// GET /api/dashboard/social-links/history?profileId=… — restorable
// link version history for the dashboard (JOV-6600).
export async function GET(req: NextRequest) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const profileId = z
    .string()
    .uuid()
    .safeParse(req.nextUrl.searchParams.get('profileId'));
  if (!profileId.success) {
    return NextResponse.json(
      { error: 'profileId is required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const snapshots = await listSocialLinkSnapshots({
      appUserId: userId,
      profileId: profileId.data,
    });
    return NextResponse.json({ snapshots }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Profile not found') {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    void captureError('Failed to list link history', error, {
      source: 'api/dashboard/social-links/history',
    });
    return NextResponse.json(
      { error: 'Unable to load link history right now.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

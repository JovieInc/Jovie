import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  loadArtistHandleForProfile,
  revokeLibraryAssetShareToken,
} from '@/lib/library/asset-share.server';

export const runtime = 'nodejs';

const revokeSchema = z.object({
  profileId: z.string().uuid(),
  assetId: z.string().min(1),
  itemKind: z.enum(['release', 'merch', 'image', 'video', 'audio']),
  title: z.string().min(1),
  smartLinkPath: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = revokeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, assetId, itemKind, title, smartLinkPath } = parsed.data;
    const { profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile || profile.id !== profileId) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const artistHandle = await loadArtistHandleForProfile(profileId);
    if (!artistHandle) {
      return NextResponse.json(
        { error: 'Artist handle not found' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const share = await revokeLibraryAssetShareToken({
      creatorProfileId: profileId,
      assetId,
      itemKind,
      title,
      smartLinkPath,
      artistHandle,
    });

    return NextResponse.json(
      { ok: true, share },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    await captureError('Library asset share revoke failed', caughtError, {
      route: '/api/library/asset-share/revoke',
    });
    return NextResponse.json(
      { error: 'Failed to revoke asset share link' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

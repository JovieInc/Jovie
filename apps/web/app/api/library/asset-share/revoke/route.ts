import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  parseLibraryAssetShareRequest,
  resolveLibraryAssetShareActor,
} from '@/lib/library/asset-share/route-helpers.server';
import { libraryAssetShareMutationSchema } from '@/lib/library/asset-share/schemas';
import { revokeLibraryAssetShareToken } from '@/lib/library/asset-share.server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = await parseLibraryAssetShareRequest(
      request,
      libraryAssetShareMutationSchema
    );
    if (!parsed.ok) return parsed.response;

    const { profileId, assetId, itemKind, title, smartLinkPath } = parsed.data;
    const actor = await resolveLibraryAssetShareActor(clerkUserId, profileId);
    if (!actor.ok) return actor.response;

    const share = await revokeLibraryAssetShareToken({
      creatorProfileId: profileId,
      assetId,
      itemKind,
      title,
      smartLinkPath,
      artistHandle: actor.artistHandle,
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

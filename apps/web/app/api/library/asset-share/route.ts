import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { isLibraryAssetVisibility } from '@/lib/library/asset-share';
import {
  parseLibraryAssetShareRequest,
  resolveLibraryAssetShareActor,
} from '@/lib/library/asset-share/route-helpers.server';
import {
  libraryAssetShareMutationSchema,
  libraryAssetShareVisibilitySchema,
} from '@/lib/library/asset-share/schemas';
import {
  ensureLibraryAssetShareSettings,
  getLibraryAssetShareForAsset,
  updateLibraryAssetShareVisibility,
} from '@/lib/library/asset-share.server';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = await parseLibraryAssetShareRequest(
      request,
      libraryAssetShareVisibilitySchema
    );
    if (!parsed.ok) return parsed.response;

    const { profileId, assetId, itemKind, title, smartLinkPath, visibility } =
      parsed.data;
    const actor = await resolveLibraryAssetShareActor(clerkUserId, profileId);
    if (!actor.ok) return actor.response;

    const share = await updateLibraryAssetShareVisibility({
      creatorProfileId: profileId,
      assetId,
      itemKind,
      title,
      smartLinkPath,
      visibility,
      artistHandle: actor.artistHandle,
    });

    return NextResponse.json(
      { ok: true, share },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    await captureError(
      'Library asset share visibility update failed',
      caughtError,
      {
        route: '/api/library/asset-share',
      }
    );
    return NextResponse.json(
      { error: 'Failed to update asset share settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

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

    const share = await ensureLibraryAssetShareSettings({
      creatorProfileId: profileId,
      assetId,
      itemKind,
      title,
      artistHandle: actor.artistHandle,
      smartLinkPath,
    });

    return NextResponse.json(
      { ok: true, share },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    await captureError('Library asset share ensure failed', caughtError, {
      route: '/api/library/asset-share',
    });
    return NextResponse.json(
      { error: 'Failed to ensure asset share settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const profileId = request.nextUrl.searchParams.get('profileId');
    const assetId = request.nextUrl.searchParams.get('assetId');

    if (!profileId || !assetId) {
      return NextResponse.json(
        { error: 'profileId and assetId are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const actor = await resolveLibraryAssetShareActor(clerkUserId, profileId);
    if (!actor.ok) return actor.response;

    const share = await getLibraryAssetShareForAsset({
      creatorProfileId: profileId,
      assetId,
      artistHandle: actor.artistHandle,
    });

    if (!share) {
      return NextResponse.json(
        { ok: true, share: null },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (!isLibraryAssetVisibility(share.visibility)) {
      return NextResponse.json(
        { error: 'Invalid share visibility' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { ok: true, share },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    await captureError('Library asset share lookup failed', caughtError, {
      route: '/api/library/asset-share',
    });
    return NextResponse.json(
      { error: 'Failed to load asset share settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

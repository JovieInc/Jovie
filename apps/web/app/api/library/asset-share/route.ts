import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { isLibraryAssetVisibility } from '@/lib/library/asset-share';
import {
  ensureLibraryAssetShareSettings,
  getLibraryAssetShareForAsset,
  loadArtistHandleForProfile,
  updateLibraryAssetShareVisibility,
} from '@/lib/library/asset-share.server';

export const runtime = 'nodejs';

const updateSchema = z.object({
  profileId: z.string().uuid(),
  assetId: z.string().min(1),
  itemKind: z.enum(['release', 'merch', 'image', 'video', 'audio']),
  title: z.string().min(1),
  smartLinkPath: z.string().optional(),
  visibility: z.enum(['public', 'private']),
});

const ensureSchema = z.object({
  profileId: z.string().uuid(),
  assetId: z.string().min(1),
  itemKind: z.enum(['release', 'merch', 'image', 'video', 'audio']),
  title: z.string().min(1),
  smartLinkPath: z.string().optional(),
});

export async function PATCH(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, assetId, itemKind, title, smartLinkPath, visibility } =
      parsed.data;
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

    const share = await updateLibraryAssetShareVisibility({
      creatorProfileId: profileId,
      assetId,
      itemKind,
      title,
      smartLinkPath,
      visibility,
      artistHandle,
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
    const parsed = ensureSchema.safeParse(await request.json());
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

    const share = await ensureLibraryAssetShareSettings({
      creatorProfileId: profileId,
      assetId,
      itemKind,
      title,
      artistHandle,
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

    const share = await getLibraryAssetShareForAsset({
      creatorProfileId: profileId,
      assetId,
      artistHandle,
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

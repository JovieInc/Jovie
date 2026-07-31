import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  LIBRARY_PROFILE_ITEM_KINDS,
  LIBRARY_PROFILE_VISIBILITIES,
} from '@/lib/library/profile-visibility';
import { upsertLibraryProfileVisibility } from '@/lib/library/profile-visibility.server';

export const runtime = 'nodejs';

const updateSchema = z.object({
  profileId: z.string().uuid(),
  assetId: z.string().min(1),
  itemKind: z.enum(LIBRARY_PROFILE_ITEM_KINDS),
  profileVisibility: z.enum(LIBRARY_PROFILE_VISIBILITIES),
});

export async function PATCH(request: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, assetId, itemKind, profileVisibility } = parsed.data;
    const { profile } = await getSessionContext({
      clerkUserId: userId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile || profile.id !== profileId) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const savedVisibility = await upsertLibraryProfileVisibility({
      creatorProfileId: profileId,
      assetId,
      itemKind,
      profileVisibility,
    });
    await invalidateProfileCache(profile.usernameNormalized);

    return NextResponse.json(
      {
        ok: true,
        assetId,
        profileVisibility: savedVisibility,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    await captureError(
      'Library profile visibility update failed',
      caughtError,
      {
        route: '/api/library/profile-visibility',
      }
    );
    return NextResponse.json(
      { error: 'Failed to update profile visibility' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

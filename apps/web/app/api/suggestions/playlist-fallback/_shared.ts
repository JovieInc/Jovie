import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { getFeaturedPlaylistFallbackCandidate } from '@/lib/profile/featured-playlist-fallback';

const requestSchema = z.object({
  profileId: z.string().uuid(),
});

interface PlaylistFallbackRequestContext {
  readonly playlistId: string;
  readonly profileId: string;
  readonly settings: Record<string, unknown>;
  readonly candidate: NonNullable<
    ReturnType<typeof getFeaturedPlaylistFallbackCandidate>
  >;
  readonly usernameNormalized: string;
}

interface PlaylistFallbackMutationOptions {
  readonly request: Request;
  readonly params: Promise<{ id: string }>;
  readonly route: string;
  readonly errorMessage: string;
  readonly successMessage: string;
  readonly buildSettings: (
    context: PlaylistFallbackRequestContext
  ) => Record<string, unknown>;
}

type OwnedPlaylistFallbackProfile = Pick<
  PlaylistFallbackRequestContext,
  'profileId' | 'settings' | 'usernameNormalized'
>;

type InvalidRequestDetails = ReturnType<
  z.ZodError<{ profileId: string }>['flatten']
>;

function invalidRequestResponse(details: InvalidRequestDetails) {
  return NextResponse.json(
    {
      success: false,
      error: 'Invalid request',
      details,
    },
    { status: 400 }
  );
}

async function getOwnedPlaylistFallbackProfile(
  request: Request
): Promise<OwnedPlaylistFallbackProfile | NextResponse> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return invalidRequestResponse(parsed.error.flatten());
  }

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      clerkId: users.clerkId,
      settings: creatorProfiles.settings,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, parsed.data.profileId))
    .limit(1);

  if (!profile || profile.clerkId !== userId) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    );
  }

  return {
    profileId: profile.id,
    settings: (profile.settings ?? {}) as Record<string, unknown>,
    usernameNormalized: profile.usernameNormalized,
  };
}

export async function getPlaylistFallbackRequestContext(
  request: Request,
  params: Promise<{ id: string }>
): Promise<PlaylistFallbackRequestContext | NextResponse> {
  const { id: playlistId } = await params;
  const profile = await getOwnedPlaylistFallbackProfile(request);

  if (profile instanceof NextResponse) {
    return profile;
  }

  const { profileId, settings, usernameNormalized } = profile;
  const candidate = getFeaturedPlaylistFallbackCandidate(settings);

  if (candidate?.playlistId !== playlistId) {
    return NextResponse.json(
      { success: false, error: 'Playlist suggestion not found' },
      { status: 404 }
    );
  }

  return {
    playlistId,
    profileId,
    settings,
    candidate,
    usernameNormalized,
  };
}

export async function handlePlaylistFallbackMutation({
  request,
  params,
  route,
  errorMessage,
  successMessage,
  buildSettings,
}: PlaylistFallbackMutationOptions) {
  try {
    const context = await getPlaylistFallbackRequestContext(request, params);

    if (context instanceof NextResponse) {
      return context;
    }

    await db
      .update(creatorProfiles)
      .set({
        settings: buildSettings(context),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, context.profileId));

    await invalidateProfileCache(context.usernameNormalized);

    return NextResponse.json({
      success: true,
      playlistId: context.playlistId,
      message: successMessage,
    });
  } catch (error) {
    await captureError(errorMessage, error, { route });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ArtistTheme } from '@/components/profile/ArtistThemeProvider';
import { withDbSession } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { creatorProfiles } from '@/lib/db/schema';
import { parseJsonBody } from '@/lib/http/parse-json';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  try {
    const parsedBody = await parseJsonBody<{
      artistId?: string;
      theme?: ArtistTheme;
    } | null>(request, {
      route: 'POST /api/artist/theme',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.data;

    const artistId = body?.artistId;
    const theme = body?.theme;

    if (!artistId || !theme) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Validate theme
    const validThemes: ArtistTheme[] = ['light', 'dark', 'auto'];
    if (!validThemes.includes(theme)) {
      return NextResponse.json(
        { error: 'Invalid theme value' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return await withDbSession(async clerkUserId => {
      // Verify user owns the profile
      const profile = await verifyProfileOwnership(db, artistId, clerkUserId);
      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // Update the creator profile's theme preference
      const result = await db
        .update(creatorProfiles)
        .set({
          theme: { mode: theme },
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, artistId))
        .returning();

      if (result.length === 0) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      await invalidateProfileCache(result[0].usernameNormalized);

      return NextResponse.json(
        { success: true },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    console.error('Error in theme API:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

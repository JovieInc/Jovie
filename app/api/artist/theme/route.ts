import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ArtistTheme } from '@/components/profile/ArtistThemeProvider';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';

export async function POST(request: NextRequest) {
  try {
    const { artistId, theme } = await request.json();

    if (!artistId || !theme) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate theme
    const validThemes: ArtistTheme[] = ['light', 'dark', 'auto'];
    if (!validThemes.includes(theme)) {
      return NextResponse.json(
        { error: 'Invalid theme value' },
        { status: 400 }
      );
    }

    try {
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
          { status: 404 }
        );
      }

      // Invalidate cache for the updated profile
      await invalidateProfileCache(result[0].usernameNormalized);

      return NextResponse.json({ success: true });
    } catch (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to update theme' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in theme API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

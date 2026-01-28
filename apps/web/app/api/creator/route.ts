import { NextRequest, NextResponse } from 'next/server';
import { getCreatorProfileWithLinks } from '@/lib/db/queries';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Cache successful responses for 1 hour, allow stale-while-revalidate for 24 hours
// Consistent with [username]/page.tsx which uses 1-hour revalidation
const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
} as const;

// Username validation regex (alphanumeric, underscore, hyphen, 3-30 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

export async function GET(
  request: NextRequest,
  _context: { params: Promise<Record<string, never>> }
) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Validate username format to prevent injection attacks
    if (!USERNAME_REGEX.test(username)) {
      return NextResponse.json(
        {
          error:
            'Invalid username format. Must be 3-30 alphanumeric ' +
            'characters, underscores, or hyphens',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const profile = await getCreatorProfileWithLinks(username);

    if (!profile || !profile.isPublic) {
      return NextResponse.json(
        { error: 'Creator not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        id: profile.id,
        username: profile.username,
        usernameNormalized: profile.usernameNormalized,
        displayName: profile.displayName,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        creatorType: profile.creatorType,
        spotifyUrl: profile.spotifyUrl,
        appleMusicUrl: profile.appleMusicUrl,
        youtubeUrl: profile.youtubeUrl,
        spotifyId: profile.spotifyId,
        isPublic: Boolean(profile.isPublic),
        isVerified: Boolean(profile.isVerified),
        isClaimed: Boolean(profile.isClaimed),
        isFeatured: Boolean(profile.isFeatured),
        marketingOptOut: Boolean(profile.marketingOptOut),
        settings: profile.settings,
        theme: profile.theme,
        socialLinks: (profile.socialLinks ?? []).map(link => ({
          id: link.id,
          platform: link.platform,
          platformType: link.platformType,
          url: link.url,
          displayText: link.displayText,
          clicks: link.clicks,
          isActive: link.isActive,
          sortOrder: link.sortOrder,
        })),
      },
      { headers: PUBLIC_CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('Error fetching creator profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

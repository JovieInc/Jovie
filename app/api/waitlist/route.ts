import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, waitlistEntries } from '@/lib/db';
import { normalizeUrl } from '@/lib/utils/platform-detection';

/**
 * Platform detection for waitlist primary social URL
 * Maps common social media domains to platform identifiers
 */
function detectPlatformFromUrl(url: string): {
  platform: string;
  normalizedUrl: string;
} {
  const normalizedUrl = normalizeUrl(url);

  const platformPatterns: Array<{ pattern: RegExp; platform: string }> = [
    { pattern: /(?:www\.)?instagram\.com/i, platform: 'instagram' },
    { pattern: /(?:www\.)?tiktok\.com/i, platform: 'tiktok' },
    { pattern: /(?:www\.)?youtube\.com|youtu\.be/i, platform: 'youtube' },
    { pattern: /(?:twitter\.com|x\.com)/i, platform: 'x' },
    { pattern: /(?:www\.)?twitch\.tv/i, platform: 'twitch' },
    { pattern: /(?:linktr\.ee|linktree\.com)/i, platform: 'linktree' },
    { pattern: /(?:www\.)?facebook\.com/i, platform: 'facebook' },
    { pattern: /(?:www\.)?threads\.net/i, platform: 'threads' },
    { pattern: /(?:www\.)?snapchat\.com/i, platform: 'snapchat' },
  ];

  for (const { pattern, platform } of platformPatterns) {
    if (pattern.test(normalizedUrl)) {
      return { platform, normalizedUrl };
    }
  }

  return { platform: 'unknown', normalizedUrl };
}

/**
 * Normalize Spotify URL (minimal normalization)
 */
function normalizeSpotifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Ensure https and clean up the URL
    parsed.protocol = 'https:';
    // Remove tracking params
    const paramsToRemove = [
      'si',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'nd',
    ];
    paramsToRemove.forEach(param => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url;
  }
}

// Request body schema
const waitlistRequestSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  email: z.string().email('Invalid email address'),
  primarySocialUrl: z.string().url('Invalid URL format'),
  spotifyUrl: z.string().url('Invalid Spotify URL').optional().nullable(),
  heardAbout: z.string().max(1000).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate request body
    const parseResult = waitlistRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten().fieldErrors;
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    const { fullName, email, primarySocialUrl, spotifyUrl, heardAbout } =
      parseResult.data;

    // Detect platform and normalize primary social URL
    const { platform, normalizedUrl } = detectPlatformFromUrl(primarySocialUrl);

    // Normalize Spotify URL if provided
    const spotifyUrlNormalized = spotifyUrl
      ? normalizeSpotifyUrl(spotifyUrl)
      : null;

    // Insert waitlist entry
    await db.insert(waitlistEntries).values({
      fullName,
      email,
      primarySocialUrl,
      primarySocialPlatform: platform,
      primarySocialUrlNormalized: normalizedUrl,
      spotifyUrl: spotifyUrl ?? null,
      spotifyUrlNormalized,
      heardAbout: heardAbout ?? null,
      status: 'new',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Waitlist API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

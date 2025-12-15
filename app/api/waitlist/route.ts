import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, waitlistEntries } from '@/lib/db';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import { isSafeExternalUrl } from '@/lib/utils/url-encryption';

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
  primarySocialUrl: z
    .string()
    .max(2048)
    .url('Invalid URL format')
    .refine(value => isSafeExternalUrl(value), {
      message: 'Invalid URL format',
    }),
  spotifyUrl: z
    .string()
    .max(2048)
    .url('Invalid Spotify URL')
    .optional()
    .nullable()
    .refine(value => (value ? isSafeExternalUrl(value) : true), {
      message: 'Invalid Spotify URL',
    }),
  heardAbout: z.string().max(1000).optional().nullable(),
  selectedPlan: z.string().optional().nullable(), // free|pro|growth|branding
});

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // Validate request body
    const parseResult = waitlistRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten().fieldErrors;
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    const {
      fullName,
      email,
      primarySocialUrl,
      spotifyUrl,
      heardAbout,
      selectedPlan,
    } = parseResult.data;

    const primarySocialUrlTrimmed = primarySocialUrl.trim();
    const spotifyUrlTrimmed = spotifyUrl ? spotifyUrl.trim() : null;

    // Detect platform and normalize primary social URL
    const { platform, normalizedUrl } = detectPlatformFromUrl(
      primarySocialUrlTrimmed
    );

    // Normalize Spotify URL if provided
    const spotifyUrlNormalized = spotifyUrlTrimmed
      ? normalizeSpotifyUrl(spotifyUrlTrimmed)
      : null;

    // Insert waitlist entry
    await db.insert(waitlistEntries).values({
      fullName,
      email,
      primarySocialUrl: primarySocialUrlTrimmed,
      primarySocialPlatform: platform,
      primarySocialUrlNormalized: normalizedUrl,
      spotifyUrl: spotifyUrlTrimmed,
      spotifyUrlNormalized,
      heardAbout: heardAbout ?? null,
      selectedPlan: selectedPlan ?? null, // Quietly track pricing tier interest
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

/**
 * GET /api/suggestions
 *
 * Returns all pending profile suggestions for a creator profile:
 * - DSP artist matches (status = 'suggested')
 * - Social link suggestions (status = 'pending')
 * - Avatar candidates (when avatar is not locked by user)
 *
 * Results are returned in a unified format, sorted by type priority
 * (DSP matches first, then social links, then avatars) and by
 * confidence score descending within each group.
 *
 * Query params:
 * - profileId: Required - Creator profile ID
 *
 * Authentication: Required (creator must own the profile)
 */

import { auth } from '@clerk/nextjs/server';
import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  dspArtistMatches,
  socialLinkSuggestions,
} from '@/lib/db/schema/dsp-enrichment';
import {
  creatorAvatarCandidates,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';

// ============================================================================
// Types
// ============================================================================

export interface ProfileSuggestion {
  id: string;
  type: 'dsp_match' | 'social_link' | 'avatar';
  platform: string;
  platformLabel: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  externalUrl: string | null;
  confidence: number | null;
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'profileId is required' },
        { status: 400 }
      );
    }

    // Verify user owns this profile
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        clerkId: users.clerkId,
        avatarUrl: creatorProfiles.avatarUrl,
        avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (profile.clerkId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch all suggestion types in parallel
    const [dspMatches, socialSuggestions, avatarCandidates] = await Promise.all(
      [
        // DSP matches with status 'suggested'
        db
          .select({
            id: dspArtistMatches.id,
            providerId: dspArtistMatches.providerId,
            externalArtistName: dspArtistMatches.externalArtistName,
            externalArtistUrl: dspArtistMatches.externalArtistUrl,
            externalArtistImageUrl: dspArtistMatches.externalArtistImageUrl,
            confidenceScore: dspArtistMatches.confidenceScore,
          })
          .from(dspArtistMatches)
          .where(
            and(
              eq(dspArtistMatches.creatorProfileId, profileId),
              eq(dspArtistMatches.status, 'suggested')
            )
          )
          .orderBy(desc(dspArtistMatches.confidenceScore))
          .limit(20),

        // Social link suggestions with status 'pending'
        db
          .select({
            id: socialLinkSuggestions.id,
            platform: socialLinkSuggestions.platform,
            url: socialLinkSuggestions.url,
            username: socialLinkSuggestions.username,
            sourceProvider: socialLinkSuggestions.sourceProvider,
            confidenceScore: socialLinkSuggestions.confidenceScore,
          })
          .from(socialLinkSuggestions)
          .where(
            and(
              eq(socialLinkSuggestions.creatorProfileId, profileId),
              eq(socialLinkSuggestions.status, 'pending')
            )
          )
          .orderBy(desc(socialLinkSuggestions.confidenceScore))
          .limit(20),

        // Avatar candidates (only if avatar is not locked by user)
        profile.avatarLockedByUser
          ? Promise.resolve([])
          : db
              .select({
                id: creatorAvatarCandidates.id,
                sourcePlatform: creatorAvatarCandidates.sourcePlatform,
                avatarUrl: creatorAvatarCandidates.avatarUrl,
                confidenceScore: creatorAvatarCandidates.confidenceScore,
              })
              .from(creatorAvatarCandidates)
              .where(eq(creatorAvatarCandidates.creatorProfileId, profileId))
              .orderBy(desc(creatorAvatarCandidates.confidenceScore))
              .limit(10),
      ]
    );

    // Filter out avatar candidates that match the current profile avatar
    const filteredAvatars = avatarCandidates.filter(
      c => c.avatarUrl !== profile.avatarUrl
    );

    // Normalize into unified format
    const suggestions: ProfileSuggestion[] = [
      // DSP matches first
      ...dspMatches.map(match => ({
        id: match.id,
        type: 'dsp_match' as const,
        platform: match.providerId,
        platformLabel: formatProviderLabel(match.providerId),
        title: match.externalArtistName ?? 'Unknown Artist',
        subtitle: `on ${formatProviderLabel(match.providerId)}`,
        imageUrl: match.externalArtistImageUrl,
        externalUrl: match.externalArtistUrl,
        confidence: match.confidenceScore
          ? Number.parseFloat(match.confidenceScore)
          : null,
      })),

      // Social link suggestions
      ...socialSuggestions.map(suggestion => ({
        id: suggestion.id,
        type: 'social_link' as const,
        platform: suggestion.platform,
        platformLabel: formatPlatformLabel(suggestion.platform),
        title: suggestion.username ? `@${suggestion.username}` : suggestion.url,
        subtitle: `Found via ${formatProviderLabel(suggestion.sourceProvider)}`,
        imageUrl: null,
        externalUrl: suggestion.url,
        confidence: Number.parseFloat(suggestion.confidenceScore),
      })),

      // Avatar candidates last
      ...filteredAvatars.map(candidate => ({
        id: candidate.id,
        type: 'avatar' as const,
        platform: candidate.sourcePlatform,
        platformLabel: formatProviderLabel(candidate.sourcePlatform),
        title: 'Profile photo',
        subtitle: `From ${formatProviderLabel(candidate.sourcePlatform)}`,
        imageUrl: candidate.avatarUrl,
        externalUrl: null,
        confidence: Number.parseFloat(candidate.confidenceScore),
      })),
    ];

    return NextResponse.json({ success: true, suggestions });
  } catch (error) {
    await captureError('Suggestions fetch failed', error, {
      route: '/api/suggestions',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

const PROVIDER_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  deezer: 'Deezer',
  youtube_music: 'YouTube Music',
  tidal: 'Tidal',
  soundcloud: 'SoundCloud',
  amazon_music: 'Amazon Music',
  musicbrainz: 'MusicBrainz',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  twitter: 'Twitter/X',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
  twitch: 'Twitch',
  discord: 'Discord',
  bandcamp: 'Bandcamp',
  soundcloud: 'SoundCloud',
  website: 'Website',
};

function formatProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function formatPlatformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? PROVIDER_LABELS[platform] ?? platform;
}

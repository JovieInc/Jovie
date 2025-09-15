import { DesktopQrOverlayClient } from '@/components/profile/DesktopQrOverlayClient';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { StaticArtistPage } from '@/components/profile/StaticArtistPage';
import { PAGE_SUBTITLES } from '@/constants/app';
import { getCreatorProfileWithLinks } from '@/lib/db/queries';
import {
  CreatorProfile,
  convertCreatorProfileToArtist,
  LegacySocialLink,
} from '@/types/db';

// Use a client wrapper to avoid ssr:false in a Server Component

// Use centralized server helper for public data access

// Using CreatorProfile type and convertCreatorProfileToArtist utility from types/db.ts

// Cache the database query to prevent duplicate calls during page + metadata generation
const getCreatorProfile = cache(
  async (username: string): Promise<CreatorProfile | null> => {
    try {
      const profile = await getCreatorProfileWithLinks(username);

      if (!profile || !profile.isPublic) {
        return null;
      }

      // Convert Drizzle result to legacy format for compatibility
      return {
        id: profile.id,
        user_id: profile.userId,
        creator_type: profile.creatorType,
        username: profile.username,
        display_name: profile.displayName,
        bio: profile.bio,
        avatar_url: profile.avatarUrl,
        spotify_url: profile.spotifyUrl,
        apple_music_url: profile.appleMusicUrl,
        youtube_url: profile.youtubeUrl,
        spotify_id: profile.spotifyId,
        is_public: profile.isPublic,
        is_verified: profile.isVerified,
        is_claimed: profile.isClaimed,
        claim_token: profile.claimToken,
        claimed_at: profile.claimedAt?.toISOString() || null,
        settings: profile.settings,
        theme: profile.theme,
        is_featured: profile.isFeatured || false,
        marketing_opt_out: profile.marketingOptOut || false,
        profile_views: profile.profileViews || 0,
        username_normalized: profile.usernameNormalized,
        search_text:
          `${profile.displayName || ''} ${profile.username} ${profile.bio || ''}`
            .toLowerCase()
            .trim(),
        display_title: profile.displayName || profile.username,
        profile_completion_pct: 80, // Calculate based on filled fields
        created_at: profile.createdAt.toISOString(),
        updated_at: profile.updatedAt.toISOString(),
      } as CreatorProfile;
    } catch (error) {
      console.error('Error fetching creator profile:', error);
      return null;
    }
  }
);

// Cache function for social links from database
const getSocialLinks = cache(
  async (username: string): Promise<LegacySocialLink[]> => {
    try {
      const profile = await getCreatorProfileWithLinks(username);

      if (!profile || !profile.socialLinks) {
        return [];
      }

      // Convert Drizzle social links to legacy format
      return profile.socialLinks.map(link => ({
        id: link.id,
        artist_id: profile.id,
        platform: link.platform.toLowerCase(),
        url: link.url,
        clicks: link.clicks || 0,
        created_at: link.createdAt.toISOString(),
      }));
    } catch (error) {
      console.error('Error fetching social links:', error);
      return [];
    }
  }
);

interface Props {
  params: {
    username: string;
  };
  searchParams?: {
    mode?: 'profile' | 'listen' | 'tip';
  };
}

export default async function ArtistPage({ params, searchParams }: Props) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const { mode = 'profile' } = resolvedSearchParams || {};

  // Parallel data fetching - profile first, then social links
  const profile = await getCreatorProfile(username);

  if (!profile) {
    notFound();
  }

  // Convert our profile data to the Artist type expected by components
  const artist = convertCreatorProfileToArtist(profile);

  // Fetch social links from database
  const socialLinks = await getSocialLinks(username);

  // Determine subtitle based on mode
  const getSubtitle = (mode: string) => {
    switch (mode) {
      case 'listen':
        return PAGE_SUBTITLES.listen;
      case 'tip':
        return PAGE_SUBTITLES.tip;
      default:
        return PAGE_SUBTITLES.profile;
    }
  };

  // Show tip button when not in tip mode and artist has venmo
  const hasVenmoLink = socialLinks.some(link => link.platform === 'venmo');
  const showTipButton = mode !== 'tip' && hasVenmoLink;
  const showBackButton = mode !== 'profile';

  return (
    <>
      <StaticArtistPage
        mode={mode}
        artist={artist}
        socialLinks={socialLinks}
        subtitle={getSubtitle(mode)}
        showTipButton={showTipButton}
        showBackButton={showBackButton}
      />
      <DesktopQrOverlayClient handle={artist.handle} />
    </>
  );
}

// Generate metadata for the page
export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  const profile = await getCreatorProfile(username);

  if (!profile) {
    return {
      title: 'Profile Not Found',
      description: 'The requested profile could not be found.',
    };
  }

  const title = `${profile.display_name || profile.username} - Artist Profile`;
  const description = profile.bio
    ? `${profile.bio.slice(0, 160)}${profile.bio.length > 160 ? '...' : ''}`
    : `Check out ${profile.display_name || profile.username}'s artist profile on Jovie.`;

  return {
    title,
    description,
    // OpenGraph with optimized image
    openGraph: {
      title,
      description,
      images: profile.avatar_url
        ? [
            {
              url: profile.avatar_url,
              width: 400,
              height: 400,
              alt: `${profile.display_name || profile.username} profile picture`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
    },
  };
}

// Note: generateStaticParams removed to allow edge runtime
// Edge runtime provides better performance for dynamic profile pages

// Enable ISR with 30 minute revalidation for fresher content
export const revalidate = 1800;

// Temporarily disable edge runtime for debugging
// export const runtime = 'edge';

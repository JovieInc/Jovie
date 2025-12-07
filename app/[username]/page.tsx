import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { ClaimBanner } from '@/components/profile/ClaimBanner';
import { DesktopQrOverlayClient } from '@/components/profile/DesktopQrOverlayClient';
import { StaticArtistPage } from '@/components/profile/StaticArtistPage';
import { PAGE_SUBTITLES } from '@/constants/app';
import { toPublicContacts } from '@/lib/contacts/mapper';
import {
  getCreatorProfileWithLinks,
  incrementProfileViews,
} from '@/lib/db/queries';
import type { CreatorContact as DbCreatorContact } from '@/lib/db/schema';
import type { PublicContact } from '@/types/contacts';
import {
  CreatorProfile,
  convertCreatorProfileToArtist,
  LegacySocialLink,
} from '@/types/db';

export const runtime = 'edge';

// Use a client wrapper to avoid ssr:false in a Server Component

// Use centralized server helper for public data access

// Using CreatorProfile type and convertCreatorProfileToArtist utility from types/db.ts

// Cache the database query across requests with a short TTL to keep hot profiles sub-100ms.
// This helper returns both the legacy CreatorProfile and LegacySocialLink[] in one DB call.
const getProfileAndLinks = unstable_cache(
  async (
    username: string
  ): Promise<{
    profile: CreatorProfile | null;
    links: LegacySocialLink[];
    contacts: DbCreatorContact[];
    status: 'ok' | 'not_found' | 'error';
  }> => {
    try {
      const result = await getCreatorProfileWithLinks(username);

      if (!result || !result.isPublic) {
        return { profile: null, links: [], contacts: [], status: 'not_found' };
      }

      const profile: CreatorProfile = {
        id: result.id,
        user_id: result.userId,
        creator_type: result.creatorType,
        username: result.username,
        display_name: result.displayName,
        bio: result.bio,
        avatar_url: result.avatarUrl,
        spotify_url: result.spotifyUrl,
        apple_music_url: result.appleMusicUrl,
        youtube_url: result.youtubeUrl,
        spotify_id: result.spotifyId,
        is_public: !!result.isPublic,
        is_verified: !!result.isVerified,
        is_claimed: !!result.isClaimed,
        claim_token: result.claimToken,
        claimed_at: result.claimedAt?.toISOString() || null,
        settings: result.settings,
        theme: result.theme,
        is_featured: result.isFeatured || false,
        marketing_opt_out: result.marketingOptOut || false,
        profile_views: result.profileViews || 0,
        username_normalized: result.usernameNormalized,
        search_text:
          `${result.displayName || ''} ${result.username} ${result.bio || ''}`
            .toLowerCase()
            .trim(),
        display_title: result.displayName || result.username,
        profile_completion_pct: 80, // Calculate based on filled fields
        created_at: result.createdAt.toISOString(),
        updated_at: result.updatedAt.toISOString(),
      };

      const links: LegacySocialLink[] =
        result.socialLinks?.map(link => ({
          id: link.id,
          artist_id: result.id,
          platform: link.platform.toLowerCase(),
          url: link.url,
          clicks: link.clicks || 0,
          created_at: link.createdAt.toISOString(),
        })) ?? [];

      const contacts: DbCreatorContact[] = result.contacts ?? [];

      return { profile, links, contacts, status: 'ok' };
    } catch (error) {
      console.error('Error fetching creator profile:', error);
      return { profile: null, links: [], contacts: [], status: 'error' };
    }
  },
  // Key prefix stays stable; args are included in the cache key so each username gets its own entry.
  ['public-profile-v1'],
  { revalidate: 60 }
);

interface Props {
  params: {
    username: string;
  };
  searchParams?: {
    mode?: 'profile' | 'listen' | 'tip' | 'subscribe';
  };
}

export default async function ArtistPage({ params, searchParams }: Props) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const { mode = 'profile' } = resolvedSearchParams || {};

  const normalizedUsername = username.toLowerCase();
  const { profile, links, contacts, status } =
    await getProfileAndLinks(normalizedUsername);

  if (status === 'error') {
    return (
      <div className='px-4 py-8'>
        <ErrorBanner
          title='Profile is temporarily unavailable'
          description='We could not load this Jovie profile right now. Please refresh or try again in a few minutes.'
          actions={[
            { label: 'Try again', href: `/${normalizedUsername}` },
            { label: 'Go home', href: '/' },
          ]}
          testId='public-profile-error'
        />
      </div>
    );
  }

  if (!profile) {
    notFound();
  }

  // Track profile view (fire-and-forget, non-blocking)
  incrementProfileViews(normalizedUsername).catch(() => {
    // Fail silently, don't block page render
  });

  // Convert our profile data to the Artist type expected by components
  const artist = convertCreatorProfileToArtist(profile);

  // Social links loaded together with profile in a single cached helper
  const socialLinks = links;
  const publicContacts: PublicContact[] = toPublicContacts(
    contacts,
    artist.name
  );

  // Determine subtitle based on mode
  const getSubtitle = (mode: string) => {
    switch (mode) {
      case 'listen':
        return PAGE_SUBTITLES.listen;
      case 'tip':
        return PAGE_SUBTITLES.tip;
      case 'subscribe':
        return PAGE_SUBTITLES.subscribe;
      default:
        return PAGE_SUBTITLES.profile;
    }
  };

  // Show tip button when not in tip mode and artist has venmo
  const hasVenmoLink = socialLinks.some(link => link.platform === 'venmo');
  const showTipButton = mode !== 'tip' && hasVenmoLink;
  const showBackButton = mode !== 'profile';

  // Determine if we should show the claim banner
  // Show only for unclaimed profiles with a valid, non-expired claim token
  const showClaimBanner =
    !profile.is_claimed &&
    profile.claim_token &&
    !profile.claimed_at && // Not already claimed
    // Check token expiration if we have the data
    true; // Token expiration is checked server-side on claim

  return (
    <>
      {showClaimBanner && profile.claim_token && (
        <ClaimBanner
          claimToken={profile.claim_token}
          profileHandle={profile.username}
          displayName={profile.display_name || undefined}
        />
      )}
      <StaticArtistPage
        mode={mode}
        artist={artist}
        socialLinks={socialLinks}
        contacts={publicContacts}
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
  const { profile, status } = await getProfileAndLinks(username.toLowerCase());

  if (status === 'error') {
    return {
      title: 'Profile temporarily unavailable',
      description: 'We are working to restore this profile. Please try again.',
    };
  }

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

// Cache the full HTML at the edge for 60s to make repeat visits instant.
// The underlying DB query is also cached via unstable_cache with the same TTL.
// 404s are still rendered correctly on cache miss.
export const revalidate = 60;

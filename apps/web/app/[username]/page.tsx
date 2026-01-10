import { unstable_cache, unstable_noStore } from 'next/cache';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { ClaimBanner } from '@/components/profile/ClaimBanner';
import { DesktopQrOverlayClient } from '@/components/profile/DesktopQrOverlayClient';
import { StaticArtistPage } from '@/components/profile/StaticArtistPage';
import {
  AUDIENCE_IDENTIFIED_COOKIE,
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE,
  PAGE_SUBTITLES,
  PROFILE_URL,
} from '@/constants/app';
import { toPublicContacts } from '@/lib/contacts/mapper';
import {
  getCreatorProfileWithLinks,
  incrementProfileViews,
  isClaimTokenValidForProfile,
} from '@/lib/db/queries';
import type { CreatorContact as DbCreatorContact } from '@/lib/db/schema';
import { STATSIG_FLAGS } from '@/lib/flags';
import { checkGateForUser } from '@/lib/flags/server';
import { getTopProfilesForStaticGeneration } from '@/lib/services/profile';
import type { PublicContact } from '@/types/contacts';
import {
  CreatorProfile,
  convertCreatorProfileToArtist,
  LegacySocialLink,
} from '@/types/db';

// Note: runtime = 'edge' removed for cacheComponents compatibility
// Edge runtime is incompatible with Cache Components
// Use Node runtime for cache components support

// Use a client wrapper to avoid ssr:false in a Server Component

// Use centralized server helper for public data access

// Using CreatorProfile type and convertCreatorProfileToArtist utility from types/db.ts

// This helper returns both the legacy CreatorProfile and LegacySocialLink[] in one DB call.
const fetchProfileAndLinks = async (
  username: string
): Promise<{
  profile: CreatorProfile | null;
  links: LegacySocialLink[];
  contacts: DbCreatorContact[];
  creatorIsPro: boolean;
  creatorClerkId: string | null;
  status: 'ok' | 'not_found' | 'error';
}> => {
  try {
    const result = await getCreatorProfileWithLinks(username);

    if (!result || !result.isPublic) {
      return {
        profile: null,
        links: [],
        contacts: [],
        creatorIsPro: false,
        creatorClerkId: null,
        status: 'not_found',
      };
    }

    const creatorIsPro = Boolean(result.userIsPro);
    const creatorClerkId =
      typeof result.userClerkId === 'string' ? result.userClerkId : null;

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
      claim_token: null,
      claimed_at: null,
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

    return {
      profile,
      links,
      contacts,
      creatorIsPro,
      creatorClerkId,
      status: 'ok',
    };
  } catch (error) {
    console.error('Error fetching creator profile:', error);
    return {
      profile: null,
      links: [],
      contacts: [],
      creatorIsPro: false,
      creatorClerkId: null,
      status: 'error',
    };
  }
};

// Cache public profile reads across requests; tags keep updates fast and precise.
// Using unstable_cache instead of 'use cache' due to cacheComponents incompatibility
const getCachedProfileAndLinks = async (username: string) => {
  return unstable_cache(
    async () => fetchProfileAndLinks(username),
    [`public-profile-${username}`],
    {
      tags: ['public-profile', `public-profile:${username}`],
      revalidate: 3600, // 1 hour
    }
  )();
};

// Memoize per-request to avoid duplicate DB work between generateMetadata and page render.
const getProfileAndLinks = cache(
  async (username: string, options?: { forceNoStore?: boolean }) => {
    const normalizedUsername = username.toLowerCase();

    if (options?.forceNoStore) {
      unstable_noStore();
      return fetchProfileAndLinks(normalizedUsername);
    }

    return getCachedProfileAndLinks(normalizedUsername);
  }
);

interface Props {
  params: {
    username: string;
  };
  searchParams?: {
    mode?: 'profile' | 'listen' | 'tip' | 'subscribe';
    claim_token?: string;
  };
}

export default async function ArtistPage({ params, searchParams }: Props) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const { mode = 'profile', claim_token: claimTokenParam } =
    resolvedSearchParams || {};

  if (claimTokenParam) {
    unstable_noStore();
  }

  const cookieStore = await cookies();
  const isIdentified =
    cookieStore.get(AUDIENCE_IDENTIFIED_COOKIE)?.value === '1';
  const spotifyPreferred =
    cookieStore.get(AUDIENCE_SPOTIFY_PREFERRED_COOKIE)?.value === '1';

  const normalizedUsername = username.toLowerCase();
  const { profile, links, contacts, status, creatorIsPro, creatorClerkId } =
    await getProfileAndLinks(normalizedUsername, {
      forceNoStore: Boolean(claimTokenParam),
    });

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

  const dynamicOverrideEnabled = creatorClerkId
    ? await checkGateForUser(STATSIG_FLAGS.DYNAMIC_ENGAGEMENT, {
        userID: creatorClerkId,
      })
    : false;

  const dynamicEnabled = creatorIsPro || dynamicOverrideEnabled;

  const primaryAction = dynamicEnabled && isIdentified ? 'listen' : 'subscribe';
  const effectiveSpotifyPreferred = dynamicEnabled ? spotifyPreferred : false;

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

  // Show tip button only in profile/default mode and when artist has venmo
  const hasVenmoLink = socialLinks.some(link => link.platform === 'venmo');
  const showTipButton = mode === 'profile' && hasVenmoLink;
  const showBackButton = mode !== 'profile';

  // Determine if we should show the claim banner
  // Show only when a claim token is present in the URL and matches the profile's token
  let showClaimBanner = false;
  if (typeof claimTokenParam === 'string' && claimTokenParam.length > 0) {
    const claimToken = claimTokenParam;
    if (!profile.is_claimed) {
      showClaimBanner = await isClaimTokenValidForProfile({
        username: normalizedUsername,
        claimToken,
      });
    }
  }

  return (
    <>
      {showClaimBanner && (
        <ClaimBanner
          claimToken={claimTokenParam!}
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
        primaryAction={primaryAction}
        spotifyPreferred={effectiveSpotifyPreferred}
        enableDynamicEngagement={dynamicEnabled}
      />
      <DesktopQrOverlayClient handle={artist.handle} />
    </>
  );
}

// Generate metadata for the page
export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  const { profile, status } = await getProfileAndLinks(username);

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

  const profileUrl = `${PROFILE_URL}/${profile.username}`;

  return {
    title,
    description,
    metadataBase: new URL(PROFILE_URL),
    alternates: {
      canonical: profileUrl,
    },
    openGraph: {
      title,
      description,
      url: profileUrl,
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

// ISR: Revalidate public profiles every hour
// This works with generateStaticParams to pre-render top profiles at build time
// and revalidate them in the background on subsequent requests
export const revalidate = 3600; // 1 hour

// Pre-render top profiles at build time for instant TTFB
// Featured and claimed profiles are prioritized
export async function generateStaticParams(): Promise<{ username: string }[]> {
  try {
    const profiles = await getTopProfilesForStaticGeneration(100);
    return profiles;
  } catch (error) {
    console.error('[generateStaticParams] Failed to fetch profiles:', error);
    // Return empty array on error - pages will be generated on-demand
    return [];
  }
}

import { type Metadata } from 'next';
import { unstable_cache, unstable_noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { cache } from 'react';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { ClaimBanner } from '@/components/profile/ClaimBanner';
import { DesktopQrOverlayClient } from '@/components/profile/DesktopQrOverlayClient';
import { ProfileViewTracker } from '@/components/profile/ProfileViewTracker';
import { StaticArtistPage } from '@/components/profile/StaticArtistPage';
import { ConsentBanner, JoviePixel } from '@/components/tracking';
import { PAGE_SUBTITLES, PROFILE_URL } from '@/constants/app';
import { toPublicContacts } from '@/lib/contacts/mapper';
import type {
  CreatorContact as DbCreatorContact,
  DiscogRelease,
} from '@/lib/db/schema';
import { captureError, captureWarning } from '@/lib/error-tracking';
import {
  getProfileWithLinks as getCreatorProfileWithLinks,
  getTopProfilesForStaticGeneration,
  isClaimTokenValid,
} from '@/lib/services/profile';
import type { PublicContact } from '@/types/contacts';
import {
  CreatorProfile,
  convertCreatorProfileToArtist,
  LegacySocialLink,
} from '@/types/db';

/**
 * Generate JSON-LD structured data for artist profile SEO.
 * Implements schema.org MusicGroup and BreadcrumbList schemas.
 */
function generateProfileStructuredData(
  profile: CreatorProfile,
  genres: string[] | null,
  socialLinks: LegacySocialLink[]
) {
  const artistName = profile.display_name || profile.username;
  const profileUrl = `${PROFILE_URL}/${profile.username}`;
  const imageUrl = profile.avatar_url || `${PROFILE_URL}/og/default.png`;

  // Extract social profile URLs for sameAs
  const socialUrls = socialLinks
    .filter(link =>
      [
        'instagram',
        'twitter',
        'facebook',
        'youtube',
        'tiktok',
        'spotify',
      ].includes(link.platform.toLowerCase())
    )
    .map(link => link.url);

  // Add DSP profile URLs if available
  if (profile.spotify_url) socialUrls.push(profile.spotify_url);
  if (profile.apple_music_url) socialUrls.push(profile.apple_music_url);
  if (profile.youtube_url) socialUrls.push(profile.youtube_url);

  // Remove duplicates
  const uniqueSocialUrls = [...new Set(socialUrls)];

  const musicGroupSchema = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    '@id': `${profileUrl}#musicgroup`,
    name: artistName,
    description: profile.bio || `Music by ${artistName}`,
    url: profileUrl,
    image: imageUrl,
    sameAs: uniqueSocialUrls,
    genre: genres && genres.length > 0 ? genres : ['Music'],
    ...(profile.is_verified && {
      additionalProperty: {
        '@type': 'PropertyValue',
        name: 'verified',
        value: true,
      },
    }),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: PROFILE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: artistName,
        item: profileUrl,
      },
    ],
  };

  return { musicGroupSchema, breadcrumbSchema };
}

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
  genres: string[] | null;
  latestRelease: DiscogRelease | null;
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
        genres: null,
        latestRelease: null,
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

    // Latest release is now fetched in parallel with profile data
    const latestRelease = result.latestRelease ?? null;

    return {
      profile,
      links,
      contacts,
      creatorIsPro,
      creatorClerkId,
      genres: result.genres ?? null,
      latestRelease,
      status: 'ok',
    };
  } catch (error) {
    await captureError('Error fetching creator profile', error, {
      username,
      route: '/[username]',
    });
    return {
      profile: null,
      links: [],
      contacts: [],
      creatorIsPro: false,
      creatorClerkId: null,
      genres: null,
      latestRelease: null,
      status: 'error',
    };
  }
};

// Cache public profile reads across requests; tags keep updates fast and precise.
// Using unstable_cache instead of 'use cache' due to cacheComponents incompatibility
// Wrapped in try-catch to handle cache layer failures gracefully
const getCachedProfileAndLinks = async (username: string) => {
  try {
    return await unstable_cache(
      async () => fetchProfileAndLinks(username),
      [`public-profile-${username}`],
      {
        tags: ['public-profile', `public-profile:${username}`],
        revalidate: 3600, // 1 hour
      }
    )();
  } catch (error) {
    // Cache layer failure - fall back to direct fetch
    captureWarning('[profile] Cache layer failed, using direct fetch', {
      error,
      username,
    });
    return fetchProfileAndLinks(username);
  }
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
  params: Promise<{
    username: string;
  }>;
  searchParams?: Promise<{
    mode?: 'profile' | 'listen' | 'tip' | 'subscribe';
    claim_token?: string;
  }>;
}

/**
 * Non-blocking feature flag check with timeout.
 * Returns false if the check takes too long, avoiding render delays.
 */
export default async function ArtistPage({
  params,
  searchParams,
}: Readonly<Props>) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const { mode = 'profile', claim_token: claimTokenParam } =
    resolvedSearchParams || {};

  if (claimTokenParam) {
    unstable_noStore();
  }

  // NOTE: Cookie access removed from server component to enable static optimization.
  // User-specific behavior (isIdentified, spotifyPreferred) is now handled client-side
  // via the StaticArtistPage component which reads cookies on hydration.

  const normalizedUsername = username.toLowerCase();

  // Run profile fetch and claim token validation in parallel when claim token is present
  // This eliminates the sequential DB call that was blocking rendering
  const hasClaimToken =
    typeof claimTokenParam === 'string' && claimTokenParam.length > 0;

  const [profileResult, claimTokenValidResult] = await Promise.all([
    getProfileAndLinks(normalizedUsername, {
      forceNoStore: hasClaimToken,
    }),
    // Only validate claim token if present (returns false immediately otherwise)
    hasClaimToken
      ? isClaimTokenValid(normalizedUsername, claimTokenParam)
      : Promise.resolve(false),
  ]);

  const {
    profile,
    links,
    contacts,
    genres,
    status,
    creatorIsPro,
    latestRelease,
  } = profileResult;

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

  // Convert our profile data to the Artist type expected by components
  const artist = convertCreatorProfileToArtist(profile);

  // Non-blocking feature flag check with timeout
  const dynamicEnabled = creatorIsPro;

  // Social links loaded together with profile in a single cached helper
  const socialLinks = links;
  const publicContacts: PublicContact[] = toPublicContacts(
    contacts,
    artist.name
  );

  // Determine subtitle based on mode
  const getSubtitle = (currentMode: string) => {
    switch (currentMode) {
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
  // The claim token validation was already done in parallel with profile fetch above
  const showClaimBanner =
    hasClaimToken && !profile.is_claimed && claimTokenValidResult;

  // Generate structured data for SEO
  const { musicGroupSchema, breadcrumbSchema } = generateProfileStructuredData(
    profile,
    genres,
    socialLinks
  );

  return (
    <>
      {/* JSON-LD Structured Data for SEO */}
      <Script
        id='musicgroup-schema'
        type='application/ld+json'
        strategy='afterInteractive'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data
        dangerouslySetInnerHTML={{ __html: JSON.stringify(musicGroupSchema) }}
      />
      <Script
        id='breadcrumb-schema'
        type='application/ld+json'
        strategy='afterInteractive'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <ProfileViewTracker handle={artist.handle} artistId={artist.id} />
      {/* Server-side pixel tracking */}
      <JoviePixel profileId={profile.id} />
      <ConsentBanner />
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
        enableDynamicEngagement={dynamicEnabled}
        latestRelease={latestRelease}
      />
      <DesktopQrOverlayClient handle={artist.handle} />
    </>
  );
}

// Generate metadata for the page with comprehensive SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const { profile, genres, status } = await getProfileAndLinks(username);

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

  const artistName = profile.display_name || profile.username;
  const profileUrl = `${PROFILE_URL}/${profile.username}`;

  // Build SEO-optimized title with genre context if available
  const genreContext =
    genres && genres.length > 0
      ? ` | ${genres.slice(0, 2).join(', ')} Artist`
      : '';
  const title = `${artistName}${genreContext} - Music & Links`;

  // Build rich description with bio and genre information
  const bioSnippet = profile.bio
    ? profile.bio.slice(0, 120).trim()
    : `Discover ${artistName}'s music`;
  const genreText =
    genres && genres.length > 0
      ? `. ${genres.slice(0, 3).join(', ')} artist`
      : '';
  const description = `${bioSnippet}${profile.bio && profile.bio.length > 120 ? '...' : ''}${genreText}. Stream on Spotify, Apple Music & more.`;

  // Build dynamic keywords based on artist data
  const baseKeywords = [
    artistName,
    `${artistName} music`,
    `${artistName} songs`,
    `${artistName} artist`,
    'music artist',
    'streaming links',
    'spotify',
    'apple music',
  ];
  const genreKeywords = genres?.slice(0, 5) ?? [];
  const keywords = [...baseKeywords, ...genreKeywords];

  return {
    title,
    description,
    keywords,
    authors: [{ name: artistName }],
    creator: artistName,
    metadataBase: new URL(PROFILE_URL),
    alternates: {
      canonical: profileUrl,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      type: 'profile',
      title: `${artistName} - Artist Profile`,
      description,
      url: profileUrl,
      siteName: 'Jovie',
      locale: 'en_US',
      images: profile.avatar_url
        ? [
            {
              url: profile.avatar_url,
              width: 400,
              height: 400,
              alt: `${artistName} profile picture`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${artistName} - Artist Profile`,
      description,
      creator: '@jovieapp',
      site: '@jovieapp',
      images: profile.avatar_url
        ? [
            {
              url: profile.avatar_url,
              alt: `${artistName} profile picture`,
            },
          ]
        : undefined,
    },
    other: {
      'music:musician': artistName,
      ...(genres &&
        genres.length > 0 && {
          'music:genre': genres.slice(0, 3).join(', '),
        }),
      ...(profile.is_verified && { 'profile:verified': 'true' }),
    },
  };
}

// ISR: Revalidate public profiles every hour
// This works with generateStaticParams to pre-render top profiles at build time
// and revalidate them in the background on subsequent requests
export const revalidate = 3600; // 1 hour

// Pre-render top profiles at build time for instant TTFB
// Featured and claimed profiles are prioritized, ordered by view count
// Expanded to 250 profiles (from 100) for better coverage of high-traffic pages
export async function generateStaticParams(): Promise<{ username: string }[]> {
  try {
    const profiles = await getTopProfilesForStaticGeneration(250);
    return profiles;
  } catch (error) {
    console.error('[generateStaticParams] Failed to fetch profiles:', error);
    // Return empty array on error - pages will be generated on-demand
    return [];
  }
}

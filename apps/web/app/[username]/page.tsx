import { type Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { DesktopQrOverlayClient } from '@/components/profile/DesktopQrOverlayClient';
import { buildAvatarSizes } from '@/components/profile/ProfilePhotoContextMenu';
import { ProfileViewTracker } from '@/components/profile/ProfileViewTracker';
import { StaticArtistPage } from '@/components/profile/StaticArtistPage';
import { JoviePixel } from '@/components/tracking';
import { BASE_URL, PAGE_SUBTITLES } from '@/constants/app';
import { toPublicContacts } from '@/lib/contacts/mapper';
// eslint-disable-next-line no-restricted-imports -- Schema barrel import needed for types
import type {
  CreatorContact as DbCreatorContact,
  DiscogRelease,
} from '@/lib/db/schema';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getProfileWithLinks as getCreatorProfileWithLinks } from '@/lib/services/profile';
import { toISOStringSafe } from '@/lib/utils/date';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
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
  links: LegacySocialLink[]
) {
  const artistName = profile.display_name || profile.username;
  const profileUrl = `${BASE_URL}/${profile.username}`;
  const imageUrl = profile.avatar_url || `${BASE_URL}/og/default.png`;

  // Extract social profile URLs for sameAs
  const socialUrls = links
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
        item: BASE_URL,
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

/**
 * Calculate profile completion percentage based on filled fields.
 * Fields: displayName, bio, avatarUrl, spotifyUrl, appleMusicUrl, youtubeUrl,
 * and having at least one social link.
 */
function calculateProfileCompletion(result: {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  youtubeUrl?: string | null;
  socialLinks?: unknown[] | null;
}): number {
  const fields = [
    result.displayName,
    result.bio,
    result.avatarUrl,
    result.spotifyUrl || result.appleMusicUrl || result.youtubeUrl, // any DSP link
    result.socialLinks && result.socialLinks.length > 0 ? true : null,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

/** Fetches profile and social links in a single database call. */
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

    // Use truthy check (not strict equality) for isPublic because the neon-http
    // driver may return boolean columns as non-boolean truthy values (e.g., 1, "t")
    // in edge cases — same class of issue as dates-as-strings (see JOVIE-WEB-6X).
    if (!result || !result.isPublic) {
      // Log when a profile query returns not_found to aid debugging production 404s
      void captureWarning('[profile] Public profile not found or not public', {
        username,
        profileExists: !!result,
        isPublicValue: result ? String(result.isPublic) : 'n/a',
        isPublicType: result ? typeof result.isPublic : 'n/a',
      });
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
      profile_completion_pct: calculateProfileCompletion(result),
      created_at: toISOStringSafe(result.createdAt),
      updated_at: toISOStringSafe(result.updatedAt),
    };

    const links: LegacySocialLink[] =
      result.socialLinks?.map(link => ({
        id: link.id,
        artist_id: result.id,
        platform: link.platform.toLowerCase(),
        url: link.url,
        clicks: link.clicks || 0,
        created_at: toISOStringSafe(link.createdAt),
      })) ?? [];

    // If the artist has a venmoHandle on their profile but no venmo social link,
    // inject a synthetic venmo link so tipping works on the public profile page
    const hasVenmoSocialLink = links.some(l => l.platform === 'venmo');
    if (!hasVenmoSocialLink && result.venmoHandle) {
      const handle = result.venmoHandle.replace(/^@/, '');
      links.push({
        id: `venmo-${result.id}`,
        artist_id: result.id,
        platform: 'venmo',
        url: `https://venmo.com/${encodeURIComponent(handle)}`,
        clicks: 0,
        created_at: toISOStringSafe(result.createdAt),
      });
    }

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
// IMPORTANT: Skip caching in test/development to avoid stale data in E2E tests
// IMPORTANT: Only cache successful (status: 'ok') results. Caching not_found/error
// results causes stale 404s that persist for up to 1 hour when a profile becomes
// public (e.g., after onboarding completes for a waitlist profile).

/** Custom error to pass non-cacheable results without embedding PII in error message. */
class NoCacheError extends Error {
  readonly data: Awaited<ReturnType<typeof fetchProfileAndLinks>>;
  constructor(data: Awaited<ReturnType<typeof fetchProfileAndLinks>>) {
    super('NoCacheError');
    this.name = 'NoCacheError';
    this.data = data;
  }
}

const getCachedProfileAndLinks = async (username: string) => {
  // Skip Next.js cache in test/development environments
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    return fetchProfileAndLinks(username);
  }

  try {
    const result = await unstable_cache(
      async () => {
        const data = await fetchProfileAndLinks(username);
        // Only cache successful results to avoid stale 404s
        // Non-ok results are passed through NoCacheError to avoid double-fetch
        if (data.status !== 'ok') {
          throw new NoCacheError(data);
        }
        return data;
      },
      [`public-profile-${username}`],
      {
        tags: ['public-profile', `public-profile:${username}`],
        revalidate: 3600, // 1 hour
      }
    )();
    return result;
  } catch (error) {
    // If the error is our custom error for non-cacheable results, return embedded data
    if (error instanceof NoCacheError) {
      return error.data;
    }
    // Cache layer failure - fall back to direct fetch
    void captureWarning('[profile] Cache layer failed, using direct fetch', {
      error,
      username,
    });
    return fetchProfileAndLinks(username);
  }
};

// Memoize per-request to avoid duplicate DB work between generateMetadata and page render.
// Now always uses unstable_cache (1-hour TTL) — claim logic moved to /[username]/claim
const getProfileAndLinks = cache(async (username: string) => {
  return getCachedProfileAndLinks(username.toLowerCase());
});

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams?: Promise<{
    mode?: 'profile' | 'listen' | 'tip' | 'subscribe';
  }>;
}

export default async function ArtistPage({
  params,
  searchParams,
}: Readonly<Props>) {
  const { username } = await params;

  // Early reject obviously invalid usernames before hitting the database
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const { mode = 'profile' } = resolvedSearchParams || {};

  // NOTE: Cookie access removed from server component to enable static optimization.
  // User-specific behavior (isIdentified, spotifyPreferred) is now handled client-side
  // via the StaticArtistPage component which reads cookies on hydration.

  const profileResult = await getProfileAndLinks(username);

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
            { label: 'Try again', href: `/${username.toLowerCase()}` },
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

  const publicContacts: PublicContact[] = toPublicContacts(
    contacts,
    artist.name
  );

  const subtitle = PAGE_SUBTITLES[mode] ?? PAGE_SUBTITLES.profile;

  // Show tip button only in profile/default mode and when artist has venmo
  const hasVenmoLink = links.some(link => link.platform === 'venmo');
  const showTipButton = mode === 'profile' && hasVenmoLink;
  const showBackButton = mode !== 'profile';

  // Read profile photo download settings
  const profileSettings =
    (profile.settings as Record<string, unknown> | null) ?? {};
  const allowPhotoDownloads =
    profileSettings.allowProfilePhotoDownloads === true;
  const photoDownloadSizes = buildAvatarSizes(
    profileSettings.avatarSizes as Record<string, string> | null | undefined,
    profile.avatar_url
  );

  // Generate structured data for SEO
  const { musicGroupSchema, breadcrumbSchema } = generateProfileStructuredData(
    profile,
    genres,
    links
  );

  return (
    <>
      {/* JSON-LD Structured Data for SEO — rendered inline for crawler visibility */}
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data, safe-serialized
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify(musicGroupSchema),
        }}
      />
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data, safe-serialized
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify(breadcrumbSchema),
        }}
      />

      <ProfileViewTracker handle={artist.handle} artistId={artist.id} />
      {/* Server-side pixel tracking */}
      <JoviePixel profileId={profile.id} />
      <StaticArtistPage
        mode={mode}
        artist={artist}
        socialLinks={links}
        contacts={publicContacts}
        subtitle={subtitle}
        showTipButton={showTipButton}
        showBackButton={showBackButton}
        enableDynamicEngagement={creatorIsPro}
        latestRelease={latestRelease}
        photoDownloadSizes={photoDownloadSizes}
        allowPhotoDownloads={allowPhotoDownloads}
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
  const profileUrl = `${BASE_URL}/${profile.username}`;

  // Build SEO-optimized title with genre context if available
  const genreContext =
    genres && genres.length > 0
      ? ` | ${genres.slice(0, 2).join(', ')} Artist`
      : '';
  const title = `${artistName}${genreContext} - Music & Links`;

  // Build rich description with bio and genre information
  const bioSnippet = profile.bio
    ? profile.bio.slice(0, 155).trim()
    : `Discover ${artistName}'s music`;
  const genreText =
    genres && genres.length > 0
      ? `. ${genres.slice(0, 3).join(', ')} artist`
      : '';
  const description = `${bioSnippet}${profile.bio && profile.bio.length > 155 ? '...' : ''}${genreText}. Stream on Spotify, Apple Music & more.`;

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
    metadataBase: new URL(BASE_URL),
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
      images: [
        {
          url: profile.avatar_url || `${BASE_URL}/og/default.png`,
          width: profile.avatar_url ? 400 : 1200,
          height: profile.avatar_url ? 400 : 630,
          alt: `${artistName} profile picture`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${artistName} - Artist Profile`,
      description,
      creator: '@jovieapp',
      site: '@jovieapp',
      images: [
        {
          url: profile.avatar_url || `${BASE_URL}/og/default.png`,
          alt: `${artistName} profile picture`,
        },
      ],
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

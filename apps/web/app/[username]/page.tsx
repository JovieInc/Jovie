import { type Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { loadUpcomingTourDates } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { BASE_URL } from '@/constants/app';
import { ErrorBanner } from '@/features/feedback/ErrorBanner';
import { ClaimBanner } from '@/features/profile/ClaimBanner';
import type { ProfileMode } from '@/features/profile/contracts';
import { DesktopQrOverlayClient } from '@/features/profile/DesktopQrOverlayClient';
import { ProfileViewTracker } from '@/features/profile/ProfileViewTracker';
import {
  getProfileMode,
  getProfileModeSubtitle,
} from '@/features/profile/registry';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import { JoviePixel } from '@/features/tracking';
import { getClientTrackingToken } from '@/lib/analytics/tracking-token';
import { toPublicContacts } from '@/lib/contacts/mapper';
// eslint-disable-next-line no-restricted-imports -- Schema barrel import needed for types
import type {
  CreatorContact as DbCreatorContact,
  DiscogRelease,
} from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import {
  checkGate,
  FEATURE_FLAG_KEYS,
  getSubscribeCTAVariant,
} from '@/lib/feature-flags/server';
import { calculateRequiredProfileCompletion } from '@/lib/profile/completion';
import { getProfileOgImageUrl } from '@/lib/profile/og-image';
import { isShopEnabled } from '@/lib/profile/shop-settings';
import {
  getProfileWithLinks as getCreatorProfileWithLinks,
  getProfileWithUser as getCreatorProfileWithUser,
} from '@/lib/services/profile';
import { isDspPlatform } from '@/lib/services/social-links/types';
import { buildAvatarSizes } from '@/lib/utils/avatar-sizes';
import { toISOStringOrFallback, toISOStringSafe } from '@/lib/utils/date';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import type { PublicContact } from '@/types/contacts';
import {
  CreatorProfile,
  type CreatorType,
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

function calculateProfileCompletion(result: {
  displayName?: string | null;
  avatarUrl?: string | null;
  userEmail?: string | null;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  youtubeUrl?: string | null;
  socialLinks?: Array<{
    platform?: string | null;
    platformType?: string | null;
  }> | null;
}): number {
  const hasMusicLinks =
    Boolean(result.spotifyUrl || result.appleMusicUrl || result.youtubeUrl) ||
    Boolean(
      result.socialLinks?.some(link => {
        const platform = link.platform?.toLowerCase();
        return (
          link.platformType === 'dsp' ||
          (typeof platform === 'string' && isDspPlatform(platform))
        );
      })
    );

  return calculateRequiredProfileCompletion({
    displayName: result.displayName,
    avatarUrl: result.avatarUrl,
    email: result.userEmail,
    hasMusicLinks,
  }).percentage;
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
      // Expected 404 — profile not found or not public. No Sentry capture needed;
      // these are normal from typos, crawlers, and enumeration traffic (JOV-1321).
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
      apple_music_id: result.appleMusicId ?? null,
      youtube_music_id: result.youtubeMusicId ?? null,
      deezer_id: result.deezerId ?? null,
      tidal_id: result.tidalId ?? null,
      soundcloud_id: result.soundcloudId ?? null,
      is_public: !!result.isPublic,
      is_verified: !!result.isVerified,
      is_claimed: !!result.isClaimed,
      claim_token: null, // Hash stored in DB; raw token never exposed on public pages
      claimed_at: null,
      settings: result.settings,
      theme: result.theme,
      location: result.location ?? null,
      active_since_year: result.activeSinceYear ?? null,
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
// IMPORTANT: Successful profile payloads get long TTL. not_found gets a short TTL
// to reduce repeated probe traffic while still allowing new profiles to appear fast.
// error responses are never cached.

const PROFILE_SUCCESS_CACHE_TTL_SECONDS = 3600; // 1 hour

/**
 * Cached profile fetcher. Only caches successful (status: 'ok') results.
 *
 * IMPORTANT: We intentionally do NOT use a negative cache (caching not_found
 * results). The previous negative cache pattern used thrown errors to signal
 * "don't cache this" to unstable_cache, but unstable_cache treats background
 * revalidation failures by serving the stale value — causing not_found results
 * to become permanently sticky even after the profile becomes available.
 *
 * Instead, not_found and error results are always fetched fresh. The Redis
 * cache in getProfileWithLinks already provides request-level deduplication.
 */
const getCachedProfileAndLinks = async (username: string) => {
  // Skip Next.js cache in test/development environments
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    return fetchProfileAndLinks(username);
  }

  // Fetch the profile data
  const data = await fetchProfileAndLinks(username);

  // Only cache successful results — not_found and error are always fresh
  if (data.status !== 'ok') {
    return data;
  }

  // Cache the successful result with unstable_cache for 1 hour
  try {
    const cachedFetch = unstable_cache(
      async () => {
        // Re-fetch on revalidation
        const freshData = await fetchProfileAndLinks(username);
        if (freshData.status !== 'ok') {
          // Profile was removed or errored — don't cache, throw to prevent
          // stale success from being served
          throw new Error(`Profile ${username} no longer available`);
        }
        return freshData;
      },
      [`public-profile-${username}`],
      {
        tags: ['profiles-all', `profile:${username}`],
        revalidate: PROFILE_SUCCESS_CACHE_TTL_SECONDS,
      }
    );
    return await cachedFetch();
  } catch {
    // Cache layer failure — return the fresh data we already have
    return data;
  }
};

// Memoize per-request to avoid duplicate DB work between generateMetadata and page render.
// Now always uses unstable_cache (1-hour TTL) — claim logic moved to /[username]/claim
const getProfileAndLinks = cache(async (username: string) => {
  return getCachedProfileAndLinks(username.toLowerCase());
});

const PROFILE_FLAG_CACHE_TTL_SECONDS = 5 * 60;

const getCachedLatestReleaseGate = unstable_cache(
  async () => {
    return checkGate(null, FEATURE_FLAG_KEYS.LATEST_RELEASE_CARD, false);
  },
  ['public-profile-latest-release-gate'],
  {
    revalidate: PROFILE_FLAG_CACHE_TTL_SECONDS,
  }
);

const getCachedSubscribeCTAVariant = unstable_cache(
  async (profileId: string) => {
    return getSubscribeCTAVariant(profileId);
  },
  ['public-profile-subscribe-cta-variant'],
  {
    revalidate: PROFILE_FLAG_CACHE_TTL_SECONDS,
  }
);

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams?: Promise<{
    mode?: ProfileMode;
  }>;
}

function mapProfileResultToCreatorProfile(result: {
  id: string;
  userId: string | null;
  creatorType: string | null;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  spotifyId: string | null;
  appleMusicId?: string | null;
  youtubeMusicId?: string | null;
  deezerId?: string | null;
  tidalId?: string | null;
  soundcloudId?: string | null;
  isPublic: boolean | null;
  isVerified: boolean | null;
  isClaimed: boolean | null;
  settings: unknown;
  theme: unknown;
  location?: string | null;
  activeSinceYear?: number | null;
  isFeatured?: boolean | null;
  marketingOptOut?: boolean | null;
  profileViews?: number | null;
  usernameNormalized: string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}): CreatorProfile {
  return {
    id: result.id,
    user_id: result.userId,
    creator_type: (result.creatorType ?? 'artist') as CreatorType,
    username: result.username,
    display_name: result.displayName,
    bio: result.bio,
    avatar_url: result.avatarUrl,
    spotify_url: result.spotifyUrl,
    apple_music_url: result.appleMusicUrl,
    youtube_url: result.youtubeUrl,
    spotify_id: result.spotifyId,
    apple_music_id: result.appleMusicId ?? null,
    youtube_music_id: result.youtubeMusicId ?? null,
    deezer_id: result.deezerId ?? null,
    tidal_id: result.tidalId ?? null,
    soundcloud_id: result.soundcloudId ?? null,
    is_public: !!result.isPublic,
    is_verified: !!result.isVerified,
    is_claimed: !!result.isClaimed,
    claim_token: null,
    claimed_at: null,
    settings: (result.settings as Record<string, unknown> | null) ?? null,
    theme: (result.theme as Record<string, unknown> | null) ?? null,
    location: result.location ?? null,
    active_since_year: result.activeSinceYear ?? null,
    is_featured: result.isFeatured || false,
    marketing_opt_out: result.marketingOptOut || false,
    profile_views: result.profileViews || 0,
    username_normalized: result.usernameNormalized,
    search_text:
      `${result.displayName || ''} ${result.username} ${result.bio || ''}`
        .toLowerCase()
        .trim(),
    display_title: result.displayName || result.username,
    profile_completion_pct: 0,
    created_at: toISOStringOrFallback(result.createdAt),
    updated_at: toISOStringOrFallback(result.updatedAt),
  };
}

async function renderListenMode(
  username: string,
  isPublicNoAuthSmoke: boolean
) {
  const profileResult = await getLightweightProfile(username);
  if (!profileResult) {
    notFound();
  }

  const artist = convertCreatorProfileToArtist(profileResult.profile);
  const subtitle = getProfileModeSubtitle('listen');
  const schemas = generateProfileStructuredData(
    profileResult.profile,
    profileResult.genres,
    []
  );

  const body = (
    <>
      {isPublicNoAuthSmoke ? null : (
        <ProfileViewTracker handle={artist.handle} artistId={artist.id} />
      )}
      {!profileResult.profile.is_claimed && (
        <ClaimBanner profileHandle={artist.handle} displayName={artist.name} />
      )}
      {isPublicNoAuthSmoke ? null : (
        <JoviePixel profileId={profileResult.profile.id} />
      )}
      <StaticArtistPage
        mode='listen'
        artist={artist}
        socialLinks={[]}
        contacts={[]}
        subtitle={subtitle}
        showTipButton={profileResult.hasVenmoLink}
        showBackButton={true}
        showTourButton={true}
        enableDynamicEngagement={profileResult.creatorIsPro}
        latestRelease={null}
        photoDownloadSizes={[]}
        allowPhotoDownloads={false}
        subscribeTwoStep={false}
        genres={profileResult.genres}
        tourDates={[]}
        showSubscriptionConfirmedBanner={!isPublicNoAuthSmoke}
      />
      {isPublicNoAuthSmoke ? null : (
        <DesktopQrOverlayClient handle={artist.handle} />
      )}
    </>
  );

  return { schemas, body };
}

const getLightweightProfile = cache(async (username: string) => {
  const result = await getCreatorProfileWithUser(username.toLowerCase());
  if (!result || !result.isPublic) {
    return null;
  }

  return {
    profile: mapProfileResultToCreatorProfile(result),
    creatorIsPro: Boolean(result.userIsPro),
    creatorClerkId:
      typeof result.userClerkId === 'string' ? result.userClerkId : null,
    genres: result.genres ?? null,
    hasVenmoLink: Boolean(result.venmoHandle),
  };
});

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
  const mode = getProfileMode(resolvedSearchParams?.mode);
  const isPublicNoAuthSmoke = process.env.PUBLIC_NOAUTH_SMOKE === '1';

  // NOTE: Cookie access removed from server component to enable static optimization.
  // User-specific behavior (isIdentified, spotifyPreferred) is now handled client-side
  // via the StaticArtistPage component which reads cookies on hydration.
  if (mode === 'listen') {
    const { schemas, body } = await renderListenMode(
      username,
      isPublicNoAuthSmoke
    );
    return (
      <>
        <script type='application/ld+json'>
          {safeJsonLdStringify(schemas.musicGroupSchema)}
        </script>
        <script type='application/ld+json'>
          {safeJsonLdStringify(schemas.breadcrumbSchema)}
        </script>
        {body}
      </>
    );
  }

  const profileResult = await getProfileAndLinks(username);
  const {
    profile,
    links,
    contacts,
    genres,
    status,
    creatorIsPro,
    latestRelease: fetchedLatestRelease,
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

  // Generate a short-lived HMAC token so the client can authenticate its visit
  // tracking request to /api/audience/visit (requires TRACKING_TOKEN_SECRET).
  // Falls back to undefined gracefully if the secret is not configured.
  let visitTrackingToken: string | undefined;
  try {
    visitTrackingToken = getClientTrackingToken(profile.id).token;
  } catch {
    // Secret not configured — visit tracking will proceed without token auth
  }

  // Cache Statsig decisions for public profile traffic to avoid per-request latency.
  const [showLatestRelease, subscribeCTAVariant] = await Promise.all([
    getCachedLatestReleaseGate(),
    getCachedSubscribeCTAVariant(profile.id),
  ]);

  const latestRelease = showLatestRelease ? fetchedLatestRelease : null;
  const subscribeTwoStep = subscribeCTAVariant === 'two_step';

  const publicContacts: PublicContact[] = toPublicContacts(
    contacts,
    artist.name
  );

  const subtitle = getProfileModeSubtitle(mode);

  const tourDates =
    mode === 'tour' ? await loadUpcomingTourDates(profile.id) : [];

  // Show tip button whenever artist has Venmo, and style active state in tip mode.
  const hasVenmoLink = links.some(link => link.platform === 'venmo');
  const showTipButton = hasVenmoLink;
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
      <script type='application/ld+json'>
        {safeJsonLdStringify(musicGroupSchema)}
      </script>
      <script type='application/ld+json'>
        {safeJsonLdStringify(breadcrumbSchema)}
      </script>

      {isPublicNoAuthSmoke ? null : (
        <ProfileViewTracker handle={artist.handle} artistId={artist.id} />
      )}
      {!profile.is_claimed && (
        <ClaimBanner profileHandle={artist.handle} displayName={artist.name} />
      )}
      {/* Server-side pixel tracking */}
      {isPublicNoAuthSmoke ? null : <JoviePixel profileId={profile.id} />}
      <StaticArtistPage
        mode={mode}
        artist={artist}
        socialLinks={links}
        contacts={publicContacts}
        subtitle={subtitle}
        showTipButton={showTipButton}
        showBackButton={showBackButton}
        showTourButton={true}
        enableDynamicEngagement={creatorIsPro}
        latestRelease={latestRelease}
        photoDownloadSizes={photoDownloadSizes}
        allowPhotoDownloads={allowPhotoDownloads}
        subscribeTwoStep={subscribeTwoStep}
        genres={genres}
        tourDates={tourDates}
        visitTrackingToken={visitTrackingToken}
        showSubscriptionConfirmedBanner={!isPublicNoAuthSmoke}
        showShopButton={isShopEnabled(profileSettings)}
      />
      {isPublicNoAuthSmoke ? null : (
        <DesktopQrOverlayClient handle={artist.handle} />
      )}
    </>
  );
}

const PROFILE_NOT_FOUND_METADATA: Metadata = {
  title: 'Profile Not Found',
  description: 'The requested profile could not be found.',
};

function buildListenModeMetadata(profile: CreatorProfile): Metadata {
  const artistName = profile.display_name || profile.username;
  const profileUrl = `${BASE_URL}/${profile.username}?mode=listen`;

  return {
    title: `Listen to ${artistName}`,
    description: `Open ${artistName} on Spotify, Apple Music, and more from one Jovie listen page.`,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: profileUrl,
    },
    openGraph: {
      type: 'profile',
      title: `Listen to ${artistName}`,
      description: `Open ${artistName} on Spotify, Apple Music, and more from one Jovie listen page.`,
      url: profileUrl,
      siteName: 'Jovie',
      locale: 'en_US',
      images: [
        {
          url: getProfileOgImageUrl(profile.username),
          width: 1200,
          height: 630,
          alt: `${artistName} listen page`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Listen to ${artistName}`,
      description: `Open ${artistName} on Spotify, Apple Music, and more from one Jovie listen page.`,
      creator: '@jovieapp',
      site: '@jovieapp',
      images: [
        {
          url: getProfileOgImageUrl(profile.username),
          alt: `${artistName} listen page`,
        },
      ],
    },
  };
}

function buildGenreContext(genres: string[] | null): string {
  if (!genres || genres.length === 0) {
    return '';
  }

  return ` | ${genres.slice(0, 2).join(', ')} Artist`;
}

function buildProfileDescription(
  profile: CreatorProfile,
  artistName: string,
  genres: string[] | null
): string {
  const bioSnippet = profile.bio
    ? profile.bio.slice(0, 155).trim()
    : `Discover ${artistName}'s music`;
  const genreText =
    genres && genres.length > 0
      ? `. ${genres.slice(0, 3).join(', ')} artist`
      : '';

  return `${bioSnippet}${profile.bio && profile.bio.length > 155 ? '...' : ''}${genreText}. Stream on Spotify, Apple Music & more on Jovie.`;
}

function buildProfileMetadata(
  profile: CreatorProfile,
  genres: string[] | null
): Metadata {
  const artistName = profile.display_name || profile.username;
  const profileUrl = `${BASE_URL}/${profile.username}`;
  const title = `${artistName}${buildGenreContext(genres)} - Music & Links`;
  const description = buildProfileDescription(profile, artistName, genres);

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
          url: getProfileOgImageUrl(profile.username),
          width: 1200,
          height: 630,
          alt: `${artistName} profile card`,
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
          url: getProfileOgImageUrl(profile.username),
          alt: `${artistName} profile card`,
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

// Generate metadata for the page with comprehensive SEO
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const mode = getProfileMode(resolvedSearchParams?.mode);

  if (mode === 'listen') {
    const lightweightProfile = await getLightweightProfile(username);
    return lightweightProfile
      ? buildListenModeMetadata(lightweightProfile.profile)
      : PROFILE_NOT_FOUND_METADATA;
  }

  const profileResult = await getProfileAndLinks(username);
  const { profile, genres, status } = profileResult;

  if (status === 'error') {
    return {
      title: 'Profile temporarily unavailable',
      description: 'We are working to restore this profile. Please try again.',
    };
  }

  if (!profile) {
    return PROFILE_NOT_FOUND_METADATA;
  }

  return buildProfileMetadata(profile, genres);
}

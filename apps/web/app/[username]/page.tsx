import { type Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { cache } from 'react';

export const dynamic = 'force-dynamic';

import type { PublicRelease } from '@/components/features/profile/releases/types';
import { BASE_URL } from '@/constants/app';
import { ErrorBanner } from '@/features/feedback/ErrorBanner';
import { DesktopQrOverlayClient } from '@/features/profile/DesktopQrOverlayClient';
import { ProfileViewTracker } from '@/features/profile/ProfileViewTracker';
import {
  getProfileMode,
  getProfileModeDefinition,
} from '@/features/profile/registry';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import { JoviePixel } from '@/features/tracking/JoviePixel';
import { getClientTrackingToken } from '@/lib/analytics/tracking-token';
import {
  getProfileVisitorState,
  supportsDirectProfileClaim,
} from '@/lib/claim/visitor-state';
import {
  buildBreadcrumbObject,
  buildListenActions,
} from '@/lib/constants/schemas';
import { toPublicContacts } from '@/lib/contacts/mapper';
// eslint-disable-next-line no-restricted-imports -- Schema barrel import needed for types
import type {
  CreatorContact as DbCreatorContact,
  DiscogRelease,
} from '@/lib/db/schema';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { captureError } from '@/lib/error-tracking';
import { calculateRequiredProfileCompletion } from '@/lib/profile/completion';
import { getConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { isShopEnabled } from '@/lib/profile/shop-settings';
import { getProfileWithLinks as getCreatorProfileWithLinks } from '@/lib/services/profile';
import { isDspPlatform } from '@/lib/services/social-links/types';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { buildAvatarSizes } from '@/lib/utils/avatar-sizes';
import { toISOStringSafe } from '@/lib/utils/date';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import { logger } from '@/lib/utils/logger';
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
import type { PressPhoto } from '@/types/press-photos';
import { PublicClaimBanner } from './_components/PublicClaimBanner';
import { mapProfileWithLinksToCreatorProfile } from './_lib/profile-mapper';
import { getProfileStaticParams } from './_lib/profile-static-params';
import { shouldBypassPublicProfileQaCache } from './_lib/public-profile-qa';

/** Max MusicEvent schemas to emit (Google shows ~5 in rich results). */
const MAX_EVENT_SCHEMAS = 5;

/**
 * Map ticketStatus enum to schema.org Event properties.
 */
function mapTicketStatus(status: string): {
  eventStatus: string;
  availability: string | null;
} {
  switch (status) {
    case 'cancelled':
      return {
        eventStatus: 'https://schema.org/EventCancelled',
        availability: null,
      };
    case 'sold_out':
      return {
        eventStatus: 'https://schema.org/EventScheduled',
        availability: 'https://schema.org/SoldOut',
      };
    default:
      return {
        eventStatus: 'https://schema.org/EventScheduled',
        availability: 'https://schema.org/InStock',
      };
  }
}

/**
 * Generate a single @graph JSON-LD object for artist profile SEO.
 * Includes ProfilePage, MusicGroup, BreadcrumbList, and MusicEvent schemas.
 */
function generateProfileStructuredData(
  profile: CreatorProfile,
  genres: string[] | null,
  links: LegacySocialLink[],
  tourDates: TourDateViewModel[]
) {
  const artistName = profile.display_name || profile.username;
  const normalizedUsername =
    profile.username_normalized || profile.username.toLowerCase();
  const profileUrl = `${BASE_URL}/${normalizedUsername}`;

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
      ].includes((link.platform ?? '').toLowerCase())
    )
    .map(link => link.url);

  if (profile.spotify_url) socialUrls.push(profile.spotify_url);
  if (profile.apple_music_url) socialUrls.push(profile.apple_music_url);
  if (profile.youtube_url) socialUrls.push(profile.youtube_url);
  const uniqueSocialUrls = [...new Set(socialUrls)];

  // Build ListenAction from all DSP links (profile columns + social links table)
  const DSP_PLATFORMS: Record<string, string> = {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
    youtube: 'YouTube',
    soundcloud: 'SoundCloud',
    deezer: 'Deezer',
    tidal: 'Tidal',
  };
  const dspUrls = new Map<string, { url: string; name: string }>();
  // Profile columns first (highest priority)
  if (profile.spotify_url)
    dspUrls.set('spotify', { url: profile.spotify_url, name: 'Spotify' });
  if (profile.apple_music_url)
    dspUrls.set('apple_music', {
      url: profile.apple_music_url,
      name: 'Apple Music',
    });
  if (profile.youtube_url)
    dspUrls.set('youtube', { url: profile.youtube_url, name: 'YouTube' });
  // Social links table (fill gaps)
  for (const link of links) {
    const platform = link.platform?.toLowerCase() ?? '';
    if (DSP_PLATFORMS[platform] && link.url && !dspUrls.has(platform)) {
      dspUrls.set(platform, { url: link.url, name: DSP_PLATFORMS[platform] });
    }
  }
  const listenActions = buildListenActions(
    [...dspUrls.entries()].map(([id, d]) => ({ providerId: id, url: d.url }))
  );

  const musicGroupSchema: Record<string, unknown> = {
    '@type': 'MusicGroup',
    '@id': `${profileUrl}#musicgroup`,
    name: artistName,
    description: profile.bio || `Music by ${artistName}`,
    url: profileUrl,
    sameAs: uniqueSocialUrls,
    genre: genres && genres.length > 0 ? genres : ['Music'],
    ...(profile.avatar_url && {
      image: {
        '@type': 'ImageObject',
        url: profile.avatar_url,
        name: `${artistName} profile photo`,
      },
    }),
    ...(profile.location && {
      location: {
        '@type': 'Place',
        name: profile.location,
      },
    }),
    ...(profile.active_since_year && {
      foundingDate: String(profile.active_since_year),
    }),
    ...(profile.is_verified && {
      additionalProperty: {
        '@type': 'PropertyValue',
        name: 'verified',
        value: true,
      },
    }),
    ...(listenActions.length > 0 && { potentialAction: listenActions }),
  };

  const profilePageSchema: Record<string, unknown> = {
    '@type': 'ProfilePage',
    '@id': `${profileUrl}#profilepage`,
    mainEntity: { '@id': `${profileUrl}#musicgroup` },
    url: profileUrl,
    name: `${artistName} | Jovie`,
    ...(profile.created_at && { dateCreated: profile.created_at }),
    ...(profile.updated_at && { dateModified: profile.updated_at }),
  };

  const breadcrumbSchema = buildBreadcrumbObject([
    { name: 'Home', url: BASE_URL },
    { name: artistName, url: profileUrl },
  ]);

  // MusicEvent schemas for upcoming tour dates (capped at MAX_EVENT_SCHEMAS)
  const eventSchemas = tourDates.slice(0, MAX_EVENT_SCHEMAS).map(td => {
    const { eventStatus, availability } = mapTicketStatus(td.ticketStatus);
    const eventName = td.title || `${artistName} at ${td.venueName}`;

    const locationParts: Record<string, unknown> = {
      '@type': 'Place',
      name: td.venueName,
      address: {
        '@type': 'PostalAddress',
        addressLocality: td.city,
        ...(td.region && { addressRegion: td.region }),
        addressCountry: td.country,
      },
    };

    if (td.latitude != null && td.longitude != null) {
      locationParts.geo = {
        '@type': 'GeoCoordinates',
        latitude: td.latitude,
        longitude: td.longitude,
      };
    }

    const event: Record<string, unknown> = {
      '@type': 'MusicEvent',
      '@id': `${profileUrl}#event-${td.id}`,
      name: eventName,
      startDate: td.startDate,
      location: locationParts,
      performer: { '@id': `${profileUrl}#musicgroup` },
      eventStatus,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    };

    if (td.ticketUrl && availability) {
      event.offers = {
        '@type': 'Offer',
        url: td.ticketUrl,
        availability,
      };
    }

    return event;
  });

  const graph = [
    profilePageSchema,
    musicGroupSchema,
    breadcrumbSchema,
    ...eventSchemas,
  ];

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
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
  pressPhotos: PressPhoto[];
  status: 'ok' | 'not_found' | 'error';
}> => {
  try {
    // The page-level unstable_cache is the canonical cache for public profile
    // rendering. Bypass the profile service's Redis layer here because its
    // Upstash fetch is `no-store`, which turns uncached ISR handles into
    // static-to-dynamic runtime errors in production.
    const result = await getCreatorProfileWithLinks(username, {
      skipCache: true,
    });

    // Use truthy check (not strict equality) for isPublic because the neon-http
    // driver may return boolean columns as non-boolean truthy values (e.g., 1, "t")
    // in edge cases — same class of issue as dates-as-strings (see JOVIE-WEB-6X).
    if (!result?.isPublic) {
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
        pressPhotos: [],
        status: 'not_found',
      };
    }

    const creatorIsPro = Boolean(result.userIsPro);
    const creatorClerkId =
      typeof result.userClerkId === 'string' ? result.userClerkId : null;

    const profile = mapProfileWithLinksToCreatorProfile(result, {
      profileCompletionPct: calculateProfileCompletion(result),
    });

    const links: LegacySocialLink[] =
      result.socialLinks?.map(link => ({
        id: link.id,
        artist_id: result.id,
        platform: (link.platform ?? '').toLowerCase(),
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
      pressPhotos: result.pressPhotos ?? [],
      status: 'ok',
    };
  } catch (error) {
    logger.error(
      'Error fetching creator profile',
      {
        error,
        route: '/[username]',
        username,
      },
      'public-profile'
    );
    return {
      profile: null,
      links: [],
      contacts: [],
      creatorIsPro: false,
      creatorClerkId: null,
      genres: null,
      latestRelease: null,
      pressPhotos: [],
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

class NonCacheableProfileResultError extends Error {
  readonly result: Awaited<ReturnType<typeof fetchProfileAndLinks>>;

  constructor(result: Awaited<ReturnType<typeof fetchProfileAndLinks>>) {
    super(`Profile fetch returned non-cacheable status: ${result.status}`);
    this.name = 'NonCacheableProfileResultError';
    this.result = result;
  }
}

/**
 * Cached profile fetcher. Only caches successful (status: 'ok') results.
 *
 * IMPORTANT: We intentionally do NOT use a negative cache (caching not_found
 * results). The previous negative cache pattern used thrown errors to signal
 * "don't cache this" to unstable_cache, but unstable_cache treats background
 * revalidation failures by serving the stale value — causing not_found results
 * to become permanently sticky even after the profile becomes available.
 *
 * Instead, not_found and error results are always fetched fresh.
 */
const getCachedProfileAndLinks = async (username: string) => {
  // Skip Next.js cache in test/development environments
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    shouldBypassPublicProfileQaCache()
  ) {
    return fetchProfileAndLinks(username);
  }

  // Single fetch path via unstable_cache. The cached function is the sole
  // fetch path, eliminating the previous double-fetch on first visit.
  try {
    const cachedFetch = unstable_cache(
      async () => {
        const data = await fetchProfileAndLinks(username);
        if (data.status !== 'ok') {
          // Don't cache not_found or error results — throw to prevent
          // stale success from being served on background revalidation.
          // Carry the original payload through the throw path so callers do not
          // need to re-read storage just to render a fresh non-ok response.
          throw new NonCacheableProfileResultError(data);
        }
        return data;
      },
      [`public-profile-${username}`],
      {
        tags: ['profiles-all', `profile:${username}`],
        revalidate: PROFILE_SUCCESS_CACHE_TTL_SECONDS,
      }
    );
    return await cachedFetch();
  } catch (error) {
    if (error instanceof NonCacheableProfileResultError) {
      return error.result;
    }

    // Cache layer failure — fetch fresh
    return fetchProfileAndLinks(username);
  }
};

// Memoize per-request to avoid duplicate DB work between generateMetadata and page render.
// Now always uses unstable_cache (1-hour TTL) — claim logic moved to /[username]/claim
const getProfileAndLinks = cache(async (username: string) => {
  return getCachedProfileAndLinks(username.toLowerCase());
});

/**
 * Pre-render featured artist profiles at build time to eliminate cold-start latency.
 * Limited to 100 profiles to keep build times reasonable.
 */
export async function generateStaticParams() {
  return getProfileStaticParams(100);
}

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams?: Promise<{
    readonly mode?: string | string[];
  }>;
}

async function getPublicTourDates(
  profileId: string
): Promise<TourDateViewModel[]> {
  try {
    return await getUpcomingTourDatesForProfile(profileId);
  } catch (error) {
    logger.error(
      'Error fetching public profile tour dates',
      {
        error,
        profileId,
        route: '/[username]',
      },
      'public-profile'
    );
    return [];
  }
}

async function getPublicReleases(
  profileId: string
): Promise<Awaited<ReturnType<typeof getReleasesForProfileLite>>> {
  try {
    return await getReleasesForProfileLite(profileId);
  } catch (error) {
    try {
      await captureError('Error fetching public profile releases', error, {
        profileId,
        route: '/[username]',
      });
    } catch {
      // Best-effort telemetry only; do not block page rendering.
    }

    return [];
  }
}

export default async function ArtistPage({
  params,
  searchParams,
}: Readonly<Props>) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const requestedMode = getProfileMode(
    Array.isArray(resolvedSearchParams?.mode)
      ? resolvedSearchParams?.mode[0]
      : resolvedSearchParams?.mode
  );

  // Early reject obviously invalid usernames before hitting the database
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    notFound();
  }

  const isPublicNoAuthSmoke = process.env.PUBLIC_NOAUTH_SMOKE === '1';
  const viewerCountryCode = null;

  const profileResult = await getProfileAndLinks(username);
  const {
    profile,
    links,
    contacts,
    genres,
    status,
    creatorIsPro,
    creatorClerkId,
    latestRelease: fetchedLatestRelease,
    pressPhotos,
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
  const directClaimSupported = supportsDirectProfileClaim({
    spotifyId: profile.spotify_id,
  });
  const visitorState = getProfileVisitorState({
    profile: {
      id: profile.id,
      username: artist.handle,
      isClaimed: profile.is_claimed,
      userClerkId: creatorClerkId,
      spotifyId: profile.spotify_id,
    },
    authUserId: null,
    pendingClaimContext: null,
  });

  // Generate a short-lived HMAC token so the client can authenticate its visit
  // tracking request to /api/audience/visit (requires TRACKING_TOKEN_SECRET).
  // Falls back to undefined gracefully if the secret is not configured.
  let visitTrackingToken: string | undefined;
  try {
    visitTrackingToken = getClientTrackingToken(profile.id).token;
  } catch {
    // Secret not configured — visit tracking will proceed without token auth
  }

  const tourDatesPromise = getPublicTourDates(profile.id);
  const releasesPromise = getPublicReleases(profile.id);
  const latestRelease = fetchedLatestRelease;

  const publicContacts: PublicContact[] = toPublicContacts(
    contacts,
    artist.name
  );
  const showPayButton = links.some(link => link.platform === 'venmo');
  const showBackButton = requestedMode !== 'profile';
  const subtitle = getProfileModeDefinition(requestedMode).subtitle;

  // Read profile photo download settings
  const profileSettings =
    (profile.settings as Record<string, unknown> | null) ?? {};
  const featuredPlaylistFallback =
    getConfirmedFeaturedPlaylistFallback(profileSettings);
  const allowPhotoDownloads =
    profileSettings.allowProfilePhotoDownloads === true;
  const photoDownloadSizes = buildAvatarSizes(
    profileSettings.avatarSizes as Record<string, string> | null | undefined,
    profile.avatar_url
  );

  // Await tour dates + releases (started above, non-blocking — errors logged then resolve to empty)
  // Sort server-side so the client doesn't need a useMemo sort
  const [tourDatesRaw, allReleases] = await Promise.all([
    tourDatesPromise.catch(() => [] as TourDateViewModel[]),
    releasesPromise,
  ]);
  const tourDates = [...tourDatesRaw].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  // Serialize releases for client (query returns newest-first via DESC NULLS LAST)
  const releases: PublicRelease[] = allReleases.map(r => ({
    id: r.id,
    title: r.title,
    slug: r.slug ?? '',
    releaseType: r.releaseType,
    releaseDate: r.releaseDate,
    artworkUrl: r.artworkUrl,
    artistNames: r.artistNames,
  }));

  // Generate structured data for SEO (after tour dates resolve)
  const structuredData = generateProfileStructuredData(
    profile,
    genres,
    links,
    tourDates
  );

  return (
    <>
      {/* JSON-LD Structured Data for SEO — single @graph for all schemas */}
      <script type='application/ld+json'>
        {safeJsonLdStringify(structuredData)}
      </script>

      {isPublicNoAuthSmoke ? null : (
        <ProfileViewTracker handle={artist.handle} artistId={artist.id} />
      )}
      <PublicClaimBanner
        profileHandle={artist.handle}
        displayName={artist.name}
        directClaimSupported={directClaimSupported}
        isClaimed={profile.is_claimed}
        visitorState={visitorState}
      />
      {/* Server-side pixel tracking */}
      {isPublicNoAuthSmoke ? null : <JoviePixel profileId={profile.id} />}
      <StaticArtistPage
        mode={requestedMode}
        artist={artist}
        socialLinks={links}
        viewerCountryCode={viewerCountryCode}
        contacts={publicContacts}
        subtitle={subtitle}
        showBackButton={showBackButton}
        showPayButton={showPayButton}
        showTourButton={true}
        enableDynamicEngagement={creatorIsPro}
        latestRelease={latestRelease}
        photoDownloadSizes={photoDownloadSizes}
        allowPhotoDownloads={allowPhotoDownloads}
        pressPhotos={pressPhotos}
        subscribeTwoStep
        genres={genres}
        tourDates={tourDates}
        visitTrackingToken={visitTrackingToken}
        showSubscriptionConfirmedBanner={!isPublicNoAuthSmoke}
        showShopButton={isShopEnabled(profileSettings)}
        profileSettings={{
          showOldReleases: profileSettings.showOldReleases === true,
        }}
        featuredPlaylistFallback={featuredPlaylistFallback}
        releases={releases}
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

function buildProfileDescription(
  profile: CreatorProfile,
  artistName: string,
  genres: string[] | null
): string {
  const locationPrefix = profile.location ? `${profile.location}-based ` : '';
  const genreText =
    genres && genres.length > 0 ? `${genres.slice(0, 3).join(', ')} ` : '';
  const bioSnippet = profile.bio
    ? profile.bio.slice(0, 155).trim()
    : `Discover ${artistName}'s music`;

  if (profile.bio) {
    const suffix = profile.bio.length > 155 ? '...' : '';
    const genreSuffix =
      genres && genres.length > 0
        ? `. ${genres.slice(0, 3).join(', ')} artist`
        : '';
    return `${bioSnippet}${suffix}${genreSuffix}. Stream on Spotify, Apple Music & more on Jovie.`;
  }

  const descriptor = `${locationPrefix}${genreText}`.trim();
  return descriptor
    ? `${descriptor} artist. Stream ${artistName}'s music on Spotify, Apple Music & more on Jovie.`
    : `Stream ${artistName}'s music on Spotify, Apple Music & more on Jovie.`;
}

function buildProfileMetadata(
  profile: CreatorProfile,
  genres: string[] | null,
  latestRelease?: DiscogRelease | null
): Metadata {
  const artistName = profile.display_name || profile.username;
  const normalizedUsername =
    profile.username_normalized || profile.username.toLowerCase();
  const profileUrl = `${BASE_URL}/${normalizedUsername}`;
  const title = artistName;
  const socialTitle = `${artistName} | Jovie`;
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
      title: socialTitle,
      description,
      url: profileUrl,
      siteName: 'Jovie',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      creator: '@jovieapp',
      site: '@jovieapp',
    },
    other: {
      // Note: OG-namespace tags (music:*, profile:*) require property= semantics
      // which metadata.other cannot provide (it renders name=). These signals are
      // covered by JSON-LD structured data instead. Only non-OG tags go here.
      ...(profile.is_verified && { 'profile:verified': 'true' }),
      ...(profile.location && { 'geo.placename': profile.location }),
    },
  };
}

// Generate metadata for the page with comprehensive SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profileResult = await getProfileAndLinks(username);
  const { profile, genres, latestRelease, status } = profileResult;

  if (status === 'error') {
    return {
      title: 'Profile temporarily unavailable',
      description: 'We are working to restore this profile. Please try again.',
    };
  }

  if (!profile) {
    return PROFILE_NOT_FOUND_METADATA;
  }

  return buildProfileMetadata(profile, genres, latestRelease);
}

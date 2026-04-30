import { type Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';

import type { PublicRelease } from '@/components/features/profile/releases/types';
import { BASE_URL } from '@/constants/app';
import { ErrorBanner } from '@/features/feedback/ErrorBanner';
import { DesktopQrOverlayClient } from '@/features/profile/DesktopQrOverlayClient';
import { ProfileViewTracker } from '@/features/profile/ProfileViewTracker';
import { getProfileModeDefinition } from '@/features/profile/registry';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import { JoviePixel } from '@/features/tracking/JoviePixel';
import { createProfileTag } from '@/lib/cache/tags';
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
import type { DiscogRelease } from '@/lib/db/schema';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { captureError } from '@/lib/error-tracking';
import { getConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import { isShopEnabled } from '@/lib/profile/shop-settings';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { buildAvatarSizes } from '@/lib/utils/avatar-sizes';
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
import { PublicClaimBanner } from './_components/PublicClaimBanner';
import { getProfileStaticParams } from './_lib/profile-static-params';
import { getProfileAndLinks } from './_lib/public-profile-loader';

/** Max MusicEvent schemas to emit (Google shows ~5 in rich results). */
const MAX_EVENT_SCHEMAS = 5;
const PUBLIC_PROFILE_DETAIL_CACHE_TTL_SECONDS = 3600;

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

// Profile loader (fetch + cache + per-request memo) lives in
// _lib/public-profile-loader.ts so per-mode routes (plan PR 3a-2b) can
// reuse it without duplicating the cache, error class, or TTL contract.

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
}

async function getPublicTourDates(params: {
  profileId: string;
  usernameNormalized: string;
}): Promise<TourDateViewModel[]> {
  const { profileId, usernameNormalized } = params;

  try {
    const cachedGetTourDates = unstable_cache(
      async () => getUpcomingTourDatesForProfile(profileId),
      [`public-profile-tour-dates-${profileId}`],
      {
        tags: [createProfileTag(usernameNormalized)],
        revalidate: PUBLIC_PROFILE_DETAIL_CACHE_TTL_SECONDS,
      }
    );

    return await cachedGetTourDates();
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

async function getPublicReleases(params: {
  profileId: string;
  usernameNormalized: string;
}): Promise<Awaited<ReturnType<typeof getReleasesForProfileLite>>> {
  const { profileId, usernameNormalized } = params;

  try {
    const cachedGetReleases = unstable_cache(
      async () => getReleasesForProfileLite(profileId),
      [`public-profile-releases-${profileId}`],
      {
        tags: [createProfileTag(usernameNormalized)],
        revalidate: PUBLIC_PROFILE_DETAIL_CACHE_TTL_SECONDS,
      }
    );

    return await cachedGetReleases();
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

export default async function ArtistPage({ params }: Readonly<Props>) {
  const { username } = await params;
  const initialMode = 'profile';

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

  const usernameNormalized =
    profile.username_normalized || username.toLowerCase();

  // Kick off independent DB queries immediately so they overlap with the
  // synchronous artist conversion, visitor-state, and tracking-token work below.
  const tourDatesPromise = getPublicTourDates({
    profileId: profile.id,
    usernameNormalized,
  });
  const releasesPromise = getPublicReleases({
    profileId: profile.id,
    usernameNormalized,
  });

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

  const latestRelease = fetchedLatestRelease;

  const publicContacts: PublicContact[] = toPublicContacts(
    contacts,
    artist.name
  );
  const showPayButton = links.some(link => link.platform === 'venmo');
  const showBackButton = false;
  const subtitle = getProfileModeDefinition(initialMode).subtitle;

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
        mode={initialMode}
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
        visitTrackingToken={undefined}
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

import { BASE_URL } from '@/constants/app';
import {
  buildBreadcrumbObject,
  buildListenActions,
} from '@/lib/constants/schemas';
import {
  buildEntitySameAs,
  type EntityIdentityLink,
} from '@/lib/entity/sameAs';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { CreatorProfile, LegacySocialLink } from '@/types/db';
import { profileEntityAnchor, resolveArtistEntityType } from './artist-entity';
import { formatSchemaEventStartDate } from './event-date';

/** Max MusicEvent schemas to emit (Google shows ~5 in rich results). */
export const MAX_EVENT_SCHEMAS = 5;

/** Max linked-entity `mentions` to emit on the profile entity node. */
export const MAX_ENTITY_MENTIONS = 25;

/** A profile-linked entity (own release or credited artist) for JSON-LD mentions. */
export interface ProfileEntityMention {
  readonly kind: 'release' | 'artist';
  readonly name: string;
  /** Absolute URL of the entity's Jovie page. */
  readonly url: string;
}

const SOCIAL_PLATFORMS = new Set([
  'instagram',
  'twitter',
  'facebook',
  'youtube',
  'tiktok',
  'spotify',
]);

const DSP_PLATFORMS: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  deezer: 'Deezer',
  tidal: 'Tidal',
};

function nonEmptyUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  return trimmed || null;
}

function buildUniqueSocialUrls(
  profile: CreatorProfile,
  links: LegacySocialLink[],
  identityLinks: EntityIdentityLink[]
): string[] {
  const socialUrls = links
    .filter(
      link =>
        SOCIAL_PLATFORMS.has((link.platform ?? '').toLowerCase()) &&
        typeof link.url === 'string' &&
        link.url.trim().length > 0
    )
    .map(link => link.url.trim());

  const spotifyUrl = nonEmptyUrl(profile.spotify_url);
  const appleMusicUrl = nonEmptyUrl(profile.apple_music_url);
  const youtubeUrl = nonEmptyUrl(profile.youtube_url);

  if (spotifyUrl) socialUrls.push(spotifyUrl);
  if (appleMusicUrl) socialUrls.push(appleMusicUrl);
  if (youtubeUrl) socialUrls.push(youtubeUrl);

  const entitySameAs = buildEntitySameAs(
    {
      musicbrainzId: profile.musicbrainz_id,
      spotifyUrl,
      appleMusicUrl,
      youtubeUrl,
    },
    identityLinks,
    links.flatMap(link => {
      const url = nonEmptyUrl(link.url);
      return url ? [{ platform: link.platform, url }] : [];
    })
  );

  return [...new Set([...socialUrls, ...entitySameAs])];
}

function buildDspListenActions(
  profile: CreatorProfile,
  links: LegacySocialLink[]
): ReturnType<typeof buildListenActions> {
  const dspUrls = new Map<string, { url: string; name: string }>();
  if (profile.spotify_url) {
    dspUrls.set('spotify', { url: profile.spotify_url, name: 'Spotify' });
  }
  if (profile.apple_music_url) {
    dspUrls.set('apple_music', {
      url: profile.apple_music_url,
      name: 'Apple Music',
    });
  }
  if (profile.youtube_url) {
    dspUrls.set('youtube', { url: profile.youtube_url, name: 'YouTube' });
  }
  for (const link of links) {
    const platform = link.platform?.toLowerCase() ?? '';
    if (DSP_PLATFORMS[platform] && link.url && !dspUrls.has(platform)) {
      dspUrls.set(platform, { url: link.url, name: DSP_PLATFORMS[platform] });
    }
  }
  return buildListenActions(
    [...dspUrls.entries()].map(([id, d]) => ({ providerId: id, url: d.url }))
  );
}

function profileEntityDescription(
  profile: CreatorProfile,
  profileName: string
): string {
  if (profile.bio) return profile.bio;
  if (profile.creator_type === 'artist') return `Music by ${profileName}`;
  return profileName;
}

function profileEntityGenre(
  profile: CreatorProfile,
  genres: string[] | null
): string[] | undefined {
  if (genres && genres.length > 0) return genres;
  if (profile.creator_type === 'artist') return ['Music'];
  return undefined;
}

function buildArtistEntitySchema(
  profile: CreatorProfile,
  artistName: string,
  profileUrl: string,
  genres: string[] | null,
  uniqueSocialUrls: string[],
  listenActions: ReturnType<typeof buildListenActions>,
  entityMentions: readonly ProfileEntityMention[]
): Record<string, unknown> {
  const genre = profileEntityGenre(profile, genres);
  return {
    '@type': resolveArtistEntityType(profile.creator_type),
    '@id': `${profileUrl}#${profileEntityAnchor(profile.creator_type)}`,
    name: artistName,
    description: profileEntityDescription(profile, artistName),
    url: profileUrl,
    ...(uniqueSocialUrls.length > 0 && { sameAs: uniqueSocialUrls }),
    ...(entityMentions.length > 0 && {
      mentions: entityMentions.slice(0, MAX_ENTITY_MENTIONS).map(mention => ({
        '@type': mention.kind === 'artist' ? 'MusicGroup' : 'MusicRecording',
        name: mention.name,
        url: mention.url,
      })),
    }),
    ...(genre ? { genre } : {}),
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
}

function buildProfilePageSchema(
  profile: CreatorProfile,
  artistName: string,
  profileUrl: string,
  entityId: string
): Record<string, unknown> {
  return {
    '@type': 'ProfilePage',
    '@id': `${profileUrl}#profilepage`,
    mainEntity: { '@id': entityId },
    url: profileUrl,
    name: `${artistName} | Jovie`,
    ...(profile.created_at && { dateCreated: profile.created_at }),
    ...(profile.updated_at && { dateModified: profile.updated_at }),
  };
}

function buildMusicEventSchema(
  tourDate: TourDateViewModel,
  artistName: string,
  profileUrl: string,
  entityId: string
): Record<string, unknown> {
  const { eventStatus, availability } = mapTicketStatus(tourDate.ticketStatus);
  const eventName = tourDate.title || `${artistName} at ${tourDate.venueName}`;

  const locationParts: Record<string, unknown> = {
    '@type': 'Place',
    name: tourDate.venueName,
    address: {
      '@type': 'PostalAddress',
      addressLocality: tourDate.city,
      ...(tourDate.region && { addressRegion: tourDate.region }),
      addressCountry: tourDate.country,
    },
  };

  if (tourDate.latitude != null && tourDate.longitude != null) {
    locationParts.geo = {
      '@type': 'GeoCoordinates',
      latitude: tourDate.latitude,
      longitude: tourDate.longitude,
    };
  }

  const event: Record<string, unknown> = {
    '@type': 'MusicEvent',
    '@id': `${profileUrl}#event-${tourDate.id}`,
    name: eventName,
    startDate: formatSchemaEventStartDate(
      tourDate.startDate,
      tourDate.timezone
    ),
    location: locationParts,
    performer: { '@id': entityId },
    eventStatus,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  };

  if (tourDate.ticketUrl && availability) {
    event.offers = {
      '@type': 'Offer',
      url: tourDate.ticketUrl,
      availability,
    };
  }

  return event;
}

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
 * Includes ProfilePage, MusicGroup/Person, BreadcrumbList, and MusicEvent schemas.
 */
export function generateProfileStructuredData(
  profile: CreatorProfile,
  genres: string[] | null,
  links: LegacySocialLink[],
  tourDates: TourDateViewModel[] = [],
  identityLinks: EntityIdentityLink[] = [],
  entityMentions: readonly ProfileEntityMention[] = []
) {
  const artistName = profile.display_name || profile.username;
  const normalizedUsername =
    profile.username_normalized || profile.username.toLowerCase();
  const profileUrl = `${BASE_URL}/${normalizedUsername}`;

  const uniqueSocialUrls = buildUniqueSocialUrls(profile, links, identityLinks);
  const listenActions = buildDspListenActions(profile, links);
  const entityId = `${profileUrl}#${profileEntityAnchor(profile.creator_type)}`;
  const artistEntitySchema = buildArtistEntitySchema(
    profile,
    artistName,
    profileUrl,
    genres,
    uniqueSocialUrls,
    listenActions,
    entityMentions
  );
  const profilePageSchema = buildProfilePageSchema(
    profile,
    artistName,
    profileUrl,
    entityId
  );
  const breadcrumbSchema = buildBreadcrumbObject([
    { name: 'Home', url: BASE_URL },
    { name: artistName, url: profileUrl },
  ]);
  const eventSchemas = tourDates
    .slice(0, MAX_EVENT_SCHEMAS)
    .map(tourDate =>
      buildMusicEventSchema(tourDate, artistName, profileUrl, entityId)
    );

  return {
    '@context': 'https://schema.org',
    '@graph': [
      profilePageSchema,
      artistEntitySchema,
      breadcrumbSchema,
      ...eventSchemas,
    ],
  };
}

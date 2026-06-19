import { BASE_URL } from '@/constants/app';
import {
  buildBreadcrumbObject,
  buildListenActions,
} from '@/lib/constants/schemas';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { CreatorProfile, LegacySocialLink } from '@/types/db';
import { resolveArtistEntityType } from './artist-entity';
import { formatSchemaEventStartDate } from './event-date';

/** Max MusicEvent schemas to emit (Google shows ~5 in rich results). */
export const MAX_EVENT_SCHEMAS = 5;

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
  tourDates: TourDateViewModel[] = []
) {
  const artistName = profile.display_name || profile.username;
  const normalizedUsername =
    profile.username_normalized || profile.username.toLowerCase();
  const profileUrl = `${BASE_URL}/${normalizedUsername}`;

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

  const DSP_PLATFORMS: Record<string, string> = {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
    youtube: 'YouTube',
    soundcloud: 'SoundCloud',
    deezer: 'Deezer',
    tidal: 'Tidal',
  };
  const dspUrls = new Map<string, { url: string; name: string }>();
  if (profile.spotify_url)
    dspUrls.set('spotify', { url: profile.spotify_url, name: 'Spotify' });
  if (profile.apple_music_url)
    dspUrls.set('apple_music', {
      url: profile.apple_music_url,
      name: 'Apple Music',
    });
  if (profile.youtube_url)
    dspUrls.set('youtube', { url: profile.youtube_url, name: 'YouTube' });
  for (const link of links) {
    const platform = link.platform?.toLowerCase() ?? '';
    if (DSP_PLATFORMS[platform] && link.url && !dspUrls.has(platform)) {
      dspUrls.set(platform, { url: link.url, name: DSP_PLATFORMS[platform] });
    }
  }
  const listenActions = buildListenActions(
    [...dspUrls.entries()].map(([id, d]) => ({ providerId: id, url: d.url }))
  );

  const artistEntitySchema: Record<string, unknown> = {
    '@type': resolveArtistEntityType(profile.creator_type),
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
      startDate: formatSchemaEventStartDate(td.startDate, td.timezone),
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

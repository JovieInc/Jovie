import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { BASE_URL } from '@/constants/app';
import {
  buildBreadcrumbObject,
  buildListenActions,
} from '@/lib/constants/schemas';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { generateArtworkImageObject } from '@/lib/images/seo';
import { canonicalizeReleaseArtistHandle } from '@/lib/profile/opaque-internal-profile-handle';
import { msToIsoDuration, toDateOnlySafe } from '@/lib/utils/date';
import {
  resolveArtistEntityType,
  resolveMusicContentSchemaType,
} from './artist-entity';

const RELEASE_TYPE_SCHEMA_MAP: Record<string, string> = {
  single: 'https://schema.org/SingleRelease',
  ep: 'https://schema.org/EPRelease',
  album: 'https://schema.org/AlbumRelease',
  compilation: 'https://schema.org/CompilationAlbum',
};

const CREDIT_ROLE_SCHEMA_MAP: Record<string, string> = {
  producer: 'producer',
  co_producer: 'producer',
  composer: 'composer',
  lyricist: 'lyricist',
  featured_artist: 'contributor',
};

type TrackListItem = {
  title: string;
  slug: string;
  trackNumber: number;
  durationMs: number | null;
};

function buildArtworkImageValue(
  artworkUrl: string,
  opts: {
    title: string;
    artistName: string;
    contentType: 'release' | 'track';
    artworkSizes?: Record<string, string> | null;
  }
): Record<string, unknown> | (Record<string, unknown> | string)[] {
  const primaryImage = generateArtworkImageObject(artworkUrl, opts);

  const additionalImages: string[] = [];
  if (opts.artworkSizes?.['1000'])
    additionalImages.push(opts.artworkSizes['1000']);
  if (opts.artworkSizes?.original)
    additionalImages.push(opts.artworkSizes.original);

  return additionalImages.length > 0
    ? [primaryImage, ...additionalImages]
    : primaryImage;
}

function buildFlatCredits(
  credits: SmartLinkCreditGroup[] | null | undefined
): Record<string, unknown> {
  if (!credits) return {};

  const creditProps: Record<string, unknown[]> = {};
  for (const group of credits) {
    const schemaProp = CREDIT_ROLE_SCHEMA_MAP[group.role];
    if (!schemaProp) continue;
    if (!creditProps[schemaProp]) creditProps[schemaProp] = [];
    for (const entry of group.entries) {
      creditProps[schemaProp].push({
        '@type': 'Person',
        name: entry.name,
        ...(entry.handle && { url: `${BASE_URL}/${entry.handle}` }),
      });
    }
  }

  const flatCredits: Record<string, unknown> = {};
  for (const [prop, people] of Object.entries(creditProps)) {
    flatCredits[prop] = people.length === 1 ? people[0] : people;
  }
  return flatCredits;
}

function buildTrackListSchema(
  contentType: 'release' | 'track',
  trackList: TrackListItem[] | null | undefined,
  contentUrl: string,
  byArtistId: string | null
): Record<string, unknown> | undefined {
  if (contentType !== 'release' || !trackList || trackList.length === 0) {
    return undefined;
  }
  return {
    '@type': 'ItemList',
    numberOfItems: trackList.length,
    itemListElement: trackList.map((t, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'MusicRecording',
        name: t.title,
        url: `${contentUrl}/${t.slug}`,
        ...(t.durationMs &&
          t.durationMs > 0 && {
            duration: msToIsoDuration(t.durationMs),
          }),
        ...(byArtistId && { byArtist: { '@id': byArtistId } }),
      },
    })),
  };
}

/**
 * Project accepted primary-artist credits (JOV-6542) into byArtist entities.
 *
 * Credited artists are identity data from the canonical credit collection —
 * the profile owner is only the credited artist when an accepted credit says
 * so. Each co-primary gets its own entity; handles are canonicalized with the
 * same policy as the visible byline so structured data never links machine
 * handles or substitutes the owner for a credited artist.
 */
function buildByArtistEntities(
  content: {
    primaryArtists?: ReadonlyArray<{
      name: string;
      handle: string | null;
    }> | null;
  },
  creator: {
    displayName: string | null;
    username: string;
    usernameNormalized: string;
    creatorType?: 'artist' | 'podcaster' | 'influencer' | 'creator';
    artistSameAs?: string[];
  },
  ownerName: string
): Record<string, unknown> | Record<string, unknown>[] | null {
  const ownerEntityType = resolveArtistEntityType(
    creator.creatorType ?? 'artist'
  );
  const ownerHandle = creator.usernameNormalized;
  const ownerUrl = `${BASE_URL}/${ownerHandle}`;

  const primaryCredits = (content.primaryArtists ?? []).filter(
    credit => credit.name.trim().length > 0
  );

  if (primaryCredits.length === 0) {
    // Missing, blank, or non-primary credit evidence is not verified
    // authorship: omit byArtist entirely rather than fabricating the profile
    // owner as the performer (JOV-6542 invariant 5). The owner is emitted
    // only when an accepted primary credit names them.
    return null;
  }

  const entities = primaryCredits.map(credit => {
    const handle = canonicalizeReleaseArtistHandle({
      handle: credit.handle,
      name: credit.name,
      ownerHandle,
      ownerName,
    });
    const isOwnerCredit = handle === ownerHandle;
    // A credited artist without a supported public Jovie destination keeps a
    // name-only entity — omit unsupported identity claims rather than minting
    // a dangling @id/url (JOV-6542 invariant 4).
    return {
      '@type': ownerEntityType,
      ...(handle
        ? {
            '@id': isOwnerCredit
              ? `${ownerUrl}#musicgroup`
              : `${BASE_URL}/${handle}#musicgroup`,
            url: `${BASE_URL}/${handle}`,
          }
        : {}),
      name: credit.name,
      ...(isOwnerCredit &&
        creator.artistSameAs &&
        creator.artistSameAs.length > 0 && {
          sameAs: creator.artistSameAs,
        }),
    };
  });

  return entities.length === 1 ? entities[0] : entities;
}

/**
 * Generate a single @graph JSON-LD for music content SEO.
 * Includes MusicAlbum/MusicRelease or MusicRecording + BreadcrumbList.
 */
export function generateMusicStructuredData(
  content: {
    type: 'release' | 'track';
    title: string;
    slug: string;
    artworkUrl: string | null;
    releaseDate: Date | null;
    providerLinks: Array<{ providerId: string; url: string }>;
    artworkSizes?: Record<string, string> | null;
    releaseType?: string | null;
    totalTracks?: number | null;
    credits?: SmartLinkCreditGroup[] | null;
    /** Accepted primary-artist credits — canonical, never ownership-derived. */
    primaryArtists?: ReadonlyArray<{
      name: string;
      handle: string | null;
    }> | null;
    durationMs?: number | null;
    isrc?: string | null;
    trackNumber?: number | null;
    inAlbum?: { title: string; url: string; id: string } | null;
  },
  creator: {
    displayName: string | null;
    username: string;
    usernameNormalized: string;
    creatorType?: 'artist' | 'podcaster' | 'influencer' | 'creator';
    /** Canonical entity graph sameAs — mirrors profile page MusicGroup */
    artistSameAs?: string[];
  },
  trackList?: TrackListItem[] | null
) {
  const artistName = creator.displayName ?? creator.username;
  const contentUrl = `${BASE_URL}/${creator.usernameNormalized}/${content.slug}`;
  const artistUrl = `${BASE_URL}/${creator.usernameNormalized}`;

  const sameAs = content.providerLinks.map(link => link.url);
  const schemaType = resolveMusicContentSchemaType(content.type);
  const byArtist = buildByArtistEntities(content, creator, artistName);

  const imageValue = content.artworkUrl
    ? buildArtworkImageValue(content.artworkUrl, {
        title: content.title,
        artistName,
        contentType: content.type,
        artworkSizes: content.artworkSizes,
      })
    : undefined;

  const listenActions = buildListenActions(
    content.providerLinks,
    PROVIDER_CONFIG
  );
  const flatCredits = buildFlatCredits(content.credits);
  // Track-list recordings reference the first credited artist entity that has
  // a supported destination — never the profile owner, and omitted entirely
  // when no credited artist has one (JOV-6542 invariant 4).
  let byArtistList: Record<string, unknown>[] = [];
  if (Array.isArray(byArtist)) byArtistList = byArtist;
  else if (byArtist) byArtistList = [byArtist];
  const byArtistId =
    byArtistList
      .map(entity => entity['@id'])
      .find(id => typeof id === 'string') ?? null;
  const trackListSchema = buildTrackListSchema(
    content.type,
    trackList,
    contentUrl,
    byArtistId
  );

  const musicSchema: Record<string, unknown> = {
    '@type': schemaType,
    '@id': `${contentUrl}#${content.type}`,
    name: content.title,
    url: contentUrl,
    isAccessibleForFree: true,
    ...(imageValue && { image: imageValue }),
    ...(content.releaseDate && {
      datePublished: toDateOnlySafe(content.releaseDate),
    }),
    ...(content.durationMs &&
      content.durationMs > 0 && {
        duration: msToIsoDuration(content.durationMs),
      }),
    ...(content.isrc && { isrcCode: content.isrc }),
    ...(content.trackNumber != null && { position: content.trackNumber }),
    ...(content.inAlbum && {
      inAlbum: {
        '@type': 'MusicAlbum',
        '@id': content.inAlbum.id,
        name: content.inAlbum.title,
        url: content.inAlbum.url,
      },
    }),
    ...(byArtist && { byArtist }),
    ...(sameAs.length > 0 && { sameAs }),
    ...(content.type === 'release' &&
      content.releaseType &&
      RELEASE_TYPE_SCHEMA_MAP[content.releaseType] && {
        albumReleaseType: RELEASE_TYPE_SCHEMA_MAP[content.releaseType],
      }),
    ...(content.type === 'release' &&
      content.totalTracks != null &&
      content.totalTracks > 0 && {
        numTracks: content.totalTracks,
      }),
    ...(listenActions.length > 0 && { potentialAction: listenActions }),
    ...(trackListSchema && { track: trackListSchema }),
    ...flatCredits,
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      musicSchema,
      buildBreadcrumbObject([
        { name: 'Home', url: BASE_URL },
        { name: artistName, url: artistUrl },
        { name: content.title, url: contentUrl },
      ]),
    ],
  };
}

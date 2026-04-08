import {
  buildBreadcrumbObject,
  buildListenActions,
} from '@/lib/constants/schemas';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { generateArtworkImageObject } from '@/lib/images/seo';
import { msToIsoDuration, toDateOnlySafe } from '@/lib/utils/date';
import type { SmartLinkCreditGroup } from './_lib/data';

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
    durationMs?: number | null;
    isrc?: string | null;
    trackNumber?: number | null;
    inAlbum?: { title: string; url: string; id: string } | null;
  },
  creator: {
    displayName: string | null;
    username: string;
    usernameNormalized: string;
  },
  baseUrl: string,
  trackList?: Array<{
    title: string;
    slug: string;
    trackNumber: number;
    durationMs: number | null;
  }> | null
) {
  const artistName = creator.displayName ?? creator.username;
  const contentUrl = `${baseUrl}/${creator.usernameNormalized}/${content.slug}`;
  const artistUrl = `${baseUrl}/${creator.usernameNormalized}`;

  const sameAs = content.providerLinks.map(link => link.url);
  const schemaType =
    content.type === 'release' ? 'MusicAlbum' : 'MusicRecording';

  let imageValue:
    | Record<string, unknown>
    | (Record<string, unknown> | string)[]
    | undefined;
  if (content.artworkUrl) {
    const primaryImage = generateArtworkImageObject(content.artworkUrl, {
      title: content.title,
      artistName,
      contentType: content.type,
      artworkSizes: content.artworkSizes,
    });

    const additionalImages: string[] = [];
    if (content.artworkSizes?.['1000'])
      additionalImages.push(content.artworkSizes['1000']);
    if (content.artworkSizes?.original)
      additionalImages.push(content.artworkSizes.original);

    imageValue =
      additionalImages.length > 0
        ? [primaryImage, ...additionalImages]
        : primaryImage;
  }

  const listenActions = buildListenActions(
    content.providerLinks,
    PROVIDER_CONFIG as Record<string, { label: string }>
  );

  const creditProps: Record<string, unknown[]> = {};
  if (content.credits) {
    for (const group of content.credits) {
      const schemaProp = CREDIT_ROLE_SCHEMA_MAP[group.role];
      if (!schemaProp) continue;
      if (!creditProps[schemaProp]) creditProps[schemaProp] = [];
      for (const entry of group.entries) {
        creditProps[schemaProp].push({
          '@type': 'Person',
          name: entry.name,
          ...(entry.handle && {
            url: `${baseUrl}/${entry.handle}`,
          }),
        });
      }
    }
  }

  const flatCredits: Record<string, unknown> = {};
  for (const [prop, people] of Object.entries(creditProps)) {
    flatCredits[prop] = people.length === 1 ? people[0] : people;
  }

  let trackListSchema: Record<string, unknown> | undefined;
  if (content.type === 'release' && trackList && trackList.length > 0) {
    trackListSchema = {
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
          byArtist: { '@id': `${artistUrl}#musicgroup` },
        },
      })),
    };
  }

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
    byArtist: {
      '@type': 'MusicGroup',
      '@id': `${artistUrl}#musicgroup`,
      name: artistName,
      url: artistUrl,
    },
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
        { name: 'Home', url: baseUrl },
        { name: artistName, url: artistUrl },
        { name: content.title, url: contentUrl },
      ]),
    ],
  };
}

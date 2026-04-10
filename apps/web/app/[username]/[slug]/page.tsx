/**
 * Content Smart Link Landing Page (/{username}/{slug})
 *
 * Public-facing page that shows release or track artwork, title, and streaming
 * platform buttons. This is the new short URL format.
 *
 * When a `?dsp=` query param is present, redirects directly to that provider.
 */

import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { PreferredDspRedirect } from '@/app/[username]/[slug]/PreferredDspRedirect';
import {
  type FeaturedArtist,
  ReleaseLandingPage,
} from '@/app/r/[slug]/ReleaseLandingPage';
import { BASE_URL } from '@/constants/app';
import {
  ScheduledReleasePage,
  UnreleasedReleaseHero,
} from '@/features/release';
import {
  buildBreadcrumbObject,
  buildListenActions,
} from '@/lib/constants/schemas';
import {
  derivePreviewState,
  getProviderConfidence,
} from '@/lib/discography/audio-qa';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import { findRedirectByOldSlug } from '@/lib/discography/slug';
import type { ProviderKey } from '@/lib/discography/types';
import { isVideoProviderKey } from '@/lib/discography/video-providers';
import { generateArtworkImageObject } from '@/lib/images/seo';
import {
  msToIsoDuration,
  toDateOnlySafe,
  toISOStringOrNull,
} from '@/lib/utils/date';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import {
  getContentBySlug,
  getCreatorByUsername,
  getCreatorPlan,
  getFeaturedSmartLinkStaticParams,
  getReleaseTrackList,
  type SmartLinkCreditGroup,
} from './_lib/data';

// Use ISR with 5-minute revalidation for smart link pages
export const revalidate = 300;

export async function generateStaticParams() {
  try {
    return await getFeaturedSmartLinkStaticParams();
  } catch {
    // Build-time DB failures should not block deployment.
    return [];
  }
}

/** Maps release type enum to schema.org MusicAlbumReleaseType values */
const RELEASE_TYPE_SCHEMA_MAP: Record<string, string> = {
  single: 'https://schema.org/SingleRelease',
  ep: 'https://schema.org/EPRelease',
  album: 'https://schema.org/AlbumRelease',
  compilation: 'https://schema.org/CompilationAlbum',
};

/** Credit role to schema.org property mapping */
const CREDIT_ROLE_SCHEMA_MAP: Record<string, string> = {
  producer: 'producer',
  co_producer: 'producer',
  composer: 'composer',
  lyricist: 'lyricist',
  featured_artist: 'contributor',
};

/**
 * Generate a single @graph JSON-LD for music content SEO.
 * Includes MusicAlbum/MusicRecording + BreadcrumbList + credits + track list.
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
  trackList?: Array<{
    title: string;
    slug: string;
    trackNumber: number;
    durationMs: number | null;
  }> | null
) {
  const artistName = creator.displayName ?? creator.username;
  const contentUrl = `${BASE_URL}/${creator.usernameNormalized}/${content.slug}`;
  const artistUrl = `${BASE_URL}/${creator.usernameNormalized}`;

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

  // Map credits to schema.org Person references
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
            url: `${BASE_URL}/${entry.handle}`,
          }),
        });
      }
    }
  }

  // Flatten single-element credit arrays
  const flatCredits: Record<string, unknown> = {};
  for (const [prop, people] of Object.entries(creditProps)) {
    flatCredits[prop] = people.length === 1 ? people[0] : people;
  }

  // Build track list for albums
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
      content.totalTracks &&
      content.totalTracks > 0 && {
        numTracks: content.totalTracks,
      }),
    ...flatCredits,
    ...(trackListSchema && { track: trackListSchema }),
    ...(listenActions.length > 0 && { potentialAction: listenActions }),
  };

  const breadcrumbSchema = buildBreadcrumbObject([
    { name: 'Home', url: BASE_URL },
    { name: artistName, url: artistUrl },
    { name: content.title, url: contentUrl },
  ]);

  return {
    '@context': 'https://schema.org',
    '@graph': [musicSchema, breadcrumbSchema],
  };
}

interface PageProps {
  readonly params: Promise<{ username: string; slug: string }>;
}

type Creator = NonNullable<Awaited<ReturnType<typeof getCreatorByUsername>>>;
type Content = NonNullable<Awaited<ReturnType<typeof getContentBySlug>>>;

/**
 * Resolves content by slug, handling old-slug redirects.
 * Calls notFound() if content cannot be found.
 */
async function resolveContentOrRedirect(
  creator: Creator,
  slug: string
): Promise<Content> {
  const content = await getContentBySlug(creator.id, slug);
  if (content) return content;

  const redirectInfo = await findRedirectByOldSlug(creator.id, slug);
  if (redirectInfo) {
    permanentRedirect(`/${creator.usernameNormalized}/${redirectInfo.currentSlug}`);
  }
  notFound();
}

export default async function ContentSmartLinkPage({
  params,
}: Readonly<PageProps>) {
  const { username, slug } = await params;

  if (!username || !slug) {
    notFound();
  }

  const normalizedUsername = username.toLowerCase();

  const creator = await getCreatorByUsername(normalizedUsername);
  if (!creator) {
    notFound();
  }

  const content = await resolveContentOrRedirect(creator, slug);

  // If this is a track with a known parent release, permanently redirect to the nested URL.
  // Tracks should be deep links of releases: /{handle}/{releaseSlug}/{trackSlug}
  if (content.type === 'track' && content.releaseSlug) {
    permanentRedirect(
      `/${creator.usernameNormalized}/${content.releaseSlug}/${content.slug}`
    );
  }

  // Build provider data for the landing page
  const providers = PRIMARY_PROVIDER_KEYS.map(key => {
    const link = content.providerLinks.find(l => l.providerId === key);
    return {
      key,
      label: PROVIDER_CONFIG[key].label,
      accent: PROVIDER_CONFIG[key].accent,
      url: link?.url ?? null,
      confidence: link ? getProviderConfidence(link) : 'unknown',
    };
  }).filter(p => p.url);

  const secondaryProviders = (Object.keys(PROVIDER_CONFIG) as ProviderKey[])
    .filter(key => !PRIMARY_PROVIDER_KEYS.includes(key))
    .map(key => {
      const link = content.providerLinks.find(l => l.providerId === key);
      return {
        key,
        label: PROVIDER_CONFIG[key].label,
        accent: PROVIDER_CONFIG[key].accent,
        url: link?.url ?? null,
        confidence: link ? getProviderConfidence(link) : 'unknown',
      };
    })
    .filter(p => p.url);

  const allProviders = [...providers, ...secondaryProviders];
  const previewState = derivePreviewState({
    audioUrl: null,
    previewUrl: content.previewUrl ?? null,
    metadata: content.previewMetadata ?? null,
    providerLinks: content.providerLinks,
  });

  // Check if any video provider links exist for "Use this sound"
  const hasVideoLinks = content.providerLinks.some(
    link => Boolean(link.url) && isVideoProviderKey(link.providerId)
  );
  const soundsUrl = hasVideoLinks
    ? `/${creator.usernameNormalized}/${content.slug}/sounds`
    : null;

  // Fetch track list for release structured data (errors silently ignored)
  const trackList =
    content.type === 'release' && content.totalTracks && content.totalTracks > 0
      ? await getReleaseTrackList(content.id).catch(() => null)
      : null;

  // Generate structured data for SEO
  const structuredData = generateMusicStructuredData(
    {
      type: content.type,
      title: content.title,
      slug: content.slug,
      artworkUrl: content.artworkUrl,
      releaseDate: content.releaseDate,
      providerLinks: content.providerLinks,
      artworkSizes: content.artworkSizes,
      releaseType: content.releaseType,
      totalTracks: content.totalTracks,
      credits: content.credits,
    },
    creator,
    trackList
  );

  const isUnreleased =
    content.releaseDate && new Date(content.releaseDate) > new Date();

  // Check if the creator's plan allows unreleased content features
  let showUnreleasedHero = false;
  if (isUnreleased) {
    const creatorPlan = await getCreatorPlan(creator.id);
    showUnreleasedHero = creatorPlan.canAccessFutureReleases;
  }

  // Check for promo downloads (releases only, not tracks)
  let downloadUrl: string | null = null;
  if (content.type === 'release' && content.id) {
    const { promoDownloads: promoDownloadsTable } = await import(
      '@/lib/db/schema/promo-downloads'
    );
    const { db: dbInstance } = await import('@/lib/db');
    const { eq, and } = await import('drizzle-orm');
    const [hasDownloads] = await dbInstance
      .select({ id: promoDownloadsTable.id })
      .from(promoDownloadsTable)
      .where(
        and(
          eq(promoDownloadsTable.releaseId, content.id),
          eq(promoDownloadsTable.isActive, true)
        )
      )
      .limit(1);

    if (hasDownloads) {
      downloadUrl = `/${creator.usernameNormalized}/${content.slug}/download`;
    }
  }

  return (
    <>
      <script type='application/ld+json'>
        {safeJsonLdStringify(structuredData)}
      </script>

      {/* Client-side auto-redirect to preferred DSP (preserves ISR caching) */}
      {!isUnreleased && (
        <PreferredDspRedirect
          providerLinks={content.providerLinks}
          artistHandle={creator.usernameNormalized}
          tracking={{
            contentType: content.type,
            contentId: content.id,
            smartLinkSlug: content.slug,
          }}
        />
      )}

      <ContentPageBody
        isUnreleased={!!isUnreleased}
        showUnreleasedHero={showUnreleasedHero}
        content={content}
        creator={creator}
        allProviders={allProviders}
        previewState={previewState}
        soundsUrl={soundsUrl}
        downloadUrl={downloadUrl}
      />
    </>
  );
}

function ContentPageBody({
  isUnreleased,
  showUnreleasedHero,
  content,
  creator,
  allProviders,
  previewState,
  soundsUrl,
  downloadUrl,
}: Readonly<{
  isUnreleased: boolean;
  showUnreleasedHero: boolean;
  content: Content;
  creator: Creator;
  allProviders: Array<{
    key: ProviderKey;
    label: string;
    accent: string;
    url: string | null;
    confidence?: import('@/lib/discography/types').ProviderConfidence;
  }>;
  previewState: ReturnType<typeof derivePreviewState>;
  soundsUrl: string | null;
  downloadUrl: string | null;
}>) {
  const artistName = creator.displayName ?? creator.username;

  // Extract featured artists from credits for inline display
  const featuredArtists: FeaturedArtist[] =
    content.credits
      ?.find(g => g.role === 'featured_artist')
      ?.entries.map(e => ({ name: e.name, handle: e.handle })) ?? [];

  if (isUnreleased && showUnreleasedHero) {
    return (
      <UnreleasedReleaseHero
        release={{
          id:
            content.type === 'release'
              ? content.id
              : (content.releaseId ?? content.id),
          trackId: content.type === 'track' ? content.id : null,
          slug: content.slug,
          title: content.title,
          artworkUrl: content.artworkUrl,
          releaseDate: content.releaseDate!,
          hasSpotify: content.providerLinks.some(
            link => link.providerId === 'spotify'
          ),
          hasAppleMusic: content.providerLinks.some(
            link => link.providerId === 'apple_music'
          ),
        }}
        artist={{
          id: creator.id,
          name: artistName,
          handle: creator.usernameNormalized,
          avatarUrl: creator.avatarUrl,
        }}
      />
    );
  }

  if (isUnreleased) {
    return (
      <ScheduledReleasePage
        release={{
          title: content.title,
          artworkUrl: content.artworkUrl,
        }}
        artist={{
          name: artistName,
          handle: creator.usernameNormalized,
        }}
      />
    );
  }

  return (
    <ReleaseLandingPage
      release={{
        title: content.title,
        artworkUrl: content.artworkUrl,
        releaseDate: toISOStringOrNull(content.releaseDate),
        previewUrl: content.previewUrl ?? null,
        isrc: content.isrc ?? null,
        previewVerification: previewState.previewVerification,
        previewSource: previewState.previewSource,
      }}
      artist={{
        name: artistName,
        handle: creator.usernameNormalized,
        avatarUrl: creator.avatarUrl,
      }}
      featuredArtists={featuredArtists}
      providers={allProviders}
      credits={content.credits}
      artworkSizes={content.artworkSizes}
      allowDownloads={
        (creator.settings as Record<string, unknown> | null)
          ?.allowArtworkDownloads === true
      }
      soundsUrl={soundsUrl}
      tracking={{
        contentType: content.type,
        contentId: content.id,
        smartLinkSlug: content.slug,
      }}
      claimBanner={
        creator.isClaimed
          ? null
          : {
              profileId: creator.id,
              username: creator.usernameNormalized,
            }
      }
      downloadUrl={downloadUrl}
    />
  );
}

/** Resolve the best OG image URL, size, height, and MIME type from content artwork data. */
function resolveOgImage(
  artworkSizes: Record<string, string> | null | undefined,
  artworkUrl: string | null
): { url: string; width: number; height: number; type: string } {
  const defaultImage = `${BASE_URL}/og/default.png`;
  const url =
    artworkSizes?.['1000'] ??
    artworkSizes?.original ??
    artworkUrl ??
    defaultImage;
  const isDefault = url === defaultImage;

  let width = 1200;
  if (artworkSizes?.['1000']) {
    width = 1000;
  } else if (!artworkSizes?.original && artworkUrl) {
    width = 640;
  }

  const height = isDefault ? 630 : width;

  const EXT_TO_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
  };

  let type = 'image/jpeg';
  if (isDefault) {
    type = 'image/png';
  } else {
    for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
      if (url.includes(ext)) {
        type = mime;
        break;
      }
    }
  }

  return { url, width, height, type };
}

/** Build the SEO description for a content page. */
function buildContentDescription(
  content: {
    title: string;
    releaseDate: Date | null;
    providerLinks: Array<{ providerId: string }>;
  },
  artistName: string,
  isUnreleased: boolean
): string {
  const releaseYear = content.releaseDate
    ? ` (${content.releaseDate.getFullYear()})`
    : '';

  if (isUnreleased) {
    return `"${content.title}"${releaseYear} by ${artistName} is coming soon. Get notified when it drops on Jovie.`;
  }

  const streamingPlatforms =
    content.providerLinks.length > 0
      ? content.providerLinks
          .slice(0, 3)
          .map(
            l =>
              PROVIDER_CONFIG[l.providerId as ProviderKey]?.label ||
              l.providerId
          )
          .join(', ')
      : 'Spotify, Apple Music';

  return `Listen to "${content.title}"${releaseYear} by ${artistName} on Jovie. Available on ${streamingPlatforms} and more.`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { username, slug } = await params;

  if (!username || !slug) {
    return { title: 'Not Found' };
  }

  const normalizedUsername = username.toLowerCase();
  const creator = await getCreatorByUsername(normalizedUsername);
  if (!creator) {
    return { title: 'Not Found' };
  }

  const content = await getContentBySlug(creator.id, slug);
  if (!content) {
    return { title: 'Not Found' };
  }

  const artistName = creator.displayName ?? creator.username;
  const contentType = content.type === 'release' ? 'album' : 'song';
  const canonicalUrl = `${BASE_URL}/${creator.usernameNormalized}/${content.slug}`;

  const isUnreleased =
    content.releaseDate && new Date(content.releaseDate) > new Date();

  const title = isUnreleased
    ? `${content.title} by ${artistName} - Coming Soon`
    : `${content.title} by ${artistName} - Stream Now`;

  const description = buildContentDescription(
    content,
    artistName,
    !!isUnreleased
  );

  const keywords = [
    content.title,
    artistName,
    `${artistName} ${content.title}`,
    `${content.title} lyrics`,
    `${content.title} stream`,
    `${artistName} music`,
    `${artistName} ${contentType}`,
    'stream music',
    'music links',
  ];

  const ogType = content.type === 'release' ? 'music.album' : 'music.song';
  const ogImage = resolveOgImage(content.artworkSizes, content.artworkUrl);
  const artworkAlt = `${content.title} ${content.type === 'release' ? 'album' : 'track'} artwork`;

  return {
    title,
    description,
    keywords,
    authors: [{ name: artistName }],
    creator: artistName,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: canonicalUrl,
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
      type: ogType,
      title: `${content.title} by ${artistName}`,
      description,
      url: canonicalUrl,
      siteName: 'Jovie',
      locale: 'en_US',
      images: [
        {
          url: ogImage.url,
          width: ogImage.width,
          height: ogImage.height,
          alt: artworkAlt,
          type: ogImage.type,
        },
      ],
      ...(content.type === 'track' &&
        content.previewUrl && {
          audio: content.previewUrl,
        }),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${content.title} by ${artistName}`,
      description,
      creator: '@jovieapp',
      site: '@jovieapp',
      images: [
        {
          url: ogImage.url,
          alt: artworkAlt,
        },
      ],
    },
    other: {
      'music:musician': `${BASE_URL}/${creator.usernameNormalized}`,
      'music:release_type': content.releaseType ?? content.type,
      ...(content.releaseDate && {
        'music:release_date': toDateOnlySafe(content.releaseDate),
      }),
    },
  };
}

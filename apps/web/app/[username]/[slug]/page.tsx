/**
 * Content Smart Link Landing Page (/{username}/{slug})
 *
 * Public-facing page that shows release or track artwork, title, and streaming
 * platform buttons. This is the new short URL format.
 *
 * When a `?dsp=` query param is present, redirects directly to that provider.
 */

import { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { UnreleasedReleaseHero } from '@/components/release';
import { BASE_URL } from '@/constants/app';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import { findRedirectByOldSlug } from '@/lib/discography/slug';
import type { ProviderKey } from '@/lib/discography/types';
import { VIDEO_PROVIDER_KEYS } from '@/lib/discography/video-providers';
import { generateArtworkImageObject } from '@/lib/images/seo';
import { trackServerEvent } from '@/lib/server-analytics';
import { toDateOnlySafe, toISOStringOrNull } from '@/lib/utils/date';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import { getContentBySlug, getCreatorByUsername } from './_lib/data';

// Use ISR with 5-minute revalidation for smart link pages
export const revalidate = 300;

/** Maps release type enum to schema.org MusicAlbumReleaseType values */
const RELEASE_TYPE_SCHEMA_MAP: Record<string, string> = {
  single: 'https://schema.org/SingleRelease',
  ep: 'https://schema.org/EPRelease',
  album: 'https://schema.org/AlbumRelease',
  compilation: 'https://schema.org/CompilationAlbum',
};

/**
 * Generate JSON-LD structured data for music content SEO.
 */
function generateMusicStructuredData(
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
  },
  creator: {
    displayName: string | null;
    username: string;
    usernameNormalized: string;
  }
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

  const musicSchema = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    '@id': `${contentUrl}#${content.type}`,
    name: content.title,
    url: contentUrl,
    ...(imageValue && { image: imageValue }),
    ...(content.releaseDate && {
      datePublished: toDateOnlySafe(content.releaseDate),
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
        item: artistUrl,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: content.title,
        item: contentUrl,
      },
    ],
  };

  return { musicSchema, breadcrumbSchema };
}

interface PageProps {
  readonly params: Promise<{ username: string; slug: string }>;
  readonly searchParams: Promise<{ dsp?: string }>;
}

/**
 * Pick the best provider URL based on priority.
 */
function pickProviderUrl(
  links: Array<{ providerId: string; url: string }>,
  forcedProvider?: ProviderKey | null
): string | null {
  if (forcedProvider) {
    return links.find(link => link.providerId === forcedProvider)?.url ?? null;
  }

  for (const key of PRIMARY_PROVIDER_KEYS) {
    const match = links.find(link => link.providerId === key);
    if (match?.url) return match.url;
  }

  const fallback = links.find(link => link.url);
  return fallback?.url ?? null;
}

type Creator = NonNullable<Awaited<ReturnType<typeof getCreatorByUsername>>>;
type Content = NonNullable<Awaited<ReturnType<typeof getContentBySlug>>>;

/**
 * Resolves content by slug, handling old-slug redirects.
 * Calls notFound() if content cannot be found.
 */
async function resolveContentOrRedirect(
  creator: Creator,
  slug: string,
  dsp: string | undefined
): Promise<Content> {
  const content = await getContentBySlug(creator.id, slug);
  if (content) return content;

  const redirectInfo = await findRedirectByOldSlug(creator.id, slug);
  if (redirectInfo) {
    const dspQuery = dsp ? `?dsp=${encodeURIComponent(dsp)}` : '';
    permanentRedirect(
      `/${creator.usernameNormalized}/${redirectInfo.currentSlug}${dspQuery}`
    );
  }
  notFound();
}

/**
 * Handles direct DSP redirect when ?dsp= param is present.
 * Calls notFound() for invalid providers or redirect() on success.
 */
function handleDspRedirect(
  dsp: string,
  content: Content,
  creator: Creator
): never {
  const providerKey = dsp as ProviderKey;

  if (!PROVIDER_CONFIG[providerKey]) {
    notFound();
  }

  const targetUrl = pickProviderUrl(content.providerLinks, providerKey);
  if (!targetUrl) {
    notFound();
  }

  void trackServerEvent('smart_link_clicked', {
    contentType: content.type,
    contentId: content.id,
    profileId: creator.id,
    provider: providerKey,
    contentTitle: content.title,
  });

  redirect(targetUrl);
}

export default async function ContentSmartLinkPage({
  params,
  searchParams,
}: Readonly<PageProps>) {
  const { username, slug } = await params;
  const { dsp } = await searchParams;

  if (!username || !slug) {
    notFound();
  }

  const normalizedUsername = username.toLowerCase();

  const creator = await getCreatorByUsername(normalizedUsername);
  if (!creator) {
    notFound();
  }

  const content = await resolveContentOrRedirect(creator, slug, dsp);

  // If DSP is specified, redirect immediately
  if (dsp) {
    handleDspRedirect(dsp, content, creator);
  }

  // Build provider data for the landing page
  const providers = PRIMARY_PROVIDER_KEYS.map(key => {
    const link = content.providerLinks.find(l => l.providerId === key);
    return {
      key,
      label: PROVIDER_CONFIG[key].label,
      accent: PROVIDER_CONFIG[key].accent,
      url: link?.url ?? null,
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
      };
    })
    .filter(p => p.url);

  const allProviders = [...providers, ...secondaryProviders];

  // Check if any video provider links exist for "Use this sound"
  const hasVideoLinks = content.providerLinks.some(
    link =>
      Boolean(link.url) &&
      (VIDEO_PROVIDER_KEYS as string[]).includes(link.providerId)
  );
  const soundsUrl = hasVideoLinks
    ? `/${creator.usernameNormalized}/${content.slug}/sounds`
    : null;

  // Generate structured data for SEO
  const { musicSchema, breadcrumbSchema } = generateMusicStructuredData(
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
    },
    creator
  );

  const isUnreleased =
    content.releaseDate && new Date(content.releaseDate) > new Date();

  return (
    <>
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data, safe-serialized
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify(musicSchema),
        }}
      />
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data, safe-serialized
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify(breadcrumbSchema),
        }}
      />

      {isUnreleased ? (
        <UnreleasedReleaseHero
          release={{
            title: content.title,
            artworkUrl: content.artworkUrl,
            releaseDate: content.releaseDate!,
          }}
          artist={{
            id: creator.id,
            name: creator.displayName ?? creator.username,
            handle: creator.usernameNormalized,
            avatarUrl: creator.avatarUrl,
          }}
        />
      ) : (
        <ReleaseLandingPage
          release={{
            title: content.title,
            artworkUrl: content.artworkUrl,
            releaseDate: toISOStringOrNull(content.releaseDate),
          }}
          artist={{
            name: creator.displayName ?? creator.username,
            handle: creator.usernameNormalized,
            avatarUrl: creator.avatarUrl,
          }}
          providers={allProviders}
          artworkSizes={content.artworkSizes}
          allowDownloads={
            (creator.settings as Record<string, unknown> | null)
              ?.allowArtworkDownloads === true
          }
          soundsUrl={soundsUrl}
        />
      )}
    </>
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
    return `"${content.title}"${releaseYear} by ${artistName} is coming soon. Get notified when it drops!`;
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

  return `Listen to "${content.title}"${releaseYear} by ${artistName}. Available on ${streamingPlatforms} and more streaming platforms.`;
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
      'music:musician': artistName,
      'music:release_type': content.releaseType ?? content.type,
      ...(content.releaseDate && {
        'music:release_date': toDateOnlySafe(content.releaseDate),
      }),
    },
  };
}

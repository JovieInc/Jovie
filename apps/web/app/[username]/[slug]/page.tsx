/**
 * Content Smart Link Landing Page (/{username}/{slug})
 *
 * Public-facing page that shows release or track artwork, title, and streaming
 * platform buttons. This is the new short URL format.
 *
 * When a `?dsp=` query param is present, redirects directly to that provider.
 */

import { and, eq } from 'drizzle-orm';
import { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import Script from 'next/script';
import { cache } from 'react';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { PROFILE_URL } from '@/constants/app';
import { db } from '@/lib/db';
import {
  creatorProfiles,
  discogReleases,
  discogTracks,
  providerLinks,
} from '@/lib/db/schema';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import { findRedirectByOldSlug } from '@/lib/discography/slug';
import type { ProviderKey } from '@/lib/discography/types';
import { trackServerEvent } from '@/lib/server-analytics';

// Use ISR with 5-minute revalidation for smart link pages
export const revalidate = 300;

/**
 * Generate JSON-LD structured data for music content SEO.
 * Implements schema.org MusicRecording/MusicAlbum schemas.
 */
function generateMusicStructuredData(
  content: {
    type: 'release' | 'track';
    title: string;
    artworkUrl: string | null;
    releaseDate: Date | null;
    providerLinks: Array<{ providerId: string; url: string }>;
  },
  creator: {
    displayName: string | null;
    username: string;
    usernameNormalized: string;
  }
) {
  const artistName = creator.displayName ?? creator.username;
  const contentUrl = `${PROFILE_URL}/${creator.usernameNormalized}/${content.title.toLowerCase().replace(/\s+/g, '-')}`;
  const artistUrl = `${PROFILE_URL}/${creator.usernameNormalized}`;

  // Build sameAs array from provider links
  const sameAs = content.providerLinks.map(link => link.url);

  const schemaType =
    content.type === 'release' ? 'MusicAlbum' : 'MusicRecording';

  const musicSchema = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: content.title,
    url: contentUrl,
    ...(content.artworkUrl && { image: content.artworkUrl }),
    ...(content.releaseDate && {
      datePublished: content.releaseDate.toISOString().split('T')[0],
    }),
    byArtist: {
      '@type': 'MusicGroup',
      name: artistName,
      url: artistUrl,
    },
    ...(sameAs.length > 0 && { sameAs }),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: PROFILE_URL,
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
  params: Promise<{ username: string; slug: string }>;
  searchParams: Promise<{ dsp?: string }>;
}

type ContentType = 'release' | 'track';

interface ContentData {
  type: ContentType;
  id: string;
  title: string;
  slug: string;
  artworkUrl: string | null;
  releaseDate: Date | null;
  providerLinks: Array<{ providerId: string; url: string }>;
  creator: {
    id: string;
    displayName: string | null;
    username: string;
    usernameNormalized: string;
    avatarUrl: string | null;
  };
}

/**
 * Fetch creator by normalized username.
 */
const getCreatorByUsername = cache(async (usernameNormalized: string) => {
  const [creator] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      avatarUrl: creatorProfiles.avatarUrl,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
    .limit(1);

  return creator ?? null;
});

/**
 * Fetch content (release or track) by creator and slug.
 */
const getContentBySlug = cache(
  async (
    creatorProfileId: string,
    slug: string
  ): Promise<Omit<ContentData, 'creator'> | null> => {
    // Try release first
    const [release] = await db
      .select({
        id: discogReleases.id,
        title: discogReleases.title,
        slug: discogReleases.slug,
        artworkUrl: discogReleases.artworkUrl,
        releaseDate: discogReleases.releaseDate,
      })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, creatorProfileId),
          eq(discogReleases.slug, slug)
        )
      )
      .limit(1);

    if (release) {
      const links = await db
        .select({
          providerId: providerLinks.providerId,
          url: providerLinks.url,
        })
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.ownerType, 'release'),
            eq(providerLinks.releaseId, release.id)
          )
        );

      return {
        type: 'release',
        id: release.id,
        title: release.title,
        slug: release.slug,
        artworkUrl: release.artworkUrl,
        releaseDate: release.releaseDate,
        providerLinks: links,
      };
    }

    // Try track
    const [track] = await db
      .select({
        id: discogTracks.id,
        title: discogTracks.title,
        slug: discogTracks.slug,
        releaseId: discogTracks.releaseId,
      })
      .from(discogTracks)
      .where(
        and(
          eq(discogTracks.creatorProfileId, creatorProfileId),
          eq(discogTracks.slug, slug)
        )
      )
      .limit(1);

    if (track) {
      // Get release for artwork
      const [releaseData] = await db
        .select({
          artworkUrl: discogReleases.artworkUrl,
          releaseDate: discogReleases.releaseDate,
        })
        .from(discogReleases)
        .where(eq(discogReleases.id, track.releaseId))
        .limit(1);

      const links = await db
        .select({
          providerId: providerLinks.providerId,
          url: providerLinks.url,
        })
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.ownerType, 'track'),
            eq(providerLinks.trackId, track.id)
          )
        );

      return {
        type: 'track',
        id: track.id,
        title: track.title,
        slug: track.slug,
        artworkUrl: releaseData?.artworkUrl ?? null,
        releaseDate: releaseData?.releaseDate ?? null,
        providerLinks: links,
      };
    }

    return null;
  }
);

/**
 * Pick the best provider URL based on priority.
 */
function pickProviderUrl(
  links: Array<{ providerId: string; url: string }>,
  forcedProvider?: ProviderKey | null
): string | null {
  // When a provider is explicitly requested (?dsp=), do not fall back to others.
  if (forcedProvider) {
    return links.find(link => link.providerId === forcedProvider)?.url ?? null;
  }

  for (const key of PRIMARY_PROVIDER_KEYS) {
    const match = links.find(link => link.providerId === key);
    if (match?.url) return match.url;
  }

  // Fallback to any available provider
  const fallback = links.find(link => link.url);
  return fallback?.url ?? null;
}

export default async function ContentSmartLinkPage({
  params,
  searchParams,
}: PageProps) {
  const { username, slug } = await params;
  const { dsp } = await searchParams;

  if (!username || !slug) {
    notFound();
  }

  // Normalize username for lookup
  const normalizedUsername = username.toLowerCase();

  // Get creator
  const creator = await getCreatorByUsername(normalizedUsername);
  if (!creator) {
    notFound();
  }

  // Get content
  let content = await getContentBySlug(creator.id, slug);

  // If content not found, check for redirect
  if (!content) {
    const redirectInfo = await findRedirectByOldSlug(creator.id, slug);
    if (redirectInfo) {
      // Permanent redirect to the new slug
      const dspQuery = dsp ? `?dsp=${encodeURIComponent(dsp)}` : '';
      permanentRedirect(
        `/${creator.usernameNormalized}/${redirectInfo.currentSlug}${dspQuery}`
      );
    }
    notFound();
  }

  // If DSP is specified, redirect immediately
  if (dsp) {
    const providerKey = dsp as ProviderKey;

    // Validate provider
    if (!PROVIDER_CONFIG[providerKey]) {
      notFound();
    }

    const targetUrl = pickProviderUrl(content.providerLinks, providerKey);
    if (!targetUrl) {
      notFound();
    }

    // Track the click (fire-and-forget, don't block redirect)
    void trackServerEvent('smart_link_clicked', {
      contentType: content.type,
      contentId: content.id,
      profileId: creator.id,
      provider: providerKey,
      contentTitle: content.title,
    });

    redirect(targetUrl);
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

  // Also include secondary providers that have URLs
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

  // Generate structured data for SEO
  const { musicSchema, breadcrumbSchema } = generateMusicStructuredData(
    {
      type: content.type,
      title: content.title,
      artworkUrl: content.artworkUrl,
      releaseDate: content.releaseDate,
      providerLinks: content.providerLinks,
    },
    creator
  );

  // Use the same landing page component for both releases and tracks
  return (
    <>
      {/* JSON-LD Structured Data for SEO */}
      <Script
        id='music-schema'
        type='application/ld+json'
        strategy='afterInteractive'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(musicSchema) }}
      />
      <Script
        id='breadcrumb-schema'
        type='application/ld+json'
        strategy='afterInteractive'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <ReleaseLandingPage
        release={{
          title: content.title,
          artworkUrl: content.artworkUrl,
          releaseDate: content.releaseDate?.toISOString() ?? null,
        }}
        artist={{
          name: creator.displayName ?? creator.username,
          avatarUrl: creator.avatarUrl,
        }}
        providers={allProviders}
        slug={`${creator.usernameNormalized}/${content.slug}`}
      />
    </>
  );
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
  const canonicalUrl = `${PROFILE_URL}/${creator.usernameNormalized}/${content.slug}`;

  // Build SEO-optimized title
  const title = `${content.title} by ${artistName} - Stream Now`;

  // Build rich description with streaming context
  const releaseYear = content.releaseDate
    ? ` (${content.releaseDate.getFullYear()})`
    : '';
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
  const description = `Listen to "${content.title}"${releaseYear} by ${artistName}. Available on ${streamingPlatforms} and more streaming platforms.`;

  // Build dynamic keywords
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

  // Determine OG type based on content type
  const ogType = content.type === 'release' ? 'music.album' : 'music.song';

  return {
    title,
    description,
    keywords,
    authors: [{ name: artistName }],
    creator: artistName,
    metadataBase: new URL(PROFILE_URL),
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
      images: content.artworkUrl
        ? [
            {
              url: content.artworkUrl,
              width: 640,
              height: 640,
              alt: `${content.title} ${content.type === 'release' ? 'album' : 'track'} artwork`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${content.title} by ${artistName}`,
      description,
      creator: '@jovieapp',
      site: '@jovieapp',
      images: content.artworkUrl
        ? [
            {
              url: content.artworkUrl,
              alt: `${content.title} artwork`,
            },
          ]
        : undefined,
    },
    other: {
      'music:musician': artistName,
      'music:release_type': content.type,
      ...(content.releaseDate && {
        'music:release_date': content.releaseDate.toISOString().split('T')[0],
      }),
    },
  };
}

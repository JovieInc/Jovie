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
import { getCreatorEntitlements } from '@/lib/entitlements/creator-plan';
import { trackServerEvent } from '@/lib/server-analytics';
import { toDateOnlySafe, toISOStringOrNull } from '@/lib/utils/date';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import { appendUTMParamsToUrl, extractUTMParams } from '@/lib/utm';
import {
  getContentBySlug,
  getCreatorByUsername,
  getReleaseTrackList,
} from './_lib/data';
import { isMissingPromoDownloadsRelation } from './_lib/promo-download-errors';
import { generateMusicStructuredData } from './music-structured-data';

// Use ISR with 5-minute revalidation for smart link pages
export const revalidate = 300;

interface PageProps {
  readonly params: Promise<{ username: string; slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  searchParams: URLSearchParams
): Promise<Content> {
  const content = await getContentBySlug(creator.id, slug);
  if (content) return content;

  const redirectInfo = await findRedirectByOldSlug(creator.id, slug);
  if (redirectInfo) {
    const queryString = searchParams.toString();
    const suffix = queryString ? `?${queryString}` : '';
    permanentRedirect(
      `/${creator.usernameNormalized}/${redirectInfo.currentSlug}${suffix}`
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
  creator: Creator,
  utmParams: ReturnType<typeof extractUTMParams>
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
    utmParams,
  });

  redirect(appendUTMParamsToUrl(targetUrl, utmParams));
}

export default async function ContentSmartLinkPage({
  params,
  searchParams,
}: Readonly<PageProps>) {
  const { username, slug } = await params;
  const allSearchParams = await searchParams;
  const dspParam = allSearchParams.dsp;
  const dsp = typeof dspParam === 'string' ? dspParam : undefined;
  const noredirectParam = allSearchParams.noredirect;
  const noredirect =
    typeof noredirectParam === 'string' ? noredirectParam : undefined;
  const requestSearchParams = new URLSearchParams(
    Object.entries(allSearchParams).flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map(v => [key, v]);
      }
      return typeof value === 'string' ? [[key, value]] : [];
    })
  );
  const utmParams = extractUTMParams(requestSearchParams);

  if (!username || !slug) {
    notFound();
  }

  const normalizedUsername = username.toLowerCase();

  const creator = await getCreatorByUsername(normalizedUsername);
  if (!creator) {
    notFound();
  }

  const content = await resolveContentOrRedirect(
    creator,
    slug,
    requestSearchParams
  );

  // If this is a track with a known parent release, permanently redirect to the nested URL.
  // Tracks should be deep links of releases: /{handle}/{releaseSlug}/{trackSlug}
  if (content.type === 'track' && content.releaseSlug) {
    const queryString = requestSearchParams.toString();
    const suffix = queryString ? `?${queryString}` : '';
    permanentRedirect(
      `/${creator.usernameNormalized}/${content.releaseSlug}/${content.slug}${suffix}`
    );
  }

  // If DSP is specified, redirect immediately
  if (dsp) {
    handleDspRedirect(dsp, content, creator, utmParams);
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
      durationMs: content.durationMs,
      isrc: content.isrc,
      trackNumber: content.trackNumber,
      inAlbum:
        content.type === 'track' && content.releaseId && content.releaseTitle
          ? {
              id: `${BASE_URL}/${creator.usernameNormalized}/${content.releaseSlug ?? content.slug}#release`,
              title: content.releaseTitle,
              url: `${BASE_URL}/${creator.usernameNormalized}/${content.releaseSlug ?? content.slug}`,
            }
          : null,
    },
    creator,
    BASE_URL,
    trackList
  );

  const isUnreleased =
    content.releaseDate && new Date(content.releaseDate) > new Date();

  // Check if the creator's plan allows unreleased content features
  let showUnreleasedHero = false;
  let creatorEntitlements: Awaited<
    ReturnType<typeof getCreatorEntitlements>
  > | null = null;
  if (isUnreleased) {
    creatorEntitlements = await getCreatorEntitlements(creator.id);
    showUnreleasedHero =
      creatorEntitlements.entitlements.booleans.canAccessFutureReleases;
  }

  // Check for promo downloads (releases only, not tracks)
  let downloadUrl: string | null = null;
  if (content.type === 'release' && content.id) {
    creatorEntitlements ??= await getCreatorEntitlements(creator.id);

    if (creatorEntitlements.plan !== 'free') {
      try {
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
      } catch (error) {
        if (!isMissingPromoDownloadsRelation(error)) {
          throw error;
        }
      }
    }
  }

  return (
    <>
      <script type='application/ld+json'>
        {safeJsonLdStringify(structuredData)}
      </script>

      {/* Client-side auto-redirect to preferred DSP (preserves ISR caching) */}
      {!isUnreleased && noredirect !== '1' && (
        <PreferredDspRedirect
          providerLinks={content.providerLinks}
          redirectBasePath={`/${creator.usernameNormalized}/${content.slug}`}
        />
      )}

      <ContentPageBody
        isUnreleased={!!isUnreleased}
        showUnreleasedHero={showUnreleasedHero}
        content={content}
        creator={creator}
        allProviders={allProviders}
        previewState={previewState}
        utmParams={utmParams}
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
  utmParams,
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
  utmParams: ReturnType<typeof extractUTMParams>;
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
      utmParams={utmParams}
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

/**
 * Track Deep Link Page (/{username}/{releaseSlug}/{trackSlug})
 *
 * Public-facing page for individual tracks, nested under their parent release.
 * Shows track artwork, title, "from [Release Name]" link, and streaming buttons.
 *
 * When a `?dsp=` query param is present, redirects directly to that provider.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { BASE_URL } from '@/constants/app';
import {
  derivePreviewState,
  getProviderConfidence,
} from '@/lib/discography/audio-qa';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { generateArtworkImageObject } from '@/lib/images/seo';
import { trackServerEvent } from '@/lib/server-analytics';
import { toISOStringOrNull } from '@/lib/utils/date';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import { appendUTMParamsToUrl, extractUTMParams } from '@/lib/utm';
import {
  getContentBySlug,
  getCreatorByUsername,
  getCreatorPlan,
  getTrackBySlugInRelease,
} from '../_lib/data';

export const revalidate = 300;

interface PageProps {
  readonly params: Promise<{
    username: string;
    slug: string;
    trackSlug: string;
  }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toURLSearchParams(
  allSearchParams: Record<string, string | string[] | undefined>
): URLSearchParams {
  return new URLSearchParams(
    Object.entries(allSearchParams).flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map(v => [key, v]);
      }
      return typeof value === 'string' ? [[key, value]] : [];
    })
  );
}

async function guardUnreleasedContent(
  track: { releaseDate: Date | null },
  creatorId: string
): Promise<void> {
  const isUnreleased =
    track.releaseDate && new Date(track.releaseDate) > new Date();
  if (isUnreleased) {
    const creatorPlan = await getCreatorPlan(creatorId);
    if (!creatorPlan.canAccessFutureReleases) {
      notFound();
    }
  }
}

function handleDspRedirect(
  dsp: string,
  track: {
    id: string;
    title: string;
    providerLinks: { providerId: string; url: string }[];
  },
  creatorId: string,
  utmParams: Record<string, string>
): never {
  const providerKey = dsp as ProviderKey;
  if (!PROVIDER_CONFIG[providerKey]) {
    notFound();
  }
  const targetUrl = track.providerLinks.find(
    link => link.providerId === providerKey
  )?.url;
  if (!targetUrl) {
    notFound();
  }

  void trackServerEvent('smart_link_clicked', {
    contentType: 'track',
    contentId: track.id,
    profileId: creatorId,
    provider: providerKey,
    contentTitle: track.title,
    utmParams,
  });

  redirect(appendUTMParamsToUrl(targetUrl, utmParams));
}

export default async function TrackDeepLinkPage({
  params,
  searchParams,
}: Readonly<PageProps>) {
  const { username, slug, trackSlug } = await params;
  const allSearchParams = await searchParams;
  const dspParam = allSearchParams.dsp;
  const dsp = typeof dspParam === 'string' ? dspParam : undefined;
  const utmParams = extractUTMParams(toURLSearchParams(allSearchParams));

  if (!username || !slug || !trackSlug) {
    notFound();
  }

  const normalizedUsername = username.toLowerCase();

  const creator = await getCreatorByUsername(normalizedUsername);
  if (!creator) {
    notFound();
  }

  // Resolve the parent release by slug
  const releaseContent = await getContentBySlug(creator.id, slug);
  if (releaseContent?.type !== 'release') {
    notFound();
  }

  // Resolve the track within this specific release
  const track = await getTrackBySlugInRelease(releaseContent.id, trackSlug);
  if (!track) {
    notFound();
  }

  await guardUnreleasedContent(track, creator.id);

  // If DSP is specified, redirect to the provider URL for this track
  if (dsp) {
    handleDspRedirect(dsp, track, creator.id, utmParams);
  }

  // Build provider data for the landing page
  const allProviders = (Object.keys(PROVIDER_CONFIG) as ProviderKey[])
    .map(key => {
      const link = track.providerLinks.find(l => l.providerId === key);
      return {
        key,
        label: PROVIDER_CONFIG[key].label,
        accent: PROVIDER_CONFIG[key].accent,
        url: link?.url ?? null,
        confidence: link ? getProviderConfidence(link) : 'unknown',
      };
    })
    .filter(p => p.url);
  const previewState = derivePreviewState({
    audioUrl: null,
    previewUrl: track.previewUrl ?? null,
    metadata: track.previewMetadata ?? null,
    providerLinks: track.providerLinks,
  });

  const artistName = creator.displayName ?? creator.username;
  const trackUrl = `${BASE_URL}/${creator.usernameNormalized}/${slug}/${trackSlug}`;
  const releaseUrl = `${BASE_URL}/${creator.usernameNormalized}/${slug}`;

  // MusicRecording structured data with inAlbum reference
  const musicSchema = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    '@id': `${trackUrl}#track`,
    name: track.title,
    url: trackUrl,
    ...(track.artworkUrl && {
      image: generateArtworkImageObject(track.artworkUrl, {
        title: track.title,
        artistName,
        contentType: 'track',
      }),
    }),
    ...(track.releaseDate && {
      datePublished: toISOStringOrNull(track.releaseDate)?.split('T')[0],
    }),
    byArtist: {
      '@type': 'MusicGroup',
      '@id': `${BASE_URL}/${creator.usernameNormalized}#musicgroup`,
      name: artistName,
      url: `${BASE_URL}/${creator.usernameNormalized}`,
    },
    inAlbum: {
      '@type': 'MusicAlbum',
      name: releaseContent.title,
      url: releaseUrl,
    },
    sameAs: track.providerLinks.map(link => link.url),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: artistName,
        item: `${BASE_URL}/${creator.usernameNormalized}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: releaseContent.title,
        item: releaseUrl,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: track.title,
        item: trackUrl,
      },
    ],
  };

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

      <ReleaseLandingPage
        release={{
          title: track.title,
          artworkUrl: track.artworkUrl,
          releaseDate: toISOStringOrNull(track.releaseDate),
          previewUrl: track.previewUrl ?? null,
          isrc: track.isrc ?? null,
          previewVerification: previewState.previewVerification,
          previewSource: previewState.previewSource,
        }}
        artist={{
          name: artistName,
          handle: creator.usernameNormalized,
          avatarUrl: creator.avatarUrl,
        }}
        providers={allProviders}
        utmParams={utmParams}
        tracking={{
          contentType: 'track',
          contentId: track.id,
          smartLinkSlug: trackSlug,
        }}
        parentRelease={{
          title: releaseContent.title,
          url: `/${creator.usernameNormalized}/${slug}`,
        }}
        claimBanner={
          creator.isClaimed
            ? null
            : {
                profileId: creator.id,
                username: creator.usernameNormalized,
              }
        }
      />
    </>
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { username, slug, trackSlug } = await params;

  if (!username || !slug || !trackSlug) {
    return { title: 'Not Found' };
  }

  const normalizedUsername = username.toLowerCase();
  const creator = await getCreatorByUsername(normalizedUsername);
  if (!creator) {
    return { title: 'Not Found' };
  }

  const releaseContent = await getContentBySlug(creator.id, slug);
  if (releaseContent?.type !== 'release') {
    return { title: 'Not Found' };
  }

  const track = await getTrackBySlugInRelease(releaseContent.id, trackSlug);
  if (!track) {
    return { title: 'Not Found' };
  }

  // Mirror the unreleased guard from the page component (cache() means no extra DB cost)
  const isUnreleased =
    track.releaseDate && new Date(track.releaseDate) > new Date();
  if (isUnreleased) {
    const creatorPlan = await getCreatorPlan(creator.id);
    if (!creatorPlan.canAccessFutureReleases) {
      return { title: 'Not Found' };
    }
  }

  const artistName = creator.displayName ?? creator.username;
  const canonicalUrl = `${BASE_URL}/${creator.usernameNormalized}/${slug}/${trackSlug}`;

  const title = `${track.title} by ${artistName}`;
  const description = `Listen to "${track.title}" by ${artistName} from "${releaseContent.title}" on your favorite streaming platform.`;

  const defaultImage = `${BASE_URL}/og/default.png`;
  const ogImageUrl = track.artworkUrl ?? defaultImage;

  return {
    title,
    description,
    metadataBase: new URL(BASE_URL),
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'music.song',
      title,
      description,
      url: canonicalUrl,
      siteName: 'Jovie',
      images: ogImageUrl ? [{ url: ogImageUrl }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImageUrl ? [{ url: ogImageUrl }] : [],
    },
  };
}

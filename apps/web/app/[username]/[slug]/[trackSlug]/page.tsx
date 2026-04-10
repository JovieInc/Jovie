/**
 * Track Deep Link Page (/{username}/{releaseSlug}/{trackSlug})
 *
 * Public-facing page for individual tracks, nested under their parent release.
 * Shows track artwork, title, "from [Release Name]" link, and streaming buttons.
 *
 * When a `?dsp=` query param is present, redirects directly to that provider.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PreferredDspRedirect } from '@/app/[username]/[slug]/PreferredDspRedirect';
import { generateMusicStructuredData } from '@/app/[username]/[slug]/page';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { BASE_URL } from '@/constants/app';
import { buildBreadcrumbObject } from '@/lib/constants/schemas';
import {
  derivePreviewState,
  getProviderConfidence,
} from '@/lib/discography/audio-qa';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { toISOStringOrNull } from '@/lib/utils/date';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import {
  getContentBySlug,
  getCreatorByUsername,
  getCreatorPlan,
  getFeaturedTrackStaticParams,
  getTrackBySlugInRelease,
} from '../_lib/data';

export const revalidate = 300;

export async function generateStaticParams() {
  try {
    return await getFeaturedTrackStaticParams();
  } catch {
    // Build-time DB failures should not block deployment.
    return [];
  }
}

interface PageProps {
  readonly params: Promise<{
    username: string;
    slug: string;
    trackSlug: string;
  }>;
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

export default async function TrackDeepLinkPage({
  params,
}: Readonly<PageProps>) {
  const { username, slug, trackSlug } = await params;

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

  // Reuse shared structured data generator with track-specific fields
  const structuredData = generateMusicStructuredData(
    {
      type: 'track',
      title: track.title,
      slug: `${slug}/${trackSlug}`,
      artworkUrl: track.artworkUrl,
      releaseDate: track.releaseDate,
      providerLinks: track.providerLinks,
      durationMs: track.durationMs,
      isrc: track.isrc,
      trackNumber: track.trackNumber,
      inAlbum: {
        title: releaseContent.title,
        url: releaseUrl,
        id: `${releaseUrl}#release`,
      },
    },
    creator
  );

  // Add the deeper breadcrumb (4 levels instead of 3)
  const graph = structuredData['@graph'] as Array<Record<string, unknown>>;
  const bcIndex = graph.findIndex(s => s['@type'] === 'BreadcrumbList');
  if (bcIndex >= 0) {
    graph[bcIndex] = buildBreadcrumbObject([
      { name: 'Home', url: BASE_URL },
      { name: artistName, url: `${BASE_URL}/${creator.usernameNormalized}` },
      { name: releaseContent.title, url: releaseUrl },
      { name: track.title, url: trackUrl },
    ]);
  }

  return (
    <>
      <script type='application/ld+json'>
        {safeJsonLdStringify(structuredData)}
      </script>

      <PreferredDspRedirect
        providerLinks={track.providerLinks}
        artistHandle={creator.usernameNormalized}
        tracking={{
          contentType: 'track',
          contentId: track.id,
          smartLinkSlug: trackSlug,
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

  const keywords = [
    track.title,
    artistName,
    `${artistName} ${track.title}`,
    `${track.title} lyrics`,
    `${track.title} stream`,
    `${artistName} music`,
    'stream music',
    'music links',
  ];

  const trackDurationMs = track.durationMs ?? null;

  return {
    title,
    description,
    keywords,
    authors: [{ name: artistName }],
    creator: artistName,
    metadataBase: new URL(BASE_URL),
    alternates: { canonical: canonicalUrl },
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
      type: 'music.song',
      title,
      description,
      url: canonicalUrl,
      siteName: 'Jovie',
      locale: 'en_US',
      images: ogImageUrl ? [{ url: ogImageUrl }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      creator: '@jovieapp',
      site: '@jovieapp',
      images: ogImageUrl ? [{ url: ogImageUrl }] : [],
    },
    other: {
      'music:musician': `${BASE_URL}/${creator.usernameNormalized}`,
      'music:album': `${BASE_URL}/${creator.usernameNormalized}/${slug}`,
      ...(trackDurationMs &&
        trackDurationMs > 0 && {
          'music:duration': String(Math.floor(trackDurationMs / 1000)),
        }),
    },
  };
}

/**
 * Release Smart Link Landing Page (/r/[slug])
 *
 * Public-facing page that shows release artwork, title, and streaming platform buttons.
 * When a `?dsp=` query param is present, redirects directly to that provider.
 */

import { and, eq } from 'drizzle-orm';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { trackServerEvent } from '@/lib/server-analytics';
import { db } from '@/lib/db';
import {
  creatorProfiles,
  discogReleases,
  providerLinks,
} from '@/lib/db/schema';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseLandingPage } from './ReleaseLandingPage';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dsp?: string }>;
}

/**
 * Parse the smart link slug to extract releaseSlug and profileId
 * Format: {releaseSlug}--{profileId}
 */
function parseSmartLinkSlug(slug: string): {
  releaseSlug: string;
  profileId: string;
} | null {
  const separator = '--';
  const lastSeparatorIndex = slug.lastIndexOf(separator);

  if (lastSeparatorIndex === -1) {
    return null;
  }

  const releaseSlug = slug.slice(0, lastSeparatorIndex);
  const profileId = slug.slice(lastSeparatorIndex + separator.length);

  if (!releaseSlug || !profileId) {
    return null;
  }

  return { releaseSlug, profileId };
}

/**
 * Fetch release data with provider links and creator info
 */
async function getReleaseData(releaseSlug: string, profileId: string) {
  // First fetch the release
  const [release] = await db
    .select()
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, profileId),
        eq(discogReleases.slug, releaseSlug)
      )
    )
    .limit(1);

  if (!release) {
    return null;
  }

  // Fetch provider links
  const links = await db
    .select()
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.releaseId, release.id)
      )
    );

  // Fetch creator profile for display name
  const [creator] = await db
    .select({
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      avatarUrl: creatorProfiles.avatarUrl,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  return {
    release,
    providerLinks: links,
    creator: creator ?? {
      displayName: null,
      username: 'Unknown Artist',
      avatarUrl: null,
    },
  };
}

/**
 * Pick the best provider URL based on priority
 */
function pickProviderUrl(
  providerLinksData: { providerId: string; url: string }[],
  forcedProvider?: ProviderKey | null
): string | null {
  const providerOrder: ProviderKey[] = forcedProvider
    ? [
        forcedProvider,
        ...PRIMARY_PROVIDER_KEYS.filter(key => key !== forcedProvider),
      ]
    : PRIMARY_PROVIDER_KEYS;

  for (const key of providerOrder) {
    const match = providerLinksData.find(link => link.providerId === key);
    if (match?.url) return match.url;
  }

  // Fallback to any available provider
  const fallback = providerLinksData.find(link => link.url);
  return fallback?.url ?? null;
}

export default async function ReleaseSmartLinkPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { dsp } = await searchParams;

  if (!slug) {
    notFound();
  }

  // Parse the slug
  const parsed = parseSmartLinkSlug(slug);
  if (!parsed) {
    notFound();
  }

  const { releaseSlug, profileId } = parsed;

  // Fetch release data
  const data = await getReleaseData(releaseSlug, profileId);
  if (!data) {
    notFound();
  }

  const { release, providerLinks: links, creator } = data;

  // If dsp is specified, redirect immediately
  if (dsp) {
    const providerKey = dsp as ProviderKey;

    // Validate provider
    if (!PROVIDER_CONFIG[providerKey]) {
      notFound();
    }

    const targetUrl = pickProviderUrl(links, providerKey);
    if (!targetUrl) {
      notFound();
    }

    // Track the click (fire-and-forget, don't block redirect)
    void trackServerEvent('smart_link_clicked', {
      releaseId: release.id,
      profileId,
      provider: providerKey,
      releaseTitle: release.title,
    });

    redirect(targetUrl);
  }

  // Build provider data for the landing page
  const providers = PRIMARY_PROVIDER_KEYS.map(key => {
    const link = links.find(l => l.providerId === key);
    return {
      key,
      label: PROVIDER_CONFIG[key].label,
      accent: PROVIDER_CONFIG[key].accent,
      url: link?.url ?? null,
    };
  }).filter(p => p.url); // Only show providers with URLs

  // Also include secondary providers that have URLs
  const secondaryProviders = (Object.keys(PROVIDER_CONFIG) as ProviderKey[])
    .filter(key => !PRIMARY_PROVIDER_KEYS.includes(key))
    .map(key => {
      const link = links.find(l => l.providerId === key);
      return {
        key,
        label: PROVIDER_CONFIG[key].label,
        accent: PROVIDER_CONFIG[key].accent,
        url: link?.url ?? null,
      };
    })
    .filter(p => p.url);

  const allProviders = [...providers, ...secondaryProviders];

  return (
    <ReleaseLandingPage
      release={{
        title: release.title,
        artworkUrl: release.artworkUrl ?? null,
        releaseDate: release.releaseDate?.toISOString() ?? null,
      }}
      artist={{
        name: creator.displayName ?? creator.username,
        avatarUrl: creator.avatarUrl ?? null,
      }}
      providers={allProviders}
      slug={slug}
    />
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!slug) {
    return {
      title: 'Release Not Found',
    };
  }

  const parsed = parseSmartLinkSlug(slug);
  if (!parsed) {
    return {
      title: 'Release Not Found',
    };
  }

  const data = await getReleaseData(parsed.releaseSlug, parsed.profileId);
  if (!data) {
    return {
      title: 'Release Not Found',
    };
  }

  const { release, creator } = data;
  const artistName = creator.displayName ?? creator.username;
  const title = `${release.title} by ${artistName}`;
  const description = `Listen to "${release.title}" by ${artistName} on your favorite streaming platform.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: release.artworkUrl
        ? [
            {
              url: release.artworkUrl,
              width: 640,
              height: 640,
              alt: `${release.title} album artwork`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: release.artworkUrl ? [release.artworkUrl] : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

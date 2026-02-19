/**
 * "Use This Sound" Landing Page (/{username}/{slug}/sounds)
 *
 * Public-facing page that shows short-form video platform buttons
 * for creating content with the song's audio (TikTok, IG Reels, YT Shorts).
 *
 * Redirects to the main smart link if no video provider links exist.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import type { VideoProviderKey } from '@/lib/discography/types';
import {
  VIDEO_PROVIDER_CONFIG,
  VIDEO_PROVIDER_KEYS,
} from '@/lib/discography/video-providers';
import { trackServerEvent } from '@/lib/server-analytics';
import { getContentBySlug, getCreatorByUsername } from '../_lib/data';
import { SoundsLandingPage } from './SoundsLandingPage';

export const revalidate = 300;

interface PageProps {
  readonly params: Promise<{ username: string; slug: string }>;
}

export default async function SoundsPage({ params }: Readonly<PageProps>) {
  const { username, slug } = await params;

  if (!username || !slug) {
    notFound();
  }

  const normalizedUsername = username.toLowerCase();

  const creator = await getCreatorByUsername(normalizedUsername);
  if (!creator) {
    notFound();
  }

  const content = await getContentBySlug(creator.id, slug);
  if (!content) {
    notFound();
  }

  // Filter to only video provider links
  const videoLinks = content.providerLinks.filter(link =>
    (VIDEO_PROVIDER_KEYS as string[]).includes(link.providerId)
  );

  // No video links — redirect to the main smart link
  if (videoLinks.length === 0) {
    redirect(`/${creator.usernameNormalized}/${content.slug}`);
  }

  // Build video provider data for the page
  const videoProviders = VIDEO_PROVIDER_KEYS.map(key => {
    const link = videoLinks.find(l => l.providerId === key);
    if (!link) return null;
    const config = VIDEO_PROVIDER_CONFIG[key];
    return {
      key,
      label: config.label,
      cta: config.cta,
      accent: config.accent,
      url: link.url,
    };
  }).filter(
    (
      p
    ): p is {
      key: VideoProviderKey;
      label: string;
      cta: string;
      accent: string;
      url: string;
    } => p !== null
  );

  // Track page view
  void trackServerEvent('sounds_page_viewed', {
    contentType: content.type,
    contentId: content.id,
    profileId: creator.id,
    contentTitle: content.title,
    videoProviderCount: videoLinks.length,
  });

  const smartLinkPath = `/${creator.usernameNormalized}/${content.slug}`;

  return (
    <SoundsLandingPage
      release={{
        title: content.title,
        artworkUrl: content.artworkUrl,
      }}
      artist={{
        name: creator.displayName ?? creator.username,
        handle: creator.usernameNormalized,
      }}
      videoProviders={videoProviders}
      smartLinkPath={smartLinkPath}
    />
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
  const canonicalUrl = `${BASE_URL}/${creator.usernameNormalized}/${content.slug}/sounds`;

  const title = `Use "${content.title}" by ${artistName} — Create with this sound`;
  const description = `Create short-form videos with "${content.title}" by ${artistName}. Use this sound on TikTok, Instagram Reels, and YouTube Shorts.`;

  const defaultImage = `${BASE_URL}/og/default.png`;
  const ogImageUrl =
    content.artworkSizes?.['1000'] ??
    content.artworkSizes?.original ??
    content.artworkUrl ??
    defaultImage;

  return {
    title,
    description,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: canonicalUrl,
    },
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

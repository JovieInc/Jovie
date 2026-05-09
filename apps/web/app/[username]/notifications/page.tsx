import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { sanitizeMetadataText } from '@/lib/profile/metadata';
import { convertCreatorProfileToArtist } from '@/types/db';
import { getProfileAndLinks } from '../_lib/public-profile-loader';
import { NotificationsPageClient } from './NotificationsPageClient';

interface Props {
  readonly params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const result = await getProfileAndLinks(username);

  // Resolve the display name so the metadata reflects the artist name, not
  // just the raw URL segment. Falls back to the username if not found.
  const artistName =
    sanitizeMetadataText(
      result.profile?.display_name ?? result.profile?.username ?? username
    ) || username;

  const canonicalUsername =
    result.profile?.username_normalized ?? username.toLowerCase();

  return {
    title: `Get notifications from ${artistName}`,
    description: `Manage alerts for ${artistName}'s music, shows, and merch updates.`,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: `${BASE_URL}/${canonicalUsername}/notifications`,
    },
    openGraph: {
      type: 'website',
      title: `Get notifications from ${artistName}`,
      description: `Manage alerts for ${artistName}'s music, shows, and merch updates.`,
      url: `${BASE_URL}/${canonicalUsername}/notifications`,
      siteName: APP_NAME,
    },
    twitter: {
      card: 'summary',
      title: `Get notifications from ${artistName}`,
      description: `Manage alerts for ${artistName}'s music, shows, and merch updates.`,
    },
    robots: { index: false, follow: false },
  };
}

export default async function NotificationsPage({ params }: Props) {
  const { username } = await params;

  const result = await getProfileAndLinks(username);
  if (result.status !== 'ok' || !result.profile) notFound();

  const profile = result.profile;
  const artist = convertCreatorProfileToArtist(profile);

  return <NotificationsPageClient artist={artist} />;
}

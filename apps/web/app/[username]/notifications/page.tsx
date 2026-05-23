import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { getProfileModeHref } from '@/features/profile/registry';
import { sanitizeMetadataText } from '@/lib/profile/metadata';
import { getProfileAndLinks } from '../_lib/public-profile-loader';

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
  const canonical = `${BASE_URL}${getProfileModeHref(canonicalUsername, 'subscribe')}`;

  return {
    title: `Get notifications from ${artistName}`,
    description: `Manage alerts for ${artistName}'s music, shows, and merch updates.`,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      title: `Get notifications from ${artistName}`,
      description: `Manage alerts for ${artistName}'s music, shows, and merch updates.`,
      url: canonical,
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
  redirect(getProfileModeHref(username, 'subscribe'));
}

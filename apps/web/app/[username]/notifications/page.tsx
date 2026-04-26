import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { convertCreatorProfileToArtist } from '@/types/db';
import { getProfileAndLinks } from '../_lib/public-profile-loader';
import { NotificationsPageClient } from './NotificationsPageClient';

interface Props {
  readonly params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `Get notifications from ${username}`,
    description: `Manage alerts for ${username}'s music, shows, and merch updates.`,
    alternates: {
      canonical: `${BASE_URL}/${username.toLowerCase()}/notifications`,
    },
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

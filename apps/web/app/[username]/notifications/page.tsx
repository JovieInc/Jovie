import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { getProfileWithLinks } from '@/lib/services/profile';
import { convertCreatorProfileToArtist } from '@/types/db';
import { mapProfileWithLinksToCreatorProfile } from '../_lib/profile-mapper';
import { NotificationsPageClient } from './NotificationsPageClient';

interface Props {
  readonly params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `Get notifications from ${username}`,
    description: `Get notified whenever ${username} releases new music or goes on tour.`,
    alternates: {
      canonical: `${BASE_URL}/${username.toLowerCase()}/notifications`,
    },
  };
}

export default async function NotificationsPage({ params }: Props) {
  const { username } = await params;

  const result = await getProfileWithLinks(username);
  if (!result?.isPublic) notFound();

  const profile = mapProfileWithLinksToCreatorProfile(result);
  const artist = convertCreatorProfileToArtist(profile);

  return <NotificationsPageClient artist={artist} />;
}

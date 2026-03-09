import type { Metadata } from 'next';
import { BASE_URL } from '@/constants/app';
import { NotificationsPageClient } from './NotificationsPageClient';

interface Props {
  readonly params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `Get notifications from ${username}`,
    description: `Subscribe to receive updates whenever ${username} releases new content.`,
    alternates: {
      canonical: `${BASE_URL}/${username.toLowerCase()}/notifications`,
    },
  };
}

export default function NotificationsPage() {
  return <NotificationsPageClient />;
}

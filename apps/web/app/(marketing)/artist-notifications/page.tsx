import type { Metadata } from 'next';
import { ArtistNotificationsLanding } from '@/components/marketing/artist-notifications/ArtistNotificationsLanding';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';

export const revalidate = false;

const ARTIST_NOTIFICATIONS_URL = `${BASE_URL}${APP_ROUTES.ARTIST_NOTIFICATIONS}`;
const ARTIST_NOTIFICATIONS_OG_TITLE = `${ARTIST_NOTIFICATIONS_COPY.seo.title} | ${APP_NAME}`;
const ARTIST_NOTIFICATIONS_OG_IMAGE = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title: ARTIST_NOTIFICATIONS_COPY.seo.title,
  description: ARTIST_NOTIFICATIONS_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: ARTIST_NOTIFICATIONS_URL,
  },
  openGraph: {
    title: ARTIST_NOTIFICATIONS_OG_TITLE,
    description: ARTIST_NOTIFICATIONS_COPY.seo.description,
    url: ARTIST_NOTIFICATIONS_URL,
    siteName: APP_NAME,
    type: 'website',
    images: [
      {
        url: ARTIST_NOTIFICATIONS_OG_IMAGE,
        secureUrl: ARTIST_NOTIFICATIONS_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: ARTIST_NOTIFICATIONS_COPY.seo.title,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: ARTIST_NOTIFICATIONS_OG_TITLE,
    description: ARTIST_NOTIFICATIONS_COPY.seo.description,
    images: [ARTIST_NOTIFICATIONS_OG_IMAGE],
    creator: '@meetjovie',
    site: '@meetjovie',
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function ArtistNotificationsPage() {
  return <ArtistNotificationsLanding copy={ARTIST_NOTIFICATIONS_COPY} />;
}

import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { YOUTUBE_THUMBNAILS_COPY } from '@/data/youtubeThumbnailsCopy';
import { YoutubeThumbnailsLanding } from './YoutubeThumbnailsLanding';

export const revalidate = false;

const PAGE_URL = `${BASE_URL}${APP_ROUTES.YOUTUBE_THUMBNAILS}`;
const PAGE_TITLE = `${YOUTUBE_THUMBNAILS_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: YOUTUBE_THUMBNAILS_COPY.seo.title,
  description: YOUTUBE_THUMBNAILS_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: YOUTUBE_THUMBNAILS_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: YOUTUBE_THUMBNAILS_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

export default function YoutubeThumbnailsPage() {
  return <YoutubeThumbnailsLanding />;
}

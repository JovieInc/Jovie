import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { JOVIE_CARD_COPY } from '@/data/jovieCardCopy';
import { JovieCardLanding } from './JovieCardLanding';

export const revalidate = false;

const PAGE_URL = `${BASE_URL}${APP_ROUTES.CARD}`;
const PAGE_TITLE = `${JOVIE_CARD_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: JOVIE_CARD_COPY.seo.title,
  description: JOVIE_CARD_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: JOVIE_CARD_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: JOVIE_CARD_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

export default function JovieCardPage() {
  return <JovieCardLanding />;
}

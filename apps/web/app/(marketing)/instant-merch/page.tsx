import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { INSTANT_MERCH_COPY } from '@/data/instantMerchCopy';
import { InstantMerchLanding } from './InstantMerchLanding';

export const revalidate = false;

const INSTANT_MERCH_URL = `${BASE_URL}${APP_ROUTES.INSTANT_MERCH}`;

export const metadata: Metadata = {
  title: `${INSTANT_MERCH_COPY.seo.title} | ${APP_NAME}`,
  description: INSTANT_MERCH_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: INSTANT_MERCH_URL },
  openGraph: {
    type: 'website',
    url: INSTANT_MERCH_URL,
    title: `${INSTANT_MERCH_COPY.seo.title} | ${APP_NAME}`,
    description: INSTANT_MERCH_COPY.seo.description,
    siteName: APP_NAME,
    images: [
      {
        url: `${BASE_URL}/og/default.png`,
        width: 1200,
        height: 630,
        alt: INSTANT_MERCH_COPY.seo.title,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${INSTANT_MERCH_COPY.seo.title} | ${APP_NAME}`,
    description: INSTANT_MERCH_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

export default function InstantMerchPage() {
  return <InstantMerchLanding />;
}

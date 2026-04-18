import type { Metadata } from 'next';
import { HomepageV2Route } from '@/components/marketing/homepage-v2/HomepageV2Route';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: { absolute: HOMEPAGE_V2_COPY.seo.title },
  description: HOMEPAGE_V2_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: APP_ROUTES.LANDING_NEW,
  },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}${APP_ROUTES.LANDING_NEW}`,
    title: HOMEPAGE_V2_COPY.seo.title,
    description: HOMEPAGE_V2_COPY.seo.description,
    siteName: APP_NAME,
    images: [
      {
        url: `${BASE_URL}/og/default.png`,
        width: 1200,
        height: 630,
        alt: `${APP_NAME} landing page preview`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: HOMEPAGE_V2_COPY.seo.title,
    description: HOMEPAGE_V2_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

const WEBSITE_SCHEMA = buildWebsiteSchema({
  alternateName: ['Jovie', 'jov.ie', 'Jovie release platform'],
  description: HOMEPAGE_V2_COPY.seo.description,
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'Artist profiles, smart links, fan capture, and reactivation built as one release system for artists.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie builds artist profiles, release surfaces, smart links, and fan intelligence for independent artists.',
  sameAs: ['https://instagram.com/meetjovie'],
});

export default function NewLandingPage() {
  return (
    <>
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>
      <HomepageV2Route />
    </>
  );
}

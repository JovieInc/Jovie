import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { FinalCTASection } from '@/features/home/FinalCTASection';
import { HeroCinematic } from '@/features/home/HeroCinematic';
import { LandingCTAButton } from '@/features/landing/LandingCTAButton';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME} | Release More Music.` },
  description:
    'Release more music. Do less release work. Jovie gives independent artists smart links, artist profiles, audience intelligence, and release automation built for every drop.',
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: APP_ROUTES.LANDING_NEW,
  },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}${APP_ROUTES.LANDING_NEW}`,
    title: `${APP_NAME} | Release More Music.`,
    description:
      'Release more music. Do less release work. Jovie gives independent artists smart links, artist profiles, audience intelligence, and release automation built for every drop.',
    siteName: APP_NAME,
    images: [
      {
        url: `${BASE_URL}/og/default.png`,
        width: 1200,
        height: 630,
        alt: `${APP_NAME} homepage preview`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} | Release More Music.`,
    description:
      'Release more music. Do less release work. Jovie gives independent artists smart links, artist profiles, audience intelligence, and release automation built for every drop.',
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
  alternateName: ['Jovie', 'jov.ie', 'Jovie Link in Bio'],
  description:
    'Release more music. Do less release work. Jovie gives independent artists smart links, artist profiles, audience intelligence, and release automation built for every drop.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'Release more music with smart links, audience intelligence, paid release notifications, and AI support built for independent musicians.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is the release platform for independent musicians, combining smart links, artist profiles, audience insights, paid release notifications, and AI support.',
  sameAs: ['https://instagram.com/meetjovie'],
});

export default function NewLandingPage() {
  return (
    <div className='relative min-h-screen'>
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>

      <HeroCinematic
        primaryAction={
          <LandingCTAButton
            href={APP_ROUTES.SIGNUP}
            label='Get started'
            eventName='landing_cta_get_started'
            section='hero'
          />
        }
      />

      <FinalCTASection />
    </div>
  );
}

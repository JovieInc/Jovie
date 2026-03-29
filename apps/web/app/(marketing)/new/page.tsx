import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { LandingFinalCTA } from '@/features/landing/LandingFinalCTA';
import { LandingHero } from '@/features/landing/LandingHero';
import { LandingHowItWorks } from '@/features/landing/LandingHowItWorks';
import { LandingProfileSection } from '@/features/landing/LandingProfileSection';
import { LandingReleaseSection } from '@/features/landing/LandingReleaseSection';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME} — Your music. One link.` },
  description:
    'Set up once and every new release gets imported, linked, and sent to fans automatically.',
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: APP_ROUTES.LANDING_NEW,
  },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}${APP_ROUTES.LANDING_NEW}`,
    title: `${APP_NAME} — Your music. One link.`,
    description:
      'Set up once and every new release gets imported, linked, and sent to fans automatically.',
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
    title: `${APP_NAME} — Your music. One link.`,
    description:
      'Set up once and every new release gets imported, linked, and sent to fans automatically.',
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
  description:
    'Set up once and every new release gets imported, linked, and sent to fans automatically.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'Smart links, release automation, artist profiles, and audience proof for independent artists.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is the release platform for independent artists, combining smart links, release automation, artist profiles, and fan intelligence.',
  sameAs: ['https://instagram.com/meetjovie'],
});

export default function NewLandingPage() {
  return (
    <div className='relative min-h-screen'>
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>

      <LandingHero />

      <div aria-hidden='true' className='section-gradient-divider' />

      <LandingHowItWorks />

      <LandingReleaseSection />

      <LandingProfileSection />

      <div aria-hidden='true' className='section-gradient-divider' />

      <LandingFinalCTA />
    </div>
  );
}

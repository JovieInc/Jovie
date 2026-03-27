import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import { FeatureShowcase } from '@/features/home/FeatureShowcase';
import { FinalCTASection } from '@/features/home/FinalCTASection';
import { HeroCinematic } from '@/features/home/HeroCinematic';
import { LogoBar } from '@/features/home/LogoBar';
import { StickyPhoneTour } from '@/features/home/StickyPhoneTour';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = { absolute: `${APP_NAME} | Release More Music.` };
  const description =
    'Release more music. Do less release work. Jovie gives independent artists smart links, artist profiles, audience intelligence, and release automation built for every drop.';
  const keywords = [
    'smart link in bio',
    'link in bio for musicians',
    'linktree alternative for artists',
    'music link in bio',
    'creator profile',
    'music artist',
    'spotify link',
    'apple music link',
    'youtube music link',
    'social media links',
    'music promotion',
    'artist profile',
    'music marketing',
    'streaming links',
    'music links',
    'artist bio',
    'music discovery',
    'fan engagement',
    'email subscribers',
    'sms marketing',
    'fan conversion',
    'smart links',
    'pre-save links',
  ];

  return {
    title,
    description,
    keywords,
    authors: [
      {
        name: APP_NAME,
        url: BASE_URL,
      },
    ],
    creator: APP_NAME,
    publisher: APP_NAME,
    category: 'Music',
    classification: 'Business',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: '/',
      languages: {
        'en-US': '/',
      },
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: BASE_URL,
      title,
      description,
      siteName: APP_NAME,
      images: [
        {
          url: `${BASE_URL}/og/default.png`,
          secureUrl: `${BASE_URL}/og/default.png`,
          width: 1200,
          height: 630,
          alt: `${APP_NAME} - Release More Music.`,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [
        {
          url: `${BASE_URL}/og/default.png`,
          alt: `${APP_NAME} - Release More Music.`,
          width: 1200,
          height: 630,
        },
      ],
      creator: '@meetjovie',
      site: '@meetjovie',
    },
    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: {
        index: true,
        follow: true,
        noimageindex: false,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    verification: {
      google: publicEnv.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
    other: {
      'msvalidate.01': publicEnv.NEXT_PUBLIC_BING_SITE_VERIFICATION ?? '',
      'yandex-verification':
        publicEnv.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION ?? '',
      'p:domain_verify': publicEnv.NEXT_PUBLIC_PINTEREST_VERIFICATION ?? '',
    },
  };
}

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

const heroOnly =
  !FEATURE_FLAGS.SHOW_PHONE_TOUR &&
  !FEATURE_FLAGS.SHOW_LOGO_BAR &&
  !FEATURE_FLAGS.SHOW_FEATURE_SHOWCASE &&
  !FEATURE_FLAGS.SHOW_FINAL_CTA;

export default function HomePage() {
  return (
    <div
      className={
        heroOnly
          ? 'relative h-[calc(100dvh-var(--linear-header-height))] overflow-hidden'
          : 'relative min-h-screen'
      }
    >
      <AuthRedirectHandler />

      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>

      {heroOnly && (
        <style>
          {
            'html,body{overflow:hidden!important;height:100dvh!important}footer{display:none!important}'
          }
        </style>
      )}

      <HeroCinematic fullScreen={heroOnly} />

      {FEATURE_FLAGS.SHOW_PHONE_TOUR && <StickyPhoneTour />}

      {FEATURE_FLAGS.SHOW_LOGO_BAR && <LogoBar />}

      {FEATURE_FLAGS.SHOW_FEATURE_SHOWCASE && (
        <>
          <FeatureShowcase />
          <div aria-hidden='true' className='section-gradient-divider' />
        </>
      )}

      {FEATURE_FLAGS.SHOW_FINAL_CTA && <FinalCTASection />}
    </div>
  );
}

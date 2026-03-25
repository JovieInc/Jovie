import type { Metadata } from 'next';
import { APP_NAME, APP_URL } from '@/constants/app';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import { FeatureRow } from '@/features/home/FeatureRow';
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

// Marketing pages must remain fully static.
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
        url: APP_URL,
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
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: '/',
      languages: {
        'en-US': '/',
      },
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: APP_URL,
      title,
      description,
      siteName: APP_NAME,
      images: [
        {
          url: `${APP_URL}/og/default.png`,
          secureUrl: `${APP_URL}/og/default.png`,
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
          url: `${APP_URL}/og/default.png`,
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

// Pre-serialized JSON-LD structured data for static generation
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

export default function HomePage() {
  return (
    <div className='relative min-h-screen'>
      {/* Non-blocking: redirects signed-in users to dashboard after hydration */}
      <AuthRedirectHandler />

      {/* Structured Data */}
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>

      {/* 1. Hero — claim form left, phone right */}
      <HeroCinematic />

      {/* 2. Sticky phone product tour — scroll-driven mode transitions */}
      <StickyPhoneTour />

      {/* 3. Logo bar — z-index wipe over sticky phone */}
      <LogoBar />

      {/* 4. Releases — text left, screenshot right */}
      <FeatureRow
        heading='Release day, automated.'
        description='New music goes live with smart links, fan notifications, and pre-save pages — no setup required.'
        bullets={[
          'Smart links generated automatically for every release',
          'Fans notified via email on release day',
          'Pre-save pages that convert to day-one streams',
        ]}
        screenshotSrc='/product-screenshots/releases-dashboard-full.png'
        screenshotAlt='Jovie release dashboard showing releases table with smart link details'
        screenshotWidth={2880}
        screenshotHeight={1800}
      />

      {/* 5. Audience — text left, screenshot right */}
      <FeatureRow
        heading='Know every fan by name.'
        description="Every fan who subscribes, tips, or clicks becomes a contact you own — not a follower trapped on someone else's platform."
        bullets={[
          'Fan intelligence with source tracking',
          'See which fans came from which release or show',
          'Export contacts anytime — your audience, your data',
        ]}
        screenshotSrc='/product-screenshots/audience-crm.png'
        screenshotAlt='Jovie audience CRM showing fan contacts with source tracking'
        screenshotWidth={2880}
        screenshotHeight={1800}
      />

      {/* 6. Final CTA */}
      <FinalCTASection />
    </div>
  );
}

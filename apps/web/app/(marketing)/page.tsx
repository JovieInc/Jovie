import type { Metadata } from 'next';
import { APP_NAME, APP_URL } from '@/constants/app';
import { AudienceCRMSection } from '@/features/home/AudienceCRMSection';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import { FinalCTASection } from '@/features/home/FinalCTASection';
import { HeroScrollSection } from '@/features/home/HeroScrollSection';
import { LogoBar } from '@/features/home/LogoBar';
import { PricingSection } from '@/features/home/PricingSection';
import { ReleasesSection } from '@/features/home/ReleasesSection';
import { SeeItInAction } from '@/features/home/SeeItInAction';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';

// Marketing pages must remain fully static.
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} | Your Entire Music Career. One Intelligent Link.`;
  const description =
    'Paste your Spotify. Jovie imports your discography, creates smart links for every release, and builds a link-in-bio that notifies fans when you drop something new.';
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
          alt: `${APP_NAME} - Your Entire Music Career. One Intelligent Link.`,
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
          alt: `${APP_NAME} - Your Entire Music Career. One Intelligent Link.`,
          width: 1200,
          height: 630,
        },
      ],
      creator: '@jovieapp',
      site: '@jovieapp',
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
    'Paste your Spotify. Jovie imports your discography, creates smart links for every release, and builds a link-in-bio that notifies fans when you drop something new.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'Your entire music career in one intelligent link — smart links, link-in-bio, fan notifications, and audience growth for artists.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Paste your Spotify. Jovie imports your discography, creates smart links for every release, and builds a link-in-bio that notifies fans when you drop something new.',
  sameAs: ['https://x.com/jovieapp', 'https://instagram.com/jovieapp'],
});

export default function HomePage() {
  return (
    <div
      className='relative min-h-screen'
      style={{
        backgroundColor: 'var(--linear-bg-footer)',
        color: 'var(--linear-text-primary)',
      }}
    >
      {/* Non-blocking: redirects signed-in users to dashboard after hydration */}
      <AuthRedirectHandler />

      {/* Structured Data */}
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>

      {/* Hero with scroll-hijacking phone animation into mode carousel */}
      <HeroScrollSection />

      <LogoBar />

      <AudienceCRMSection />

      {process.env.NEXT_PUBLIC_SHOW_RELEASES_SECTION === 'true' && (
        <hr
          className='mx-auto max-w-lg border-0 h-px'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />
      )}

      {process.env.NEXT_PUBLIC_SHOW_RELEASES_SECTION === 'true' && (
        <ReleasesSection />
      )}

      {process.env.NEXT_PUBLIC_SHOW_RELEASES_SECTION === 'true' && (
        <hr
          className='mx-auto max-w-lg border-0 h-px'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />
      )}

      <PricingSection />

      {process.env.NEXT_PUBLIC_SHOW_SHOWCASE_SECTION === 'true' && (
        <hr
          className='mx-auto max-w-lg border-0 h-px'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />
      )}

      {process.env.NEXT_PUBLIC_SHOW_SHOWCASE_SECTION === 'true' && (
        <SeeItInAction />
      )}

      <FinalCTASection />
    </div>
  );
}

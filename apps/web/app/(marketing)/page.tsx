import type { Metadata } from 'next';
import { APP_NAME, APP_URL } from '@/constants/app';
import { AudienceSection } from '@/features/home/AudienceSection';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import { BottomCTA } from '@/features/home/BottomCTA';
import { HeroProductShot } from '@/features/home/HeroProductShot';
import { HomeFAQSection } from '@/features/home/HomeFAQSection';
import { HomePricingSection } from '@/features/home/HomePricingSection';
import { LogoBar } from '@/features/home/LogoBar';
import { SmartLinksSection } from '@/features/home/SmartLinksSection';
import { UnifiedProfileSection } from '@/features/home/UnifiedProfileSection';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';

/** Feature flag: show sections below the hero. Off by default until hero is polished. */
const SHOW_SECTIONS = false;

// Marketing pages must remain fully static.
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = {
    absolute: `${APP_NAME} | The Operating System for Music Releases.`,
  };
  const description =
    'The operating system for music releases. Smart links, fan notifications, playlist pitches, and release automation — so you stay in the studio and ship more often.';
  const keywords = [
    'release management',
    'music release management',
    'release automation',
    'smart links',
    'smart link in bio',
    'link in bio for musicians',
    'linktree alternative for artists',
    'music marketing',
    'music promotion',
    'release day automation',
    'pre-save links',
    'streaming links',
    'artist profile',
    'audience intelligence',
    'fan engagement',
    'fan CRM',
    'music links',
    'independent artist tools',
    'release workflow',
    'AI music marketing',
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
          alt: `${APP_NAME} — The Operating System for Music Releases.`,
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
          alt: `${APP_NAME} — The Operating System for Music Releases.`,
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
  alternateName: ['Jovie', 'jov.ie', 'Jovie Release Management'],
  description:
    'The operating system for music releases. Smart links, fan notifications, playlist pitches, and release automation — so artists stay in the studio and ship more often.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'The operating system for music releases — smart links, fan notifications, playlist pitches, and release automation so artists can ship more and find their sound faster.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is the operating system for music releases, combining smart links, fan notifications, playlist pitches, and release automation for independent artists.',
  sameAs: ['https://instagram.com/meetjovie'],
});

export default function HomePage() {
  return (
    <div className='relative min-h-screen'>
      {/* Non-blocking: redirects signed-in users to dashboard after hydration */}
      <AuthRedirectHandler />

      {/* Structured Data */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: WEBSITE_SCHEMA }}
      />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: SOFTWARE_SCHEMA }}
      />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: ORGANIZATION_SCHEMA }}
      />

      {/* 1. Hero — product shot with Get Started CTA */}
      <HeroProductShot />

      {/* 2. Logo bar — social proof */}
      <LogoBar />

      {SHOW_SECTIONS && (
        <>
          {/* 3. Smart links — automatic release links */}
          <SmartLinksSection />

          {/* 4. Artist profile — profiles that convert */}
          <UnifiedProfileSection />

          {/* 5. Audience — know every fan by name */}
          <AudienceSection />

          {/* 6. Pricing */}
          <HomePricingSection />

          {/* 7. FAQ */}
          <HomeFAQSection />

          {/* 8. Divider before CTA */}
          <div aria-hidden='true' className='section-gradient-divider' />

          {/* 9. Bottom CTA */}
          <BottomCTA />
        </>
      )}
    </div>
  );
}

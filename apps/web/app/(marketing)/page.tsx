import type { Metadata } from 'next';
import { Container } from '@/components/site/Container';
import { APP_NAME, APP_URL } from '@/constants/app';
import { AiDemo } from '@/features/home/AiDemo';
import { AudienceCRMSection } from '@/features/home/AudienceCRMSection';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import { FinalCTASection } from '@/features/home/FinalCTASection';
import { HeroScrollSection } from '@/features/home/HeroScrollSection';
import { LogoBar } from '@/features/home/LogoBar';
import { PhoneProfileDemo } from '@/features/home/PhoneProfileDemo';
import { PricingSection } from '@/features/home/PricingSection';
import { ReleasesSection } from '@/features/home/ReleasesSection';
import { ValuePropsSection } from '@/features/home/ValuePropsSection';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';

// Marketing pages must remain fully static.
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} | Release More Music.`;
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
    'Release more music. Do less release work. Jovie gives independent artists smart links, artist profiles, audience intelligence, and release automation built for every drop.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'Release more music with smart links, audience intelligence, paid release notifications, and AI support built for independent musicians.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is the release platform for independent musicians, combining smart links, artist profiles, audience insights, paid release notifications, and AI support.',
  sameAs: ['https://x.com/jovieapp', 'https://instagram.com/jovieapp'],
});

function AiSupportSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          <div className='grid section-gap-linear lg:grid-cols-[0.9fr_1.1fr] lg:items-center'>
            <div className='reveal-on-scroll'>
              <span className='inline-flex items-center gap-1.5 rounded-full border border-subtle px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-tertiary-token'>
                AI assistant
              </span>
              <h2 className='mt-5 max-w-[10ch] marketing-h2-linear text-primary-token'>
                AI that knows your work.
              </h2>
              <p className='mt-4 max-w-xl marketing-lead-linear text-secondary-token'>
                No gimmicks. Just an assistant grounded in your catalog, ready
                to help with the business side of music when it is time to
                write, plan, or launch.
              </p>
            </div>

            <div className='reveal-on-scroll' data-delay='80'>
              <div className='overflow-hidden rounded-[0.95rem] border border-subtle bg-surface-0 shadow-card'>
                <AiDemo />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default function HomePage() {
  return (
    <div
      className='jovie-homepage-marketing relative min-h-screen'
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

      <ReleasesSection />

      <ValuePropsSection />

      <PhoneProfileDemo />

      <AiSupportSection />

      <AudienceCRMSection />

      <PricingSection />

      <FinalCTASection />
    </div>
  );
}

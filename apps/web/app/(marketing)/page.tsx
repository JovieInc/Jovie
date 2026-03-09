import type { Metadata } from 'next';
import { AudienceCRMSection } from '@/components/home/AudienceCRMSection';
import { AuthRedirectHandler } from '@/components/home/AuthRedirectHandler';
import { AutomaticReleaseSmartlinksSection } from '@/components/home/AutomaticReleaseSmartlinksSection';
import { DeeplinksGrid } from '@/components/home/DeeplinksGrid';
import { FinalCTASection } from '@/components/home/FinalCTASection';
import { FloatingClaimBar } from '@/components/home/FloatingClaimBar';
import { LogoBar } from '@/components/home/LogoBar';
import { PricingSection } from '@/components/home/PricingSection';
import { RedesignedHero } from '@/components/home/RedesignedHero';
import { ReleaseNotificationsSection } from '@/components/home/ReleaseNotificationsSection';
import { SeeItInAction } from '@/components/home/SeeItInAction';
import { SocialProofSection } from '@/components/home/SocialProofSection';
import { APP_NAME, APP_URL } from '@/constants/app';
import { publicEnv } from '@/lib/env-public';

// Marketing pages must remain fully static.
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} | Turn profile visits into fans you can reach`;
  const description =
    'Jovie gives artists one smart profile that captures fan emails, routes each visitor to the right next step, and turns releases, shows, and tips into measurable growth.';
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
          alt: `${APP_NAME} - The link in bio that converts`,
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
          alt: `${APP_NAME} - The link in bio that converts`,
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

// Helper to safely serialize JSON-LD with XSS protection
const jsonLd = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', String.raw`\u003c`);

// Pre-serialized JSON-LD structured data for static generation
const WEBSITE_SCHEMA = jsonLd({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: APP_NAME,
  alternateName: ['Jovie', 'jov.ie', 'Jovie Link in Bio'],
  description:
    'Jovie gives artists one smart profile that captures fan emails, routes each visitor to the right next step, and turns releases, shows, and tips into measurable growth.',
  url: APP_URL,
  inLanguage: 'en-US',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${APP_URL}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
  publisher: {
    '@type': 'Organization',
    name: APP_NAME,
    url: APP_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
      width: 512,
      height: 512,
    },
  },
});

const SOFTWARE_SCHEMA = jsonLd({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: APP_NAME,
  description:
    'A conversion-first profile platform for artists to capture fan contacts and drive clear next actions.',
  url: APP_URL,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free to start',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '5',
    ratingCount: '1',
    bestRating: '5',
    worstRating: '1',
  },
  author: {
    '@type': 'Organization',
    name: APP_NAME,
    url: APP_URL,
  },
});

const ORGANIZATION_SCHEMA = jsonLd({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: APP_NAME,
  legalName: 'Jovie Technology Inc.',
  url: APP_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
    width: 512,
    height: 512,
  },
  image: `${APP_URL}/og/default.png`,
  description:
    'Jovie gives artists one smart profile that captures fan emails, routes each visitor to the right next step, and turns releases, shows, and tips into measurable growth.',
  sameAs: ['https://x.com/jovieapp', 'https://instagram.com/jovieapp'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: `${APP_URL}/support`,
  },
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

      {/* Hero + logo bar fill the viewport together (minus fixed header) */}
      <div className='flex flex-col'>
        <RedesignedHero />
        <LogoBar />
      </div>

      <SocialProofSection />

      <hr
        className='mx-auto max-w-lg border-0 h-px'
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
        }}
      />

      <AudienceCRMSection />

      <hr
        className='mx-auto max-w-lg border-0 h-px'
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
        }}
      />

      <DeeplinksGrid />

      <hr
        className='mx-auto max-w-lg border-0 h-px'
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
        }}
      />

      <ReleaseNotificationsSection />

      <hr
        className='mx-auto max-w-lg border-0 h-px'
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
        }}
      />

      <AutomaticReleaseSmartlinksSection />

      <hr
        className='mx-auto max-w-lg border-0 h-px'
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
        }}
      />

      <PricingSection />

      <hr
        className='mx-auto max-w-lg border-0 h-px'
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
        }}
      />

      <SeeItInAction />

      <hr
        className='mx-auto max-w-lg border-0 h-px'
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
        }}
      />

      <FinalCTASection />

      <FloatingClaimBar />
    </div>
  );
}

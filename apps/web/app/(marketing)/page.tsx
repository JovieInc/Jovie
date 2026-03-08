import type { Metadata } from 'next';
import { AudienceCRMSection } from '@/components/home/AudienceCRMSection';
import { AuthRedirectHandler } from '@/components/home/AuthRedirectHandler';
import { AutomaticReleaseSmartlinksSection } from '@/components/home/AutomaticReleaseSmartlinksSection';
import { DeeplinksGrid } from '@/components/home/DeeplinksGrid';
import { FinalCTASection } from '@/components/home/FinalCTASection';
import { FloatingClaimBar } from '@/components/home/FloatingClaimBar';
import { FALLBACK_AVATARS } from '@/components/home/featured-creators-fallback';
import { LogoBar } from '@/components/home/LogoBar';
import { RedesignedHero } from '@/components/home/RedesignedHero';
import { SeeItInActionCarousel } from '@/components/home/SeeItInActionCarousel';
import { APP_NAME, APP_URL } from '@/constants/app';
import { publicEnv } from '@/lib/env-public';

// Static rendering: use hardcoded flag defaults instead of evaluating flag()
// functions which call cookies()/headers() and force dynamic rendering.
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} — The link in bio that actually converts.`;
  const description =
    'The link in bio built for musicians. Capture emails, direct streams, earn tips — all on autopilot. Free forever.';
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
          alt: `${APP_NAME} - The link in bio that actually converts`,
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
          alt: `${APP_NAME} - The link in bio that actually converts`,
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
    'The link in bio built for musicians. Capture emails, direct streams, earn tips — all on autopilot. Free forever.',
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
    'A conversion-first link-in-bio platform for artists to capture fan contacts and drive clear next actions.',
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
    'The link in bio built for musicians. Capture emails, direct streams, earn tips — all on autopilot. Free forever.',
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
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: WEBSITE_SCHEMA }}
      />
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: SOFTWARE_SCHEMA }}
      />
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: ORGANIZATION_SCHEMA }}
      />

      {/* Hero + logo bar fill the viewport together (minus fixed header) */}
      <div className='flex flex-col'>
        <RedesignedHero />
        <LogoBar />
      </div>

      <AutomaticReleaseSmartlinksSection />

      <AudienceCRMSection />

      <DeeplinksGrid />

      {publicEnv.NEXT_PUBLIC_FEATURE_SEE_IT_IN_ACTION === 'true' && (
        <SeeItInActionCarousel creators={FALLBACK_AVATARS} />
      )}

      {/* Gradient separator before final CTA */}
      <div
        aria-hidden='true'
        className='h-px max-w-lg mx-auto'
        style={{
          background:
            'linear-gradient(to right, transparent, var(--linear-border-subtle), transparent)',
        }}
      />

      <FinalCTASection />

      <FloatingClaimBar />
    </div>
  );
}

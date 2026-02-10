import type { Metadata } from 'next';
import { AuthRedirectHandler } from '@/components/home/AuthRedirectHandler';
import { ComparisonSection } from '@/components/home/comparison-visual';
import { FinalCTASection } from '@/components/home/FinalCTASection';
import { FALLBACK_AVATARS } from '@/components/home/featured-creators-fallback';
import { HowItWorksSection } from '@/components/home/HowItWorksSection';
import { ProblemSection } from '@/components/home/ProblemSection';
import { RedesignedHero } from '@/components/home/RedesignedHero';
import { SeeItInActionCarousel } from '@/components/home/SeeItInActionCarousel';
import { WhatYouGetSection } from '@/components/home/WhatYouGetSection';
import { DeferredSection } from '@/components/organisms/DeferredSection';
import { APP_NAME, APP_URL } from '@/constants/app';

// Fully static - no database dependency, instant cold starts
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} — The AI Growth Engine for Independent Artists`;
  const description =
    'Your music finally has a marketing team. Jovie replaces your link in bio with an AI engine that captures every fan, adapts to every visitor, and re-engages automatically. Free to start.';
  const keywords = [
    'link in bio',
    'linktree alternative',
    'artist link in bio',
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
          alt: `${APP_NAME} - The AI Growth Engine for Independent Artists`,
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
          alt: `${APP_NAME} - The AI Growth Engine for Independent Artists`,
          width: 1200,
          height: 630,
        },
      ],
      creator: '@jovie',
      site: '@jovie',
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
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
    other: {
      'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || '',
      'yandex-verification':
        process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION || '',
      'p:domain_verify': process.env.NEXT_PUBLIC_PINTEREST_VERIFICATION || '',
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
  alternateName: 'Jovie Link in Bio',
  description:
    'Your music finally has a marketing team. Jovie replaces your link in bio with an AI engine that captures every fan, adapts to every visitor, and re-engages automatically.',
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
    'The AI growth engine for independent artists. Capture every fan, personalize every visit, follow up automatically.',
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
  legalName: 'Jovie Inc',
  url: APP_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
    width: 512,
    height: 512,
  },
  image: `${APP_URL}/og/default.png`,
  description:
    'The AI growth engine for independent artists. Capture every fan, personalize every visit, follow up automatically.',
  sameAs: ['https://twitter.com/jovie', 'https://instagram.com/jovie'],
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

      {/* 1. Hero Section */}
      <RedesignedHero />

      {/* 2. Problem Section */}
      <ProblemSection />

      {/* 3. Comparison Section */}
      <ComparisonSection />

      <DeferredSection placeholderHeight={560}>
        {/* 4. What You Get Section */}
        <WhatYouGetSection />
      </DeferredSection>

      <DeferredSection placeholderHeight={640}>
        {/* 5. How It Works Section */}
        <HowItWorksSection />
      </DeferredSection>

      <DeferredSection placeholderHeight={520}>
        {/* 6. See It In Action Section */}
        <SeeItInActionCarousel creators={FALLBACK_AVATARS} />
      </DeferredSection>

      <DeferredSection placeholderHeight={480}>
        {/* 7. Final CTA Section */}
        <FinalCTASection />
      </DeferredSection>
    </div>
  );
}

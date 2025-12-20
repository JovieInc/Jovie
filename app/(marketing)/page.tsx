import type { Metadata } from 'next';
import { RedesignedHero } from '@/components/home/RedesignedHero';
import { ProblemSection } from '@/components/home/ProblemSection';
import { InsightSection } from '@/components/home/InsightSection';
import { WhatYouGetSection } from '@/components/home/WhatYouGetSection';
import { DifferentiationSection } from '@/components/home/DifferentiationSection';
import { TrustSection } from '@/components/home/TrustSection';
import { FinalCTASection } from '@/components/home/FinalCTASection';
import { HomepageFooter } from '@/components/home/HomepageFooter';
import { APP_NAME, APP_URL } from '@/constants/app';

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} - AI-Powered Link-in-Bio for Artists`;
  const description =
    'An AI-powered link-in-bio that guides every fan to the action they're most likely to take — and gets better automatically.';
  const keywords = [
    'creator profile',
    'music artist',
    'spotify',
    'social media',
    'music promotion',
    'artist profile',
    'music marketing',
    'streaming',
    'music links',
    'artist bio',
    'music discovery',
    'fan engagement',
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
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: APP_URL,
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
          url: '/og/default.png',
          width: 1200,
          height: 630,
          alt: `${APP_NAME} - Claim your @handle`,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og/default.png'],
      creator: '@jovie',
      site: '@jovie',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
    other: {
      'music:musician': APP_URL,
      'music:album': APP_URL,
    },
  };
}

export default function HomePage() {
  return (
    <>
      {/* Structured Data */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: APP_NAME,
            description:
              'An AI-powered link-in-bio that guides every fan to the action they're most likely to take.',
            url: APP_URL,
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${APP_URL}/?q={search_term_string}`,
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
              },
            },
            sameAs: [
              'https://twitter.com/jovie',
              'https://instagram.com/jovie',
            ],
          }),
        }}
      />

      {/* Main content */}
      <div className='relative min-h-screen bg-base text-primary-token'>
        {/* 1. Hero Section */}
        <RedesignedHero />

        {/* 2. Problem Section */}
        <ProblemSection />

        {/* 3. Insight Section */}
        <InsightSection />

        {/* 4. What You Get Section */}
        <WhatYouGetSection />

        {/* 5. Differentiation Section */}
        <DifferentiationSection />

        {/* 6. Trust/Signaling Section */}
        <TrustSection />

        {/* 7. Final CTA Section */}
        <FinalCTASection />

        {/* 8. Footer */}
        <HomepageFooter />
      </div>
    </>
  );
}

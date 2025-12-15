import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { FeaturedArtistsClient } from '@/components/home/FeaturedArtistsClient';
import { NewHomeHero } from '@/components/home/NewHomeHero';
import { NewSocialProofSection } from '@/components/home/NewSocialProofSection';
import { Container } from '@/components/site/Container';
import { APP_NAME, APP_URL } from '@/constants/app';

// Use a client wrapper for the Featured Artists carousel to avoid ssr:false in a Server Component
const NewFeaturesSection = dynamic(() =>
  import('@/components/home/NewFeaturesSection').then(m => m.NewFeaturesSection)
);
const NewHowItWorks = dynamic(() =>
  import('@/components/home/NewHowItWorks').then(m => m.NewHowItWorks)
);
const PricingPreview = dynamic(() =>
  import('@/components/home/PricingPreview').then(m => m.PricingPreview)
);
const NewPreFooterCTA = dynamic(() =>
  import('@/components/home/NewPreFooterCTA').then(m => m.NewPreFooterCTA)
);

// Root layout handles dynamic rendering
export const revalidate = 3600; // Revalidate every hour

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} - Claim your @handle`;
  const description =
    "Secure your name. Share a profile that's fast, beautiful, and optimized to convert.";
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
            description: 'Claim your @handle',
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
                url: `${APP_URL}/brand/jovie-logo.svg`,
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
        {/* 1. Hero Section (above the fold) */}
        <NewHomeHero />

        {/* 2. Social proof (team credibility) */}
        <NewSocialProofSection />

        {/* 3. Artist carousel (visual proof, not endorsement) */}
        <Suspense
          fallback={
            <section className='py-10 bg-base'>
              <Container>
                <div className='text-center py-8'>
                  <p className='text-sm font-medium text-secondary-token'>
                    Explore example Jovie profiles
                  </p>
                </div>
              </Container>
            </section>
          }
        >
          <FeaturedArtistsClient />
        </Suspense>

        {/* 4. How it works (3 steps) */}
        <NewHowItWorks />

        {/* 5. Features (what Free includes, forever) */}
        <NewFeaturesSection />
      </div>

      {/* 6. Pricing preview (3 tiers) */}
      <PricingPreview />

      {/* Pre-footer CTA */}
      <NewPreFooterCTA />
    </>
  );
}

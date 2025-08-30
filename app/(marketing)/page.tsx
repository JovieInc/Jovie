import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { BenefitsSection } from '@/components/home/BenefitsSection';
import { SocialProofSection } from '@/components/home/ComparisonSection';
import { FeaturedArtists } from '@/components/home/FeaturedArtists';
import { HomeHero } from '@/components/home/HomeHero';
import { HowItWorks } from '@/components/home/HowItWorks';
import { ProblemSolutionSection } from '@/components/home/ProblemSolutionSection';
import { CTASection } from '@/components/organisms/CTASection';

const TipPromo = dynamic(() => import('@/components/TipPromo'));

import { APP_NAME, APP_URL } from '@/constants/app';

// Root layout handles dynamic rendering
export const revalidate = 3600; // Revalidate every hour

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} - Link in bio for music artists`;
  const description =
    'Connect your music, social media, and merch in one link. No design needed. Live in under 90 seconds.';
  const keywords = [
    'link in bio',
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
          alt: `${APP_NAME} - Link in bio for music artists`,
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
            description: 'Link in bio for music artists',
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

      {/* Linear-inspired design with theme support */}
      <div className='relative min-h-screen bg-white text-gray-900 dark:bg-[#0D0E12] dark:text-white'>
        {/* Subtle grid background pattern */}
        <div className='absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]' />

        {/* Gradient orbs - more subtle like Linear */}
        <div className='absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-full blur-3xl' />
        <div className='absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl' />

        {/* Hero Section */}
        <HomeHero />

        {/* Content sections with optimized spacing */}
        <div className='relative z-10'>
          {/* Featured Artists with glass morphism */}
          <section className='py-10 md:py-14'>
            <Suspense
              fallback={
                <div className='flex items-center justify-center py-6'>
                  <div className='animate-pulse text-gray-600 dark:text-white/60'>
                    Loading featured artists...
                  </div>
                </div>
              }
            >
              <FeaturedArtists />
            </Suspense>
          </section>

          {/* Problem & Solution section */}
          <ProblemSolutionSection />

          {/* How It Works with step indicators */}
          <section className='py-14 md:py-18 border-t border-gray-200 dark:border-white/5'>
            <HowItWorks />
          </section>

          {/* Benefits with grid layout */}
          <section className='py-14 md:py-18 border-t border-gray-200 dark:border-white/5'>
            <BenefitsSection />
          </section>

          {/* Comparison with modern table design */}
          <section className='py-14 md:py-18 border-t border-gray-200 dark:border-white/5'>
            <SocialProofSection />
          </section>

          {/* Tip Promo - feature flagged */}
          <TipPromo />
        </div>
      </div>

      {/* CTA section with glass morphism */}
      <CTASection
        title='Ready to showcase your music?'
        buttonText='Get Started Free'
        buttonHref='/onboarding'
        description='Join thousands of artists already using Jovie to connect with their fans.'
        variant='primary'
      />
    </>
  );
}

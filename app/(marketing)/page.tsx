import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Suspense } from 'react';
import { ActionDrivenProfileSection } from '@/components/home/ActionDrivenProfileSection';
import { FeaturedArtistsClient } from '@/components/home/FeaturedArtistsClient';
import { NewHomeHero } from '@/components/home/NewHomeHero';
import { NewSocialProofSection } from '@/components/home/NewSocialProofSection';
import { Container } from '@/components/site/Container';
import { APP_NAME, APP_URL } from '@/constants/app';

// Use a client wrapper for the Featured Artists carousel to avoid ssr:false in a Server Component
const NewHowItWorks = dynamic(() =>
  import('@/components/home/NewHowItWorks').then(m => m.NewHowItWorks)
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
        {/* 1. Hero Section (above the fold) */}
        <NewHomeHero />

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
          <FeaturedArtistsClient showFades={false} />
        </Suspense>

        <section className='relative py-14 sm:py-16 bg-base overflow-hidden'>
          <div className='absolute inset-0 -z-10'>
            <div className='absolute inset-0 grid-bg opacity-60' />
            <div className='absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.10),transparent)] dark:bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.20),transparent)]' />
            <div className='pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-base to-transparent dark:from-base' />
            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-base to-transparent dark:from-base' />
          </div>

          <Container>
            <div className='mx-auto max-w-5xl'>
              <div className='flex flex-col gap-6 md:flex-row md:items-start md:justify-between'>
                <div className='md:max-w-xl'>
                  <h2 className='text-3xl sm:text-4xl font-semibold tracking-tight text-primary-token'>
                    <span className='block'>Purpose-built for</span>
                    <span className='block'>music creators</span>
                  </h2>
                </div>
                <div className='md:text-right'>
                  <div className='flex items-baseline gap-2 md:justify-end'>
                    <div className='text-4xl sm:text-5xl font-semibold tracking-tight text-primary-token'>
                      90M+
                    </div>
                    <div className='text-sm sm:text-base font-medium text-secondary-token'>
                      streams
                    </div>
                  </div>
                  <p className='mt-2 text-xs sm:text-sm text-secondary-token leading-relaxed'>
                    Driven to emerging acts by the team behind Jovie.
                  </p>
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section className='relative pb-14 sm:pb-16 bg-base overflow-hidden'>
          <div className='absolute inset-0 -z-10'>
            <div className='absolute inset-0 grid-bg opacity-60' />
            <div className='absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.08),transparent)] dark:bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.18),transparent)]' />
            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-base to-transparent dark:from-base' />
          </div>

          <Container>
            <div className='mx-auto max-w-5xl'>
              <div className='grid gap-4 sm:gap-6 md:grid-cols-3'>
                <details className='group rounded-3xl border border-subtle bg-surface-1 overflow-hidden'>
                  <summary className='list-none [&::-webkit-details-marker]:hidden'>
                    <div className='relative flex min-h-[240px] flex-col justify-end gap-4 p-6 sm:p-7 cursor-pointer select-none'>
                      <div className='absolute inset-0 opacity-70'>
                        <div className='absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.18),transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.22),transparent_55%)]' />
                        <div className='absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.06),transparent_40%)] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_40%)]' />
                      </div>

                      <div className='relative flex items-end justify-between gap-6'>
                        <h3 className='text-lg font-semibold leading-tight text-primary-token'>
                          Purpose-built for conversion routing
                        </h3>
                        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-transform group-[open]:rotate-45'>
                          +
                        </span>
                      </div>
                    </div>
                  </summary>
                  <div className='px-6 pb-6 sm:px-7 sm:pb-7'>
                    <p className='text-sm leading-relaxed text-secondary-token'>
                      Smart routing and app deep links reduce friction so fans
                      get to the right destination—fast.
                    </p>
                  </div>
                </details>

                <details className='group rounded-3xl border border-subtle bg-surface-1 overflow-hidden'>
                  <summary className='list-none [&::-webkit-details-marker]:hidden'>
                    <div className='relative flex min-h-[240px] flex-col justify-end gap-4 p-6 sm:p-7 cursor-pointer select-none'>
                      <div className='absolute inset-0 opacity-70'>
                        <div className='absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(120,119,198,0.16),transparent_60%)] dark:bg-[radial-gradient(circle_at_70%_25%,rgba(120,119,198,0.22),transparent_60%)]' />
                        <div className='absolute inset-0 bg-[linear-gradient(135deg,transparent_10%,rgba(0,0,0,0.06))] dark:bg-[linear-gradient(135deg,transparent_10%,rgba(255,255,255,0.06))]' />
                      </div>

                      <div className='relative flex items-end justify-between gap-6'>
                        <h3 className='text-lg font-semibold leading-tight text-primary-token'>
                          Capture fan identity
                        </h3>
                        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-transform group-[open]:rotate-45'>
                          +
                        </span>
                      </div>
                    </div>
                  </summary>
                  <div className='px-6 pb-6 sm:px-7 sm:pb-7'>
                    <p className='text-sm leading-relaxed text-secondary-token'>
                      Collect contact details and build an owned audience you
                      can reach beyond the algorithm.
                    </p>
                  </div>
                </details>

                <details className='group rounded-3xl border border-subtle bg-surface-1 overflow-hidden'>
                  <summary className='list-none [&::-webkit-details-marker]:hidden'>
                    <div className='relative flex min-h-[240px] flex-col justify-end gap-4 p-6 sm:p-7 cursor-pointer select-none'>
                      <div className='absolute inset-0 opacity-70'>
                        <div className='absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(120,119,198,0.14),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_20%,rgba(120,119,198,0.20),transparent_60%)]' />
                        <div className='absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.06),transparent_45%)] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_45%)]' />
                      </div>

                      <div className='relative flex items-end justify-between gap-6'>
                        <h3 className='text-lg font-semibold leading-tight text-primary-token'>
                          Crafted to optimize over time
                        </h3>
                        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-transform group-[open]:rotate-45'>
                          +
                        </span>
                      </div>
                    </div>
                  </summary>
                  <div className='px-6 pb-6 sm:px-7 sm:pb-7'>
                    <p className='text-sm leading-relaxed text-secondary-token'>
                      Automatic A/B testing by persona helps your profile keep
                      getting better without constant tweaks.
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </Container>
        </section>

        <ActionDrivenProfileSection />

        {/* 2. Social proof (team credibility) */}
        <NewSocialProofSection />

        {/* 4. How it works (3 steps) */}
        <NewHowItWorks />

        {/* 6. Conversion CTA */}
        <section className='relative py-14 sm:py-16 bg-base overflow-hidden border-t border-subtle'>
          <div className='absolute inset-0 -z-10'>
            <div className='absolute inset-0 grid-bg opacity-60' />
            <div className='absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.12),transparent)] dark:bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.22),transparent)]' />
          </div>
          <Container>
            <div className='mx-auto max-w-5xl'>
              <div className='flex flex-col gap-6 md:flex-row md:items-center md:justify-between'>
                <div className='min-w-0'>
                  <h2 className='text-2xl sm:text-3xl font-semibold tracking-tight text-primary-token'>
                    Claim your @handle. Build your audience.
                  </h2>
                </div>

                <div className='flex flex-wrap items-center gap-2 md:justify-end'>
                  <Link
                    href='/waitlist'
                    className='inline-flex h-11 items-center justify-center rounded-md bg-btn-primary px-5 text-sm font-medium text-btn-primary-foreground hover:bg-btn-primary/90 focus-ring-themed'
                  >
                    Request early access
                  </Link>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </div>
    </>
  );
}

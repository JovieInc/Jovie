import { BadgeCheck, LayoutGrid, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Image from 'next/image';
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
                  <p className='mt-2 ml-auto max-w-[26ch] text-xs sm:text-sm text-secondary-token leading-snug'>
                    Driven to emerging acts by the team behind Jovie.
                  </p>
                </div>
              </div>
            </div>
          </Container>
        </section>
        <ActionDrivenProfileSection />

        {/* 2. Social proof (team credibility) */}
        <NewSocialProofSection />

        <section className='relative pb-14 sm:pb-16 bg-base overflow-hidden'>
          <div className='absolute inset-0 -z-10'>
            <div className='absolute inset-0 grid-bg opacity-60' />
            <div className='absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.08),transparent)] dark:bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.18),transparent)]' />
            <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-base to-transparent dark:from-base' />
          </div>

          <Container>
            <div className='mx-auto max-w-5xl'>
              <div className='grid gap-4 sm:gap-6 md:grid-cols-3'>
                <details className='group rounded-3xl overflow-hidden border border-white/10 bg-neutral-950/90 shadow-[0_16px_48px_rgba(0,0,0,0.55)]'>
                  <summary className='list-none [&::-webkit-details-marker]:hidden'>
                    <div className='relative min-h-[240px] p-6 sm:p-7 cursor-pointer select-none'>
                      <div className='pointer-events-none absolute inset-0'>
                        <div className='absolute inset-0'>
                          <div className='absolute -right-10 -bottom-10 h-[280px] w-[280px] opacity-35 mix-blend-screen sm:-right-12 sm:-bottom-12 sm:h-[320px] sm:w-[320px]'>
                            <Image
                              src='/images/feature_speed_minimal_arc_1344x1280.png'
                              alt=''
                              fill
                              className='object-contain grayscale'
                              sizes='(min-width: 640px) 320px, 280px'
                              priority={false}
                            />
                          </div>
                        </div>
                        <div className='absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.12),transparent_60%)]' />
                        <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35),rgba(0,0,0,0.88))]' />
                      </div>

                      <div className='absolute left-6 top-6 sm:left-7 sm:top-7 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80'>
                        <Zap className='h-4 w-4' aria-hidden='true' />
                      </div>

                      <h3 className='absolute left-6 bottom-6 sm:left-7 sm:bottom-7 pr-14 text-lg font-semibold leading-tight text-white'>
                        Blazing fast profiles
                      </h3>

                      <span className='absolute bottom-6 right-6 sm:bottom-7 sm:right-7 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition-transform group-[open]:rotate-45'>
                        +
                      </span>
                    </div>
                  </summary>
                  <div className='px-6 pb-6 sm:px-7 sm:pb-7'>
                    <p className='text-sm leading-relaxed text-white/70'>
                      Pages load instantly so fans tap, buy, and subscribe
                      without friction.
                    </p>
                  </div>
                </details>

                <details className='group rounded-3xl overflow-hidden border border-white/10 bg-neutral-950/90 shadow-[0_16px_48px_rgba(0,0,0,0.55)]'>
                  <summary className='list-none [&::-webkit-details-marker]:hidden'>
                    <div className='relative min-h-[240px] p-6 sm:p-7 cursor-pointer select-none'>
                      <div className='pointer-events-none absolute inset-0'>
                        <div className='absolute inset-0'>
                          <div className='absolute -right-10 -bottom-10 h-[280px] w-[280px] opacity-35 mix-blend-screen sm:-right-12 sm:-bottom-12 sm:h-[320px] sm:w-[320px]'>
                            <Image
                              src='/images/feature_opinionated_design_1344x1280.png'
                              alt=''
                              fill
                              className='object-contain grayscale'
                              sizes='(min-width: 640px) 320px, 280px'
                              priority={false}
                            />
                          </div>
                        </div>
                        <div className='absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.12),transparent_60%)]' />
                        <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35),rgba(0,0,0,0.88))]' />
                      </div>

                      <div className='absolute left-6 top-6 sm:left-7 sm:top-7 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80'>
                        <LayoutGrid className='h-4 w-4' aria-hidden='true' />
                      </div>

                      <h3 className='absolute left-6 bottom-6 sm:left-7 sm:bottom-7 pr-14 text-lg font-semibold leading-tight text-white'>
                        Opinionated design
                      </h3>

                      <span className='absolute bottom-6 right-6 sm:bottom-7 sm:right-7 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition-transform group-[open]:rotate-45'>
                        +
                      </span>
                    </div>
                  </summary>
                  <div className='px-6 pb-6 sm:px-7 sm:pb-7'>
                    <p className='text-sm leading-relaxed text-white/70'>
                      A clean, high-converting layout that looks premium out of
                      the box.
                    </p>
                  </div>
                </details>

                <details className='group rounded-3xl overflow-hidden border border-white/10 bg-neutral-950/90 shadow-[0_16px_48px_rgba(0,0,0,0.55)]'>
                  <summary className='list-none [&::-webkit-details-marker]:hidden'>
                    <div className='relative min-h-[240px] p-6 sm:p-7 cursor-pointer select-none'>
                      <div className='pointer-events-none absolute inset-0'>
                        <div className='absolute inset-0'>
                          <div className='absolute -right-10 -bottom-10 h-[280px] w-[280px] opacity-35 mix-blend-screen sm:-right-12 sm:-bottom-12 sm:h-[320px] sm:w-[320px]'>
                            <Image
                              src='/images/feature_zero_setup_plug_1344x1280.png'
                              alt=''
                              fill
                              className='object-contain grayscale'
                              sizes='(min-width: 640px) 320px, 280px'
                              priority={false}
                            />
                          </div>
                        </div>
                        <div className='absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.12),transparent_60%)]' />
                        <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35),rgba(0,0,0,0.88))]' />
                      </div>

                      <div className='absolute left-6 top-6 sm:left-7 sm:top-7 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80'>
                        <BadgeCheck className='h-4 w-4' aria-hidden='true' />
                      </div>

                      <h3 className='absolute left-6 bottom-6 sm:left-7 sm:bottom-7 pr-14 text-lg font-semibold leading-tight text-white'>
                        Zero setup
                      </h3>

                      <span className='absolute bottom-6 right-6 sm:bottom-7 sm:right-7 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition-transform group-[open]:rotate-45'>
                        +
                      </span>
                    </div>
                  </summary>
                  <div className='px-6 pb-6 sm:px-7 sm:pb-7'>
                    <p className='text-sm leading-relaxed text-white/70'>
                      Claim your Jovie profile and start selling in minutes—no
                      code, no templates.
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </Container>
        </section>

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

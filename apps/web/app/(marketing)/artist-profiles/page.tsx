import { BarChart3, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { FinalCTASection } from '@/features/home/FinalCTASection';
import { PhoneFrame } from '@/features/home/PhoneFrame';
import { ProductScreenshot } from '@/features/home/ProductScreenshot';
import { SharedMarketingHero } from '@/features/landing/SharedMarketingHero';

export const revalidate = false;

const ARTIST_PROFILES_TITLE = 'Artist Profiles';
const ARTIST_PROFILES_OG_TITLE = `Artist Profiles | ${APP_NAME}`;
const ARTIST_PROFILES_DESCRIPTION =
  'Claim your free artist profile on Jovie. Smart links, fan engagement, and release automation — all in one link-in-bio built for musicians.';
const ARTIST_PROFILES_URL = `${BASE_URL}${APP_ROUTES.ARTIST_PROFILES}`;
const ARTIST_PROFILES_OG_IMAGE = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title: ARTIST_PROFILES_TITLE,
  description: ARTIST_PROFILES_DESCRIPTION,
  keywords: [
    'artist profile',
    'link in bio for musicians',
    'smart links',
    'music artist page',
    'linktree alternative for artists',
    'music link in bio',
    'creator profile',
    'artist bio',
  ],
  alternates: {
    canonical: ARTIST_PROFILES_URL,
  },
  openGraph: {
    title: ARTIST_PROFILES_OG_TITLE,
    description: ARTIST_PROFILES_DESCRIPTION,
    url: ARTIST_PROFILES_URL,
    siteName: APP_NAME,
    type: 'website',
    images: [
      {
        url: ARTIST_PROFILES_OG_IMAGE,
        secureUrl: ARTIST_PROFILES_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: ARTIST_PROFILES_TITLE,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: ARTIST_PROFILES_OG_TITLE,
    description: ARTIST_PROFILES_DESCRIPTION,
    images: [ARTIST_PROFILES_OG_IMAGE],
    creator: '@meetjovie',
    site: '@meetjovie',
  },
};

export default function ArtistProfilesPage() {
  return (
    <div className='relative min-h-screen'>
      <SharedMarketingHero
        eyebrow='Artist Profiles'
        headingId='artist-profiles-hero-heading'
        primaryCtaLabel='Claim Your Free Profile'
        primaryCtaTestId='artist-profiles-hero-cta'
        subcopy='One clean artist page. No credit card required.'
        proofPoints={['Own Your Audience', 'One Link', 'Switch Modes']}
        title={
          <>
            <span className='block'>The artist page</span>
            <span className='block'>your music deserves.</span>
          </>
        }
        body='One clean destination for every release, fan capture, tickets, tips, and the audience relationship you actually own.'
        media={
          <div
            data-testid='artist-profiles-hero-media'
            className='relative mx-auto w-full max-w-[36rem]'
          >
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-10 top-2 h-40 blur-3xl'
              style={{
                background:
                  'radial-gradient(circle at center, rgba(76,177,255,0.16), transparent 72%)',
              }}
            />

            <ProductScreenshot
              src='/product-screenshots/profile-desktop.png'
              alt='Desktop artist profile showing smart links, fan capture, tour dates, and tipping'
              width={2880}
              height={1800}
              title='Artist profile'
              chrome='minimal'
              priority
              skipCheck
              testId='artist-profiles-hero-screenshot'
              className='rounded-[1.35rem] shadow-[0_28px_80px_rgba(0,0,0,0.34)]'
            />

            <div className='pointer-events-none absolute -bottom-8 right-5 hidden drop-shadow-[0_24px_70px_rgba(0,0,0,0.34)] sm:block lg:right-8'>
              <PhoneFrame className='h-[400px] w-[190px] lg:h-[460px] lg:w-[220px]'>
                <Image
                  src='/product-screenshots/profile-phone.png'
                  alt='Mobile artist profile preview with fan actions and listening destinations'
                  width={220}
                  height={460}
                  className='h-full w-full object-cover object-top'
                />
              </PhoneFrame>
            </div>

            <div className='mt-4 grid gap-3 sm:grid-cols-2 lg:max-w-[21rem]'>
              <div className='homepage-surface-card rounded-[1rem] px-4 py-3.5'>
                <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                  <Users className='h-3.5 w-3.5 text-primary-token' />
                  Audience Owned
                </div>
                <p className='mt-2 text-[1.45rem] font-medium tracking-[-0.04em] text-primary-token'>
                  4,218
                </p>
                <p className='mt-1 text-[12px] leading-5 text-tertiary-token'>
                  Contacts the artist can reach directly.
                </p>
              </div>

              <div className='homepage-surface-card rounded-[1rem] px-4 py-3.5'>
                <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
                  <BarChart3 className='h-3.5 w-3.5 text-primary-token' />
                  Top Source
                </div>
                <div className='mt-2 flex items-end justify-between gap-4'>
                  <p className='text-[1.45rem] font-medium tracking-[-0.04em] text-primary-token'>
                    IG / social
                  </p>
                  <p className='pb-1 text-[12px] text-tertiary-token'>38%</p>
                </div>
                <p className='mt-1 text-[12px] leading-5 text-tertiary-token'>
                  See what channel is actually driving fan capture.
                </p>
              </div>
            </div>
          </div>
        }
      />
      <FinalCTASection />
    </div>
  );
}

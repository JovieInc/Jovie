import { Button } from '@jovie/ui';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  MarketingContainer,
  MarketingHero,
  MarketingMetricCard,
  MarketingPageShell,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ClaimHandleForm } from '@/features/home/claim-handle';
import { PhoneFrame } from '@/features/home/PhoneFrame';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';

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

const PUBLIC_PROFILE_REVIEW_ROUTE =
  getCanonicalSurface('public-profile').reviewRoute;

export default function ArtistProfilesPage() {
  return (
    <MarketingPageShell>
      <section
        className='relative overflow-hidden pb-14 pt-[5.75rem] md:pb-20 md:pt-[6.25rem]'
        aria-labelledby='artist-profiles-heading'
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
          style={{ background: 'var(--linear-hero-backdrop)' }}
        />
        <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[36rem]' />

        <MarketingHero variant='split' className='relative'>
          <div className='max-w-[34rem]'>
            <p className='homepage-section-eyebrow'>Artist Profiles</p>
            <h1
              id='artist-profiles-heading'
              className='marketing-h1-linear mt-5 max-w-[11ch] text-primary-token'
            >
              A profile that looks like you meant it.
            </h1>
            <p className='marketing-lead-linear mt-5 max-w-[32rem] text-secondary-token'>
              Give every fan one clean destination for music, socials, tour
              dates, email capture, and support. No generic link page, no pile
              of mismatched tools.
            </p>

            <div className='mt-7 flex flex-wrap items-center gap-3'>
              <Button asChild size='lg'>
                <Link href={APP_ROUTES.SIGNUP}>Get started free</Link>
              </Button>
              <Button asChild variant='ghost' size='lg'>
                <Link href={PUBLIC_PROFILE_REVIEW_ROUTE}>
                  See profile example
                </Link>
              </Button>
            </div>

            <div className='mt-7 flex flex-wrap gap-2.5'>
              {[
                'Own every contact',
                'Show the right release first',
                'One link for every fan action',
              ].map(label => (
                <span
                  key={label}
                  className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-3.5 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-secondary-token'
                >
                  {label}
                </span>
              ))}
            </div>

            <div className='mt-8 grid gap-3 sm:grid-cols-2'>
              <MarketingMetricCard
                icon={<span className='h-2.5 w-2.5 rounded-full bg-sky-400' />}
                label='Audience signal'
                value='4,218'
                description='Owned contacts, not borrowed followers.'
              />
              <MarketingMetricCard
                icon={
                  <span className='h-2.5 w-2.5 rounded-full bg-violet-400' />
                }
                label='Top source'
                value='IG / social'
                valueAside='38%'
                description='See which channel actually turns attention into fan relationships.'
              />
            </div>
          </div>

          <div data-testid='artist-profiles-hero-surface' className='relative'>
            <MarketingSurfaceCard
              className='relative p-4 sm:p-5 lg:p-6'
              glowTone='blue'
            >
              <div
                aria-hidden='true'
                className='pointer-events-none absolute left-10 top-0 h-40 w-56 blur-3xl'
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(76,177,255,0.14), transparent 72%)',
                }}
              />

              <div className='relative overflow-hidden rounded-[1rem] border border-subtle bg-surface-0 px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-5 lg:px-6 lg:pb-6 lg:pt-6'>
                <div className='relative'>
                  <figure
                    aria-label='Desktop artist profile showing smart links, fan capture, tour dates, and tipping'
                    data-testid='artist-profiles-desktop-screenshot'
                    className='overflow-hidden rounded-[1rem] border border-subtle bg-surface-0 shadow-[0_28px_70px_rgba(0,0,0,0.28),0_10px_22px_rgba(0,0,0,0.18)]'
                  >
                    <Image
                      src='/product-screenshots/profile-desktop.png'
                      alt='Desktop artist profile showing smart links, fan capture, tour dates, and tipping'
                      width={2880}
                      height={1800}
                      sizes='(max-width: 1024px) 100vw, 900px'
                      className='h-auto w-full'
                    />
                  </figure>

                  <div className='pointer-events-none absolute bottom-4 right-4 hidden drop-shadow-[0_25px_60px_rgba(0,0,0,0.34)] sm:block lg:right-8'>
                    <PhoneFrame className='h-[420px] w-[202px] lg:h-[480px] lg:w-[228px]'>
                      <div className='relative h-full w-full'>
                        <Image
                          src='/product-screenshots/profile-phone.png'
                          alt='Mobile artist profile preview with fan actions and listening destinations'
                          fill
                          sizes='228px'
                          className='object-cover object-top'
                        />
                      </div>
                    </PhoneFrame>
                  </div>
                </div>
              </div>
            </MarketingSurfaceCard>
          </div>
        </MarketingHero>
      </section>

      <section
        className='section-glow section-glow-cta relative z-10 overflow-hidden'
        style={{
          borderTop: '1px solid var(--linear-border-subtle)',
          paddingTop: 'var(--linear-cta-section-pt)',
          paddingBottom: 'var(--linear-cta-section-pb)',
        }}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2'
          style={{
            width: '600px',
            height: '400px',
            background:
              'radial-gradient(ellipse at center, oklch(18% 0.04 270 / 0.3), transparent 65%)',
            filter: 'blur(40px)',
          }}
        />

        <MarketingContainer width='landing'>
          <div className='relative mx-auto max-w-[38rem] text-center'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Claim the page your next release deserves.
            </h2>

            <p className='mt-4 text-[15px] leading-[1.6] text-secondary-token sm:text-[16px]'>
              Start with your artist profile, then turn the same system into
              smarter launch pages, cleaner fan capture, and better release
              follow-through.
            </p>

            <div
              data-testid='artist-profiles-cta-form'
              className='mx-auto mt-7 w-full max-w-[27rem]'
            >
              <ClaimHandleForm />
            </div>

            <p className='mt-5 text-[11px] tracking-[0.01em] text-quaternary-token'>
              Free forever to get your profile live.
            </p>
          </div>
        </MarketingContainer>
      </section>
    </MarketingPageShell>
  );
}

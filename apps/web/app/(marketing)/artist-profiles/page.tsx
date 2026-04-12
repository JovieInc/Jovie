import { Button } from '@jovie/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingPageShell } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ClaimHandleForm } from '@/features/home/claim-handle';
import { StickyPhoneTour } from '@/features/home/StickyPhoneTour';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';
import { ARTIST_PROFILE_MODES } from './artist-profile-modes';

export const revalidate = false;

const ARTIST_PROFILES_TITLE = 'Artist Profiles';
const ARTIST_PROFILES_OG_TITLE = `Artist Profiles | ${APP_NAME}`;
const ARTIST_PROFILES_DESCRIPTION =
  'Claim your free artist profile on Jovie. One link that adapts to every release, tour, and campaign — built for independent artists.';
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
      {/* ── Hero (text-only, phone tour is the visual proof) ── */}
      <section
        className='relative overflow-hidden pb-8 pt-[5.75rem] md:pb-12 md:pt-[6.25rem]'
        aria-labelledby='artist-profiles-heading'
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
          style={{ background: 'var(--linear-hero-backdrop)' }}
        />
        <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[36rem]' />

        <div className='relative mx-auto max-w-[1120px] px-6 sm:px-8 lg:px-10'>
          <div className='mx-auto max-w-[42rem] text-center'>
            <h1
              id='artist-profiles-heading'
              className='marketing-h1-linear text-primary-token'
            >
              One link. Every release.
            </h1>
            <p className='mx-auto mt-5 max-w-[36rem] text-[17px] leading-[1.7] text-secondary-token sm:text-[18px]'>
              Put jov.ie/username in your bio once. Before a drop it becomes a
              countdown. On release day it becomes the best place to listen.
              Between campaigns it keeps collecting fans, tickets, tips, and
              business inquiries.
            </p>

            <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
              <Button asChild size='lg'>
                <Link href={APP_ROUTES.SIGNUP}>Claim your profile</Link>
              </Button>
              <Button asChild variant='ghost' size='lg'>
                <Link href={PUBLIC_PROFILE_REVIEW_ROUTE}>
                  See a live example
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Phone Tour (the centerpiece) ── */}
      <StickyPhoneTour
        modes={ARTIST_PROFILE_MODES}
        introTitle='Your profile adapts to what matters right now.'
        introBadge='One link. Four modes.'
        artistHandle='timwhite'
      />

      {/* ── Final CTA ── */}
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
              Claim your profile now.
            </h2>

            <p className='mt-4 text-[15px] leading-[1.6] text-secondary-token sm:text-[16px]'>
              One link that adapts to every release, tour, and campaign.
            </p>

            <div
              data-testid='artist-profiles-cta-form'
              className='mx-auto mt-7 w-full max-w-[27rem]'
            >
              <ClaimHandleForm />
            </div>

            <p className='mt-5 text-[10px] tracking-[0.01em] text-quaternary-token'>
              Free forever.
            </p>
          </div>
        </MarketingContainer>
      </section>
    </MarketingPageShell>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { HomepageHeroMockupCarousel } from '@/components/homepage/HomepageHeroCarousel';
import { HomepageOutcomeCards } from '@/components/homepage/HomepageOutcomeCards';
import { HERO_COPY } from '@/components/homepage/intent';
import { FridayRhythmSection } from '@/components/marketing/friday-rhythm-section';
import { GoLiveInSixtySection } from '@/components/marketing/go-live-in-sixty-section';
import {
  HomepageV2FinalCta,
  HomepageV2Pricing,
} from '@/components/marketing/homepage-v2/HomepageV2Ctas';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = {
    absolute: `${APP_NAME} | Release more music with less work.`,
  };
  const description =
    'Plan releases, create assets, pitch playlists, and promote every drop from one AI workspace.';
  const keywords = [
    'smart link in bio',
    'link in bio for musicians',
    'linktree alternative for artists',
    'artist profile',
    'music profile link',
    'artist release page',
    'music smart link',
    'pre-save page',
    'fan notifications for artists',
    'fan engagement',
    'music marketing',
    'artist bio link',
  ];

  return {
    title,
    description,
    keywords,
    authors: [
      {
        name: APP_NAME,
        url: BASE_URL,
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
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: '/',
      languages: {
        'en-US': '/',
      },
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: BASE_URL,
      title,
      description,
      siteName: APP_NAME,
      images: [
        {
          url: `${BASE_URL}/og/default.png`,
          secureUrl: `${BASE_URL}/og/default.png`,
          width: 1200,
          height: 630,
          alt: `${APP_NAME} - Your AI artist manager.`,
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
          url: `${BASE_URL}/og/default.png`,
          alt: `${APP_NAME} - Your AI artist manager.`,
          width: 1200,
          height: 630,
        },
      ],
      creator: '@meetjovie',
      site: '@meetjovie',
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

const WEBSITE_SCHEMA = buildWebsiteSchema({
  alternateName: ['Jovie', 'jov.ie', 'Jovie Link in Bio'],
  description:
    'Plan releases, create assets, pitch playlists, and promote every drop from one AI workspace.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'An AI workspace for artists that handles release planning, asset creation, playlist pitching, and promotion.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is an AI workspace for artists managing releases, assets, audience signal, and promotion.',
  sameAs: ['https://instagram.com/meetjovie'],
});

function HomepageHeroActions() {
  return (
    <div className='homepage-hero-actions'>
      <Link
        href={APP_ROUTES.SIGNUP}
        className='public-action-primary focus-ring-themed'
      >
        Request Access
      </Link>
      <Link
        href={APP_ROUTES.ARTIST_PROFILES}
        className='public-action-secondary focus-ring-themed'
      >
        Explore Profiles <span aria-hidden='true'>→</span>
      </Link>
    </div>
  );
}

function HomePageShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <>
      <AuthRedirectHandler />
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>
      {children}
    </>
  );
}

export default async function HomePage() {
  if (FEATURE_FLAGS.SHOW_HOME_V1_DESIGN) {
    const { HomeV1Design } = await import(
      '@/components/features/home/HomeV1Design'
    );

    return (
      <HomePageShell>
        <HomeV1Design />
      </HomePageShell>
    );
  }

  return (
    <HomePageShell>
      <section
        className='homepage-hero-stage relative'
        aria-labelledby='home-hero-heading'
      >
        <div
          data-testid='homepage-hero-shell'
          className='homepage-hero-shell relative flex min-h-[100svh] flex-col overflow-x-clip text-primary-token'
        >
          <div
            aria-hidden='true'
            className='homepage-hero-shell__layer homepage-hero-shell__base'
          />
          <div
            aria-hidden='true'
            className='homepage-hero-shell__layer homepage-hero-shell__halo'
          />
          <div
            aria-hidden='true'
            className='homepage-hero-shell__layer homepage-hero-shell__beam'
          />
          <div aria-hidden='true' className='homepage-hero-shell__grid-wrap'>
            <div className='homepage-hero-shell__grid' />
          </div>

          <div className='homepage-hero-inner relative z-[3] mx-auto flex w-full max-w-none min-w-0 flex-1 flex-col items-center justify-start'>
            <div className='homepage-hero-copy w-full min-w-0'>
              <p className='homepage-hero-eyebrow self-center text-center'>
                {HERO_COPY.eyebrow}
              </p>
              <h1
                id='home-hero-heading'
                className='homepage-hero-headline self-center text-center text-white'
              >
                {HERO_COPY.headline}
              </h1>
              <p className='homepage-hero-subhead self-center text-center text-white/68'>
                {HERO_COPY.subhead}
              </p>
              <HomepageHeroActions />
            </div>
            <HomepageHeroMockupCarousel />
          </div>
        </div>
      </section>
      <div className='homepage-trust-section'>
        <HomeTrustSection
          label='Trusted by artists on'
          presentation='inline-strip'
        />
      </div>
      <div className='homepage-story-stack'>
        <GoLiveInSixtySection />
        <FridayRhythmSection />
        <HomepageOutcomeCards
          headline={ARTIST_PROFILE_COPY.outcomeDuo.homepageHeadline}
          outcomes={ARTIST_PROFILE_COPY.outcomes}
        />
        {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_PRICING ? <HomepageV2Pricing /> : null}
        {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_FINAL_CTA ? (
          <HomepageV2FinalCta />
        ) : null}
      </div>
    </HomePageShell>
  );
}

import type { Metadata } from 'next';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { HomepageIntent } from '@/components/homepage/HomepageIntent';
import { ArtistProfileOutcomeDuo } from '@/components/marketing/artist-profile/ArtistProfileOutcomeDuo';
import {
  HomepageV2CaptureReactivate,
  HomepageV2FinalCta,
  HomepageV2FooterLinks,
  HomepageV2PowerGrid,
  HomepageV2Pricing,
  HomepageV2Spotlight,
  HomepageV2SystemOverview,
} from '@/components/marketing/homepage-v2/HomepageV2Route';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = {
    absolute: `${APP_NAME} | The Link Your Music Deserves.`,
  };
  const description =
    'Drive more streams automatically, notify every fan every time, and get paid from one profile that updates itself.';
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
          alt: `${APP_NAME} - The link your music deserves.`,
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
          alt: `${APP_NAME} - The link your music deserves.`,
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
    'Drive more streams automatically, notify every fan every time, and get paid from one profile that updates itself.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'One profile link that changes with each release, captures fans, shows tour dates, and keeps support in the same place.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie gives artists one profile link for releases, fans, shows, and support.',
  sameAs: ['https://instagram.com/meetjovie'],
});

export default function HomePage() {
  return (
    <>
      <AuthRedirectHandler />

      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>

      <section className='homepage-hero-stage relative px-3 pb-5 pt-[calc(var(--linear-header-height)+12px)] sm:px-4 lg:px-6'>
        <div
          data-testid='homepage-hero-shell'
          className='homepage-hero-shell relative mx-auto flex min-h-[calc(100svh-var(--linear-header-height)-1rem)] w-full max-w-[1440px] flex-col overflow-hidden rounded-[32px] border border-white/[0.08] text-primary-token shadow-[0_48px_120px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)]'
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

          <div className='relative z-[2] flex min-w-0 flex-1 items-center justify-center px-5 pb-20 pt-20 sm:px-8 sm:pb-24 sm:pt-24 lg:px-12 lg:pb-28 lg:pt-28'>
            <div className='w-full min-w-0 max-w-[860px] motion-safe:animate-[homepageFadeIn_420ms_cubic-bezier(0.16,1,0.3,1)_both]'>
              <HomepageIntent />
            </div>
          </div>
        </div>
      </section>

      <HomeTrustSection
        label='Trusted by artists'
        className='homepage-trust-reveal'
      />

      <ArtistProfileOutcomeDuo
        headline={ARTIST_PROFILE_COPY.outcomeDuo.homepageHeadline}
        duo={ARTIST_PROFILE_COPY.outcomeDuo}
      />

      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_SYSTEM_OVERVIEW ? (
        <HomepageV2SystemOverview />
      ) : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_SPOTLIGHT ? (
        <HomepageV2Spotlight />
      ) : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_CAPTURE_REACTIVATE ? (
        <HomepageV2CaptureReactivate />
      ) : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_POWER_GRID ? (
        <HomepageV2PowerGrid />
      ) : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_PRICING ? <HomepageV2Pricing /> : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_FINAL_CTA ? <HomepageV2FinalCta /> : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_FOOTER_LINKS ? (
        <HomepageV2FooterLinks />
      ) : null}
    </>
  );
}

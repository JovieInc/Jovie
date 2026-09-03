import type { Metadata } from 'next';
import {
  type HomepageCertifiedPreviews,
  HomepageCertifiedSections,
} from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { HERO_COPY } from '@/components/homepage/intent';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

const HERO_BACKDROP = {
  desktopSrc: '/images/hero/night-desk.webp',
  desktopWidth: 1536,
  desktopHeight: 1024,
  mobileSrc: '/images/hero/night-desk-mobile.webp',
  mobileWidth: 737,
  mobileHeight: 1024,
} as const;

// Real public-profile exports (jov.ie/timwhite) for the two sections that
// show product. Every other section is type only.
const CERTIFIED_PREVIEWS = {
  connected: getMarketingExportImage('tim-white-profile-listen-mobile'),
  relationships: [
    getMarketingExportImage('tim-white-profile-subscribe-mobile'),
    getMarketingExportImage('tim-white-profile-pay-mobile'),
    getMarketingExportImage('tim-white-profile-tour-mobile'),
  ],
} as const satisfies HomepageCertifiedPreviews;

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = {
    absolute: HOMEPAGE_LAUNCH_COPY.seo.title,
  };
  const description = HOMEPAGE_LAUNCH_COPY.seo.description;
  const keywords = [
    'public profile',
    'personal website',
    'control your presence',
    'name search',
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
      types: {
        'text/markdown': '/',
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
          alt: `${APP_NAME} - Control how the world sees you.`,
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
          alt: `${APP_NAME} - Control how the world sees you.`,
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
  description: HOMEPAGE_LAUNCH_COPY.seo.description,
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  HOMEPAGE_LAUNCH_COPY.seo.description
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: LEGAL_ENTITY_NAME,
  description: HOMEPAGE_LAUNCH_COPY.seo.description,
});

function HomepageHero() {
  return (
    <HomepageEditorialHero
      headingId='home-hero-heading'
      headline={HERO_COPY.headline}
      support={HERO_COPY.subhead}
      search={HERO_COPY.search}
      backdrop={HERO_BACKDROP}
    />
  );
}

function HomepageUnlockedSections() {
  return <HomepageCertifiedSections previews={CERTIFIED_PREVIEWS} />;
}

function HomepageStoryStack() {
  return (
    <div
      className='homepage-story-stack homepage-story-stack--proof-transition'
      data-proof-transition='true'
      data-testid='homepage-story-stack'
    >
      <HomepageUnlockedSections />
      <HomepageClose />
    </div>
  );
}

function HomePageShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <>
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>
      {children}
      <HomepageNoScriptContent />
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
      <HomepageHero />
      <HomepageStoryStack />
    </HomePageShell>
  );
}

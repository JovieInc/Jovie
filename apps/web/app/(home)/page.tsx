import type { Metadata } from 'next';
import { SignupFunnelBeacon } from '@/components/features/tracking/SignupFunnelBeacon';
import { HomepageYoutubeMvp } from '@/components/homepage/HomepageYoutubeMvp';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { HOMEPAGE_YOUTUBE_MVP } from '@/data/homepageYoutubeMvp';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';
import { HomepageQueryProvider } from './homepage-query-provider';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = {
    absolute: HOMEPAGE_YOUTUBE_MVP.seo.title,
  };
  const description = HOMEPAGE_YOUTUBE_MVP.seo.description;
  const keywords = [
    'YouTube artists',
    'YouTube thumbnails',
    'release planning',
    'smart links',
    'artist profile',
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
    category: 'Technology',
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
          alt: `${APP_NAME}: ${HOMEPAGE_YOUTUBE_MVP.hero.headline}`,
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
          alt: `${APP_NAME}: ${HOMEPAGE_YOUTUBE_MVP.hero.headline}`,
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
  description: HOMEPAGE_YOUTUBE_MVP.seo.description,
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  HOMEPAGE_YOUTUBE_MVP.seo.description
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: LEGAL_ENTITY_NAME,
  description: HOMEPAGE_YOUTUBE_MVP.seo.description,
});

function HomePageShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <>
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>
      <SignupFunnelBeacon surface='homepage' />
      {children}
    </>
  );
}

export default async function HomePage() {
  return (
    <HomePageShell>
      <HomepageQueryProvider>
        <HomepageYoutubeMvp />
      </HomepageQueryProvider>
    </HomePageShell>
  );
}

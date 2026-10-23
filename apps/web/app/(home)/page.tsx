import type { Metadata } from 'next';
import { SignupFunnelBeacon } from '@/components/features/tracking/SignupFunnelBeacon';
import {
  HomepageArtistHero,
  HomepageFanStates,
  HomepageOfferClose,
} from '@/components/homepage/HomepageArtistProfile';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
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
    absolute: HOMEPAGE_COPY.seo.title,
  };
  const description = COMPANY_IDENTITY.seoDescription;
  const keywords = [
    'Jovie profile',
    'online identity',
    'public profile',
    'personal website',
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
          alt: HOMEPAGE_COPY.seo.title,
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
          alt: HOMEPAGE_COPY.seo.title,
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
  description: COMPANY_IDENTITY.seoDescription,
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(COMPANY_IDENTITY.seoDescription);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: LEGAL_ENTITY_NAME,
  description: COMPANY_IDENTITY.seoDescription,
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

/**
 * The homepage sells the artist profile (EVENT 2026-10-20, Tim): the claim
 * and the live profile, three real fan states, then the free offer and the
 * same claim. Company metadata and structured data above stay general.
 */
export default function HomePage() {
  return (
    <HomePageShell>
      <HomepageQueryProvider>
        <HomepageArtistHero headingId='home-hero-heading' />
        <HomepageFanStates />
        <HomepageOfferClose />
      </HomepageQueryProvider>
    </HomePageShell>
  );
}

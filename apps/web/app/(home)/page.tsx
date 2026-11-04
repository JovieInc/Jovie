import type { Metadata } from 'next';
import { SignupFunnelBeacon } from '@/components/features/tracking/SignupFunnelBeacon';
import { HomepageSpecSections } from '@/components/homepage/HomepageSpecSections';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { MARKETING_PAGE_KIND } from '@/lib/content-records/marketing-page';
import { getLiveContent } from '@/lib/content-records/store.server';
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
      creator: COMPANY_IDENTITY.xHandle,
      site: COMPANY_IDENTITY.xHandle,
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

// Root structured data describes the general identity product. Closed signup
// carries no in-stock billing offers or unsupported search-engine action.
const WEBSITE_SCHEMA = buildWebsiteSchema({
  alternateName: [...COMPANY_IDENTITY.schemaAlternateNames],
  description: COMPANY_IDENTITY.seoDescription,
});
const SOFTWARE_SCHEMA = buildSoftwareSchema(
  COMPANY_IDENTITY.seoDescription,
  []
);

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

/** Published generic section records fall back to the current code default
 * when their schema or complete homepage contract is no longer valid. */
export default async function HomePage() {
  const spec = await getLiveContent(MARKETING_PAGE_KIND, 'home');
  return (
    <HomePageShell>
      <HomepageQueryProvider>
        <HomepageSpecSections sections={spec.data.sections} />
      </HomepageQueryProvider>
    </HomePageShell>
  );
}

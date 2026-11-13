import type { Metadata } from 'next';
import { SignupFunnelBeacon } from '@/components/features/tracking/SignupFunnelBeacon';
import { HomepageSpecSections } from '@/components/homepage/HomepageSpecSections';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { MARKETING_PAGE_KIND } from '@/lib/content-records/marketing-page';
import { getLiveContent } from '@/lib/content-records/store.server';
import { publicEnv } from '@/lib/env-public';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = {
    absolute: HOMEPAGE_EDITORIAL_COPY.seo.title,
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
          alt: HOMEPAGE_EDITORIAL_COPY.seo.title,
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
          alt: HOMEPAGE_EDITORIAL_COPY.seo.title,
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

/**
 * The homepage JSON-LD speaks with the approved artist-profile launch
 * (JOV-8565): the WebSite and SoftwareApplication descriptions carry the
 * approved artist-profile landing-page copy, and billing claims come from
 * offer truth — the free-forever profile plus the self-serve monthly Pro
 * offer. Nothing here promises presence, monitoring, or unattended work as
 * live, and the SearchAction stays off until the route serves search.
 */
const HOMEPAGE_LAUNCH_DESCRIPTION = ARTIST_PROFILE_COPY.seo.description;

const HOMEPAGE_OFFERS = [
  {
    '@type': 'Offer' as const,
    name: getPublicPriceClaim('free').displayName,
    price: String(getPublicPriceClaim('free').priceUsd),
    priceCurrency: 'USD',
    description: getPublicPriceClaim('free').badge,
    availability: 'https://schema.org/InStock',
  },
  {
    '@type': 'Offer' as const,
    name: getPublicPriceClaim('pro').displayName,
    price: String(getPublicPriceClaim('pro').priceUsd),
    priceCurrency: 'USD',
    description: getPublicPriceClaim('pro').note,
    availability: 'https://schema.org/InStock',
  },
];

const WEBSITE_SCHEMA = buildWebsiteSchema({
  alternateName: [...COMPANY_IDENTITY.schemaAlternateNames],
  description: HOMEPAGE_LAUNCH_DESCRIPTION,
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  HOMEPAGE_LAUNCH_DESCRIPTION,
  HOMEPAGE_OFFERS
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

/**
 * The homepage leads with "Jovie helps you move your music forward." (Tim,
 * 2026-11-03, `/` only) and tells one editorial story: the profile at
 * jov.ie/you, the releases workspace, then the claim close. Signup is open
 * (Tim, 2026-11-12: "Switch it"), so the hero, header and close all enter
 * `/start` with the shared claim-profile intent; only the
 * `PUBLIC_SIGNUP_CLOSED` kill switch brings back the on-page invitation form.
 * The ORGANIZATION schema keeps the general company identity.
 *
 * Section order and copy slots come from the published `marketing-page/home`
 * content record (the claim actions always come from the shared intent), so copy changes go live without a code deploy. The page
 * stays static: the record is read at prerender and on publish-triggered
 * regeneration only (publish expires its cache tag), never per request, and
 * it falls back to the code default when nothing valid is published.
 */
export default async function HomePage() {
  const spec = await getLiveContent(MARKETING_PAGE_KIND, 'home');
  return (
    <HomePageShell>
      <HomepageSpecSections sections={spec.data.sections} />
    </HomePageShell>
  );
}

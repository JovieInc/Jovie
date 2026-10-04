import type { Metadata } from 'next';
import { SignupFunnelBeacon } from '@/components/features/tracking/SignupFunnelBeacon';
import {
  type HomepageCertifiedPreviews,
  HomepageCertifiedSections,
} from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HomepageEditorialChangelog } from '@/components/homepage/HomepageEditorialChangelog';
import { HomepageIdentityClose } from '@/components/homepage/HomepageIdentityClose';
import { HomepageIdentityFaq } from '@/components/homepage/HomepageIdentityFaq';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
import { HomepageIdentitySections } from '@/components/homepage/HomepageIdentitySections';
import { HomepageLogoStrip } from '@/components/homepage/HomepageLogoStrip';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HOMEPAGE_MEDIA_MAP } from '@/data/homepageMediaMap';
import {
  buildFaqSchema,
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';
import { HOMEPAGE_V3_ENABLED } from '@/lib/flags/homepage-v3';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { HomepageQueryProvider } from './homepage-query-provider';

const CERTIFIED_PREVIEWS = {
  subscribe: HOMEPAGE_MEDIA_MAP.relationships.asset,
  pay: HOMEPAGE_MEDIA_MAP.pay.asset,
} as const satisfies HomepageCertifiedPreviews;

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = {
    absolute: HOMEPAGE_IDENTITY_COPY.seo.title,
  };
  const description = HOMEPAGE_IDENTITY_COPY.seo.description;
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
          alt: `${APP_NAME}: ${HOMEPAGE_IDENTITY_COPY.hero.headline}`,
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
          alt: `${APP_NAME}: ${HOMEPAGE_IDENTITY_COPY.hero.headline}`,
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
  description: HOMEPAGE_IDENTITY_COPY.seo.description,
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  HOMEPAGE_IDENTITY_COPY.seo.description
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: LEGAL_ENTITY_NAME,
  description: HOMEPAGE_IDENTITY_COPY.seo.description,
});

const FAQ_SCHEMA = buildFaqSchema([...HOMEPAGE_IDENTITY_COPY.faq.items]);

function HomepageHero() {
  return <HomepageIdentityHero headingId='home-hero-heading' />;
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
      <HomepageEditorialChangelog />
      <HomepageClose />
    </div>
  );
}

// Canonical Pen v3 body: the permission-gated logo strip, presence,
// structure, FAQ, and the close, on the shared page background. The live
// story stack is unchanged while off.
function HomepageIdentityStoryStack() {
  return (
    <div
      className='homepage-identity-stack'
      data-testid='homepage-identity-story-stack'
    >
      <HomepageLogoStrip />
      <HomepageIdentitySections />
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <HomepageIdentityFaq />
      <HomepageIdentityClose />
    </div>
  );
}

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
      <HomepageQueryProvider>
        <HomepageHero />
        {HOMEPAGE_V3_ENABLED ? (
          <HomepageIdentityStoryStack />
        ) : (
          <HomepageStoryStack />
        )}
      </HomepageQueryProvider>
    </HomePageShell>
  );
}

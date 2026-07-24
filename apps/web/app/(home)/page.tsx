import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { HomepageClosedLoop } from '@/components/homepage/HomepageClosedLoop';
import { HomepageElectricSeam } from '@/components/homepage/HomepageElectricSeam';
import { HomepageHeroCommandCenter } from '@/components/homepage/HomepageHeroCommandCenter';
import {
  HomepageMeetJovie,
  type HomepageMeetJovieCards,
} from '@/components/homepage/HomepageMeetJovie';
import { HomepageOpportunitySection } from '@/components/homepage/HomepageOpportunitySection';
import { HomepagePosterHero } from '@/components/homepage/HomepagePosterHero';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
import { HomepageWorkspaceSectionLazy } from '@/components/homepage/HomepageWorkspaceSectionLazy';
import { HERO_COPY } from '@/components/homepage/intent';
import { FaqSection } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import {
  buildFaqSchema,
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

// Below-the-fold sections are dynamic-loaded so their `motion/react`
// hydration cost doesn't compete with above-the-fold work.
//
// JOV-1835: cuts homepage TBT from ~1365ms toward the 300ms budget.
//
// Sections that are not motion-heavy keep `ssr: true` so their HTML stays in
// the initial document for SEO. The motion-driven workspace lives behind a
// client `*Lazy.tsx` shim with reserved placeholder geometry, so its chunk and
// scroll subscriptions do not compete with hero hydration or shift the page.
const HomepageV2FinalCta = dynamic(
  () =>
    import('@/components/marketing/homepage-v2/HomepageV2Ctas').then(m => ({
      default: m.HomepageV2FinalCta,
    })),
  { ssr: true }
);
const HomeComposerHero = dynamic(
  () =>
    import('@/components/marketing/HomeComposerHero').then(m => ({
      default: m.HomeComposerHero,
    })),
  { ssr: true }
);
const WORKSPACE_SCREENSHOT = getMarketingExportImage(
  HOMEPAGE_LAUNCH_COPY.workspace.screenshotKey
);
const ARTIST_OUTCOME_CARDS = [
  {
    id: 'drive-streams',
    title: 'Drive Streams',
    image: getMarketingExportImage('tim-white-profile-listen-mobile'),
  },
  {
    id: 'capture-fans',
    title: 'Capture Fans',
    image: getMarketingExportImage('tim-white-profile-subscribe-mobile'),
  },
  {
    id: 'get-paid',
    title: 'Get Paid',
    image: getMarketingExportImage('tim-white-profile-pay-mobile'),
  },
] as const satisfies HomepageMeetJovieCards;

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = {
    absolute: HOMEPAGE_LAUNCH_COPY.seo.title,
  };
  const description = HOMEPAGE_LAUNCH_COPY.seo.description;
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
          alt: HOMEPAGE_LAUNCH_COPY.seo.title,
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
          alt: HOMEPAGE_LAUNCH_COPY.seo.title,
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
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is an AI workspace for artists managing releases, assets, audience signal, and promotion.',
  sameAs: ['https://instagram.com/meetjovie'],
});

const FAQ_SCHEMA = buildFaqSchema([...HOMEPAGE_LAUNCH_COPY.faq]);

function HomepageHero() {
  return (
    <>
      <HomepagePosterHero
        headingId='home-hero-heading'
        headline={HERO_COPY.headline}
        subtitle={HERO_COPY.subhead}
        trackedLinkComponent={HomepageTrackedLink}
        primaryCta={{
          label: HERO_COPY.primaryCta.label,
          href: HERO_COPY.primaryCta.href,
          signUp: true,
          eventName: 'homepage_hero_cta_clicked',
          eventProperties: {
            cta: 'primary',
            label: HERO_COPY.primaryCta.label,
          },
        }}
        secondaryCta={{
          label: HERO_COPY.secondaryCta.label,
          href: HERO_COPY.secondaryCta.href,
          eventName: 'homepage_hero_secondary_cta_clicked',
          eventProperties: {
            cta: 'secondary',
            label: HERO_COPY.secondaryCta.label,
          },
        }}
        seam={
          <HomepageElectricSeam
            idSeed='homepage-hero-electric-seam'
            className='homepage-poster-hero__electric-seam'
          />
        }
        media={<HomepageHeroCommandCenter />}
      />
      <div className='homepage-trust-section system-b-mounted-home-trust-strip-shell'>
        <HomeTrustSection
          label='Artists distributed through' // ui-casing-allow: design-locked trust strip copy
          presentation='inline-strip'
          includeSecondaryLogo={false}
        />
      </div>
    </>
  );
}

function HomepageOpportunity() {
  const copy = HOMEPAGE_LAUNCH_COPY.productStatement;
  const aiCopy = HOMEPAGE_LAUNCH_COPY.aiComposer;

  return (
    <HomepageOpportunitySection
      headline={copy.body}
      description={copy.description}
      opportunities={copy.cards}
      demo={
        <div data-testid='homepage-ai-composer-demo'>
          <HomeComposerHero />
          <div className='homepage-opportunity-section__demo-copy'>
            <h3>{aiCopy.headline}</h3>
            <p>{aiCopy.body}</p>
          </div>
        </div>
      }
    />
  );
}

function HomepageFaq() {
  return (
    <div id='faq' className='homepage-faq-section' data-testid='homepage-faq'>
      <FaqSection
        items={HOMEPAGE_LAUNCH_COPY.faq}
        heading='Questions'
        headingClassName='homepage-story-heading'
        className='homepage-faq-section__inner'
        analyticsEventName='homepage_faq_opened'
        analyticsProperties={{ source: 'homepage' }}
      />
    </div>
  );
}

function HomepageUnlockedSections() {
  return (
    <>
      <HomepageMeetJovie cards={ARTIST_OUTCOME_CARDS} />
      <HomepageOpportunity />
      <HomepageWorkspaceSectionLazy screenshot={WORKSPACE_SCREENSHOT} />
      <HomepageClosedLoop />
      <HomepageFaq />
    </>
  );
}

function HomepageStoryStack() {
  return (
    <div
      className='homepage-story-stack homepage-story-stack--proof-transition'
      data-proof-transition='true'
      data-testid='homepage-story-stack'
    >
      <HomepageUnlockedSections />
      <HomepageV2FinalCta />
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
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
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
      <HomepageHero />
      <HomepageStoryStack />
    </HomePageShell>
  );
}

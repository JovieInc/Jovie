import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { HomepageArtistProfilesCarouselLazy } from '@/components/homepage/HomepageArtistProfilesCarouselLazy';
import { HomepageHeroCommandCenter } from '@/components/homepage/HomepageHeroCommandCenter';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
import { HomepageWorkspaceSectionLazy } from '@/components/homepage/HomepageWorkspaceSectionLazy';
import { HERO_COPY } from '@/components/homepage/intent';
import { FaqSection, MarketingHero } from '@/components/marketing';
import { FridayRhythmSectionLazy } from '@/components/marketing/FridayRhythmSectionLazy';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { getHomepageFrontDoorCtaContract } from '@/data/homepageFrontDoorCta';
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
// Sections that are not motion-heavy keep `ssr: true` so their HTML
// stays in the initial document for SEO. The heaviest motion-driven
// sections (FridayRhythmSection / HomepageWorkspaceSection /
// HomepageArtistProfilesCarousel) live in their own `'use client'`
// `*Lazy.tsx` shims that pass `ssr: false` to `next/dynamic` (forbidden
// in Server Components in Next 15 App Router) so the JS chunk and
// motion subscriptions don't load or execute on initial hydration.
const HomepageV2Pricing = dynamic(
  () =>
    import('@/components/marketing/homepage-v2/HomepageV2Ctas').then(m => ({
      default: m.HomepageV2Pricing,
    })),
  { ssr: true }
);
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
const HomeBentoPairs = dynamic(
  () =>
    import('@/components/features/home/HomeBentoPairs').then(m => ({
      default: m.HomeBentoPairs,
    })),
  { ssr: true }
);
const HomeLoopDiagramSection = dynamic(
  () =>
    import('@/components/features/home/HomeLoopDiagramSection').then(m => ({
      default: m.HomeLoopDiagramSection,
    })),
  { ssr: true }
);
const HomeStatQuoteSection = dynamic(
  () =>
    import('@/components/features/home/HomeStatQuoteSection').then(m => ({
      default: m.HomeStatQuoteSection,
    })),
  { ssr: true }
);

const HERO_PRODUCT_IMAGES = {
  library: getMarketingExportImage('shell-v1-library-desktop'),
  profile: getMarketingExportImage('tim-white-profile-live-mobile'),
  release: getMarketingExportImage('release-presave-mobile'),
  releases: getMarketingExportImage('shell-v1-releases-desktop'),
};
const WORKSPACE_SCREENSHOT = getMarketingExportImage(
  HOMEPAGE_LAUNCH_COPY.workspace.screenshotKey
);
const ARTIST_PROFILE_CARDS = HOMEPAGE_LAUNCH_COPY.artistProfiles.cards.map(
  card => ({
    id: card.id,
    title: card.title,
    image: getMarketingExportImage(card.screenshotScenarioId),
    glow: card.glow,
  })
);

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
  const secondaryCta = getHomepageFrontDoorCtaContract(
    FEATURE_FLAGS.WAITLIST_ENABLED
  ).secondary;

  return (
    <>
      <MarketingHero
        headingId='home-hero-heading'
        testId='homepage-hero-shell'
        headline={HERO_COPY.headline}
        subtitle={HERO_COPY.subhead}
        linkComponent={HomepageTrackedLink}
        primaryCta={{
          label: HERO_COPY.primaryCta.label,
          href: HERO_COPY.primaryCta.href,
          testId: 'homepage-primary-cta',
          signUp: true,
          eventName: 'homepage_hero_cta_clicked',
          eventProperties: {
            cta: 'primary',
            label: HERO_COPY.primaryCta.label,
          },
        }}
        secondaryCta={
          secondaryCta
            ? {
                label: (
                  <>
                    {secondaryCta.label}
                    <ArrowRight
                      aria-hidden='true'
                      size={15}
                      strokeWidth={1.9}
                    />
                  </>
                ),
                href: secondaryCta.href,
                eventName: 'homepage_hero_cta_clicked',
                eventProperties: {
                  cta: 'secondary',
                  label: secondaryCta.label,
                },
              }
            : undefined
        }
        logos={false}
      />
      <div className='mx-auto w-full max-w-public-content px-6 sm:px-8 lg:px-10'>
        <HomepageHeroCommandCenter images={HERO_PRODUCT_IMAGES} />
      </div>
      <div className='homepage-trust-section system-b-mounted-home-trust-strip-shell'>
        <HomeTrustSection
          label='Artists Distributed Through'
          presentation='inline-strip'
        />
      </div>
    </>
  );
}

function HomepageProductStatement() {
  const copy = HOMEPAGE_LAUNCH_COPY.productStatement;
  const aiCopy = HOMEPAGE_LAUNCH_COPY.aiComposer;

  return (
    <section
      className='homepage-product-statement system-b-mounted-home-product-statement'
      aria-labelledby='homepage-product-statement-heading'
      data-testid='homepage-product-statement'
    >
      <div className='homepage-product-statement__inner system-b-mounted-home-product-statement-inner'>
        {copy.eyebrow ? (
          <p className='homepage-section-eyebrow system-b-mounted-home-product-statement-eyebrow'>
            {copy.eyebrow}
          </p>
        ) : null}
        <h2
          id='homepage-product-statement-heading'
          className='system-b-mounted-home-product-statement-headline'
        >
          <span className='homepage-product-statement__lead system-b-mounted-home-product-statement-lead'>
            {copy.lead}
          </span>{' '}
          <span className='homepage-product-statement__body system-b-mounted-home-product-statement-body'>
            {copy.body}
          </span>
        </h2>
        <div
          className='homepage-product-statement__ai system-b-mounted-home-product-statement-ai'
          data-testid='homepage-ai-composer-demo'
        >
          <HomeComposerHero />
          <div className='homepage-product-statement__ai-copy system-b-mounted-home-product-statement-ai-copy'>
            <h3>{aiCopy.headline}</h3>
            <p>{aiCopy.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomepageGoLiveStepsSection() {
  const copy = HOMEPAGE_LAUNCH_COPY.productStatement;

  return (
    <section
      className='homepage-go-live-section'
      aria-labelledby='homepage-go-live-heading'
      data-testid='homepage-go-live-section'
    >
      <div className='homepage-go-live-section__inner'>
        <h2 id='homepage-go-live-heading'>
          {HOMEPAGE_LAUNCH_COPY.workspace.kicker}
        </h2>
        <ul className='homepage-go-live-section__cards'>
          {copy.cards.map(card => (
            <li className='homepage-go-live-card' key={card.title}>
              {card.number ? <span>{card.number}</span> : null}
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HomepageFaq() {
  return (
    <div id='faq' className='homepage-faq-section' data-testid='homepage-faq'>
      <FaqSection
        items={HOMEPAGE_LAUNCH_COPY.faq}
        heading='Questions'
        headingClassName='homepage-story-heading'
        className='mx-auto w-full max-w-[760px] px-[var(--homepage-page-gutter)] py-[var(--homepage-section-space)]'
        analyticsEventName='homepage_faq_opened'
        analyticsProperties={{ source: 'homepage' }}
      />
    </div>
  );
}

function HomepageUnlockedSections() {
  return (
    <>
      <HomepageProductStatement />
      {FEATURE_FLAGS.SHOW_HOMEPAGE_GO_LIVE_SECTION ? (
        <HomepageGoLiveStepsSection />
      ) : null}
      <HomepageWorkspaceSectionLazy screenshot={WORKSPACE_SCREENSHOT} />
      <HomepageArtistProfilesCarouselLazy cards={ARTIST_PROFILE_CARDS} />
      {FEATURE_FLAGS.SHOW_HOMEPAGE_FRIDAY_RHYTHM ? (
        <FridayRhythmSectionLazy />
      ) : null}
      {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? <HomeBentoPairs /> : null}
      {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? <HomeLoopDiagramSection /> : null}
      {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? <HomeStatQuoteSection /> : null}
      <HomepageV2Pricing />
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

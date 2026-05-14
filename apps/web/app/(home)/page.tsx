import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { HomepageHeroCommandCenter } from '@/components/homepage/HomepageHeroCommandCenter';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
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
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

// Below-the-fold sections are dynamic-loaded so their `motion/react`
// hydration cost doesn't compete with above-the-fold work. SSR stays on
// (SEO + initial HTML preserved) — only the client JS chunk is deferred.
// JOV-1835: cuts homepage TBT from ~1365ms toward the 300ms budget.
const FridayRhythmSection = dynamic(
  () =>
    import('@/components/marketing/friday-rhythm-section').then(m => ({
      default: m.FridayRhythmSection,
    })),
  { ssr: true }
);
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
const HomepageWorkspaceSection = dynamic(
  () =>
    import('@/components/homepage/HomepageWorkspaceSection').then(m => ({
      default: m.HomepageWorkspaceSection,
    })),
  { ssr: true }
);
const HomepageArtistProfilesCarousel = dynamic(
  () =>
    import('@/components/homepage/HomepageArtistProfilesCarousel').then(m => ({
      default: m.HomepageArtistProfilesCarousel,
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

function HomepageHeroActions() {
  return (
    <div className='homepage-hero-actions'>
      <HomepageTrackedLink
        href={HERO_COPY.primaryCta.href}
        data-testid='homepage-primary-cta'
        data-cta-sign-up='true'
        className='public-action-primary focus-ring-themed'
        eventName='homepage_hero_cta_clicked'
        eventProperties={{ cta: 'primary', label: HERO_COPY.primaryCta.label }}
      >
        {HERO_COPY.primaryCta.label}
      </HomepageTrackedLink>
      <HomepageTrackedLink
        href={HERO_COPY.secondaryCta.href}
        className='homepage-hero-secondary-link focus-ring-themed'
        eventName='homepage_hero_cta_clicked'
        eventProperties={{
          cta: 'secondary',
          label: HERO_COPY.secondaryCta.label,
        }}
      >
        {HERO_COPY.secondaryCta.label}
        <ArrowRight aria-hidden='true' size={15} strokeWidth={1.9} />
      </HomepageTrackedLink>
    </div>
  );
}

function HomepageProductStatement() {
  const copy = HOMEPAGE_LAUNCH_COPY.productStatement;
  const aiCopy = HOMEPAGE_LAUNCH_COPY.aiComposer;

  return (
    <section
      className='homepage-product-statement'
      aria-labelledby='homepage-product-statement-heading'
      data-testid='homepage-product-statement'
    >
      <div className='homepage-product-statement__inner'>
        <p className='homepage-section-eyebrow'>{copy.eyebrow}</p>
        <h2 id='homepage-product-statement-heading'>
          <span className='homepage-product-statement__lead'>{copy.lead}</span>
          <span className='homepage-product-statement__body'>{copy.body}</span>
        </h2>
        <div
          className='homepage-product-statement__ai'
          data-testid='homepage-ai-composer-demo'
        >
          <HomeComposerHero />
          <div className='homepage-product-statement__ai-copy'>
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
        <ol className='homepage-go-live-section__cards'>
          {copy.cards.map(card => (
            <li className='homepage-go-live-card' key={card.title}>
              <span>{card.number}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function HomepageFaq() {
  return (
    <div id='faq' className='homepage-faq-section' data-testid='homepage-faq'>
      <FaqSection
        items={HOMEPAGE_LAUNCH_COPY.faq}
        heading='Frequently Asked Questions'
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
      <HomepageGoLiveStepsSection />
      <HomepageWorkspaceSection screenshot={WORKSPACE_SCREENSHOT} />
      <HomepageArtistProfilesCarousel cards={ARTIST_PROFILE_CARDS} />
      {FEATURE_FLAGS.SHOW_HOMEPAGE_FRIDAY_RHYTHM ? (
        <FridayRhythmSection />
      ) : null}
      {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? <HomeBentoPairs /> : null}
      {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? <HomeLoopDiagramSection /> : null}
      {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? <HomeStatQuoteSection /> : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_PRICING ? <HomepageV2Pricing /> : null}
      <HomepageFaq />
    </>
  );
}

function HomepageStoryStack({
  showUnlockedSections,
}: Readonly<{ showUnlockedSections: boolean }>) {
  const className = showUnlockedSections
    ? 'homepage-story-stack homepage-story-stack--proof-transition'
    : 'homepage-story-stack';

  return (
    <div
      className={className}
      data-proof-transition={showUnlockedSections ? 'true' : 'false'}
      data-testid='homepage-story-stack'
    >
      {showUnlockedSections ? <HomepageUnlockedSections /> : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_FINAL_CTA ? <HomepageV2FinalCta /> : null}
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
      {FEATURE_FLAGS.SHOW_HOMEPAGE_UNLOCKED_SECTIONS ? (
        <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      ) : null}
      {children}
    </>
  );
}

export default async function HomePage() {
  const showUnlockedSections = FEATURE_FLAGS.SHOW_HOMEPAGE_UNLOCKED_SECTIONS;

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
              <h1
                aria-label={HERO_COPY.headline}
                id='home-hero-heading'
                className='homepage-hero-headline self-center text-center text-white'
              >
                <span
                  aria-hidden='true'
                  className='homepage-hero-headline__desktop'
                >
                  Release more music
                </span>
                <span
                  aria-hidden='true'
                  className='homepage-hero-headline__desktop'
                >
                  with less work
                </span>
                <span
                  aria-hidden='true'
                  className='homepage-hero-headline__mobile'
                >
                  Release more
                </span>
                <span
                  aria-hidden='true'
                  className='homepage-hero-headline__mobile'
                >
                  music with
                </span>
                <span
                  aria-hidden='true'
                  className='homepage-hero-headline__mobile'
                >
                  less work
                </span>
              </h1>
              <p className='homepage-hero-subhead self-center text-center text-white/68'>
                {HERO_COPY.subhead}
              </p>
              <HomepageHeroActions />
            </div>
            <HomepageHeroCommandCenter images={HERO_PRODUCT_IMAGES} />
          </div>
        </div>
      </section>
      <div className='homepage-trust-section'>
        <HomeTrustSection
          label='Trusted by artists and teams releasing on'
          presentation='inline-strip'
        />
      </div>
      <HomepageStoryStack showUnlockedSections={showUnlockedSections} />
    </HomePageShell>
  );
}

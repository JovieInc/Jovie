import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { HomepageHeroMockupCarousel } from '@/components/homepage/HomepageHeroCarousel';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
import { HERO_COPY } from '@/components/homepage/intent';
import { FaqSection } from '@/components/marketing';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile/ArtistProfileSpecWall';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_PROFILE_SPEC_TILES } from '@/data/artistProfileFeatures';
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

function HomepageEyebrow({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <p className='homepage-section-eyebrow'>{children}</p>;
}

function HomepageHeroActions() {
  return (
    <div className='homepage-hero-actions'>
      <HomepageTrackedLink
        href={HERO_COPY.primaryCta.href}
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
        <span aria-hidden='true'>→</span>
      </HomepageTrackedLink>
    </div>
  );
}

function HomepageScreenshotMedia({
  className,
  scenarioId,
  sizes,
}: Readonly<{
  className?: string;
  scenarioId: string;
  sizes: string;
}>) {
  const image = getMarketingExportImage(scenarioId);

  return (
    <div className={className}>
      <Image
        src={image.publicUrl}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes={sizes}
        quality={85}
        unoptimized
      />
    </div>
  );
}

function HomepageProductDepthBand() {
  return (
    <section
      className='homepage-product-depth-band'
      aria-labelledby='homepage-product-depth-heading'
      data-testid='homepage-product-depth-band'
    >
      <div className='homepage-product-depth-band__inner'>
        <div className='homepage-product-depth-band__copy'>
          <HomepageEyebrow>
            {HOMEPAGE_LAUNCH_COPY.productProof.eyebrow}
          </HomepageEyebrow>
          <h2 id='homepage-product-depth-heading'>
            {HOMEPAGE_LAUNCH_COPY.productProof.headline}
          </h2>
          <p>{HOMEPAGE_LAUNCH_COPY.productProof.body}</p>
        </div>
        <div className='homepage-product-depth-band__media' aria-hidden='true'>
          <HomepageScreenshotMedia
            scenarioId='dashboard-releases-sidebar-desktop'
            sizes='(min-width: 1024px) 78rem, 94vw'
            className='homepage-product-depth-band__desktop'
          />
        </div>
      </div>
    </section>
  );
}

function HomepageWorkflowStep({
  index,
  step,
}: Readonly<{
  index: number;
  step: (typeof HOMEPAGE_LAUNCH_COPY.workflow.steps)[number];
}>) {
  return (
    <article className='homepage-workflow-strip__step'>
      <HomepageScreenshotMedia
        scenarioId={step.screenshotKey}
        sizes='(min-width: 1024px) 24rem, (min-width: 768px) 34vw, 86vw'
        className='homepage-workflow-strip__step-media'
      />
      <div className='homepage-workflow-strip__step-copy'>
        <span>{(index + 1).toString().padStart(2, '0')}</span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
    </article>
  );
}

function HomepageWorkflowStrip() {
  return (
    <section
      id='release-workflow'
      className='homepage-workflow-strip'
      aria-labelledby='homepage-workflow-heading'
    >
      <div className='homepage-workflow-strip__inner'>
        <div className='homepage-workflow-strip__copy'>
          <HomepageEyebrow>
            {HOMEPAGE_LAUNCH_COPY.workflow.eyebrow}
          </HomepageEyebrow>
          <h2 id='homepage-workflow-heading'>
            <span>{HOMEPAGE_LAUNCH_COPY.workflow.headlineMuted}</span>{' '}
            {HOMEPAGE_LAUNCH_COPY.workflow.headline}
          </h2>
          <p>{HOMEPAGE_LAUNCH_COPY.workflow.body}</p>
        </div>
        <div className='homepage-workflow-strip__steps'>
          {HOMEPAGE_LAUNCH_COPY.workflow.steps.map((step, index) => (
            <HomepageWorkflowStep index={index} key={step.title} step={step} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HomepageProfileProofBand() {
  return (
    <div
      id='artist-profiles'
      className='homepage-profile-proof-band'
      data-testid='homepage-profile-proof-band'
    >
      <ArtistProfileSpecWall
        specWall={{
          headline: HOMEPAGE_LAUNCH_COPY.profileProof.headline,
          subhead:
            'Conversion details, routing, capture, and analytics stay attached to the artist profile.',
        }}
        tiles={ARTIST_PROFILE_SPEC_TILES}
      />
      <div className='homepage-profile-proof-band__cta'>
        <HomepageTrackedLink
          href={APP_ROUTES.ARTIST_PROFILES}
          className='homepage-story-link focus-ring-themed'
          eventName='homepage_profile_cta_clicked'
          eventProperties={{ cta: 'explore_artist_profiles' }}
        >
          Explore Artist Profiles
          <span aria-hidden='true'>→</span>
        </HomepageTrackedLink>
      </div>
    </div>
  );
}

function HomepageFaq() {
  return (
    <div id='faq' className='homepage-faq-section' data-testid='homepage-faq'>
      <FaqSection
        items={HOMEPAGE_LAUNCH_COPY.faq}
        heading='Questions Artists Ask Before Launch'
        headingClassName='homepage-story-heading'
        className='mx-auto w-full max-w-[760px] px-[var(--homepage-page-gutter)] py-[var(--homepage-section-space)]'
        analyticsEventName='homepage_faq_opened'
        analyticsProperties={{ source: 'homepage' }}
      />
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
              <p className='homepage-hero-eyebrow text-center'>
                {HERO_COPY.eyebrow}
              </p>
              <h1
                id='home-hero-heading'
                className='homepage-hero-headline self-center text-center text-white'
              >
                {HERO_COPY.headline}
              </h1>
              <p className='homepage-hero-subhead self-center text-center text-white/68'>
                {HERO_COPY.subhead}
              </p>
              <HomepageHeroActions />
            </div>
            <HomepageHeroMockupCarousel />
          </div>
        </div>
      </section>
      <div className='homepage-trust-section'>
        <HomeTrustSection
          label='Trusted by artists on'
          presentation='inline-strip'
        />
      </div>
      <div className='homepage-story-stack'>
        <HomepageProductDepthBand />
        <HomepageWorkflowStrip />
        <FridayRhythmSection />
        <HomepageProfileProofBand />
        {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? <HomeBentoPairs /> : null}
        {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? (
          <HomeLoopDiagramSection />
        ) : null}
        {FEATURE_FLAGS.SHOW_HOME_REFRESH_2026 ? <HomeStatQuoteSection /> : null}
        {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_PRICING ? <HomepageV2Pricing /> : null}
        <HomepageFaq />
        {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_FINAL_CTA ? (
          <HomepageV2FinalCta />
        ) : null}
      </div>
    </HomePageShell>
  );
}

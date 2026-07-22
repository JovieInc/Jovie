import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { DemoPublicProfileSurface } from '@/components/features/demo/DemoPublicProfileSurface';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { MarketingContainer, MarketingPageShell } from '@/components/marketing';
import { ArtistProfileModeSwitcher } from '@/components/marketing/artist-profile';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { ArtistProfileSectionHeader } from '@/components/marketing/artist-profile/ArtistProfileSectionHeader';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile/ArtistProfileSpecWall';
import {
  HomepageStoryHeader,
  HomepageV2FinalCta,
  HomepageV2Pricing,
} from '@/components/marketing/homepage-v2/HomepageV2Ctas';
import { MarketingScreenshot } from '@/components/marketing/MarketingScreenshot';
import {
  ArtistNotificationFloatingCardView,
  ArtistProfileCaptureVisual,
  ArtistProfileReactivationVisual,
} from '@/components/marketing/MarketingStoryPrimitives';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { HOMEPAGE_FRONT_DOOR_CTA } from '@/data/homepageLaunchCopy';
import {
  HOMEPAGE_V2_COPY,
  HOMEPAGE_V2_POWER_TILES,
} from '@/data/homepageV2Copy';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

import './HomepageV2Route.css';

export { HomepageV2FinalCta, HomepageV2Pricing } from './HomepageV2Ctas';

export function HomepageV2Route() {
  return (
    <MarketingPageShell>
      <HomepageV2Hero />
      <HomepageV2BelowHero />
    </MarketingPageShell>
  );
}

export function HomepageV2BelowHero() {
  return (
    <>
      <HomeTrustSection />
      <div aria-hidden='true' className='section-gradient-divider' />
      <HomepageV2SystemOverview />
      <HomepageV2Spotlight />
      <HomepageV2CaptureReactivate />
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_POWER_GRID ? (
        <HomepageV2PowerGrid />
      ) : null}
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_SOCIAL_PROOF ? (
        <HomepageV2SocialProof />
      ) : null}
      <HomepageV2Pricing />
      <HomepageV2FinalCta />
    </>
  );
}

function HomepageV2Hero() {
  const floatingCards = ARTIST_NOTIFICATIONS_COPY.hero.floatingCards.slice(
    0,
    3
  );

  return (
    <section
      data-testid='homepage-v2-shell'
      className='relative overflow-hidden pb-16 pt-23 sm:pb-20 md:pt-25 lg:pb-24'
      aria-labelledby='homepage-v2-hero-heading'
    >
      <div
        aria-hidden='true'
        className='homepage-v2-hero__backdrop pointer-events-none absolute inset-0'
      />
      <div className='hero-glow homepage-v2-hero__glow pointer-events-none absolute inset-x-0 top-0' />

      <MarketingContainer width='landing' className='relative'>
        <div className='grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center'>
          <div className='homepage-v2-hero__copy'>
            {/* ui-casing-allow: marketing display headline */}
            <h1
              id='homepage-v2-hero-heading'
              data-testid='homepage-v2-hero'
              className='homepage-v2-hero__headline text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl lg:text-6xl'
            >
              {HOMEPAGE_V2_COPY.hero.headline}
            </h1>
            <p className='homepage-v2-hero__sub mt-5 text-lg leading-relaxed text-secondary-token'>
              {HOMEPAGE_V2_COPY.hero.subhead}
            </p>

            <div className='mt-7 flex flex-wrap items-center gap-3'>
              <Link
                href={HOMEPAGE_FRONT_DOOR_CTA.primary.href}
                data-testid='homepage-v2-hero-primary-cta'
                className='public-action-primary'
              >
                {HOMEPAGE_V2_COPY.hero.primaryCtaLabel}
              </Link>
              <Link
                href={APP_ROUTES.ARTIST_PROFILES}
                className='public-action-secondary'
              >
                {HOMEPAGE_V2_COPY.hero.secondaryCtaLabel}
              </Link>
            </div>

            <p className='mt-5 text-app font-medium text-tertiary-token'>
              {HOMEPAGE_V2_COPY.hero.microproof}
            </p>
          </div>

          <div className='homepage-v2-hero__visual relative'>
            <div
              aria-hidden='true'
              className='homepage-v2-hero__glow-blob pointer-events-none absolute inset-x-16 top-16 h-48 blur-3xl'
            />

            <div className='homepage-v2-hero__phone absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2'>
              <div className='homepage-v2-hero__phone-float'>
                <ArtistProfilePhoneFrame>
                  <div className='relative h-full w-full overflow-hidden bg-(--color-bg-base)'>
                    <div className='homepage-v2-hero__demo-scale pointer-events-none absolute left-0 top-0'>
                      <DemoPublicProfileSurface />
                    </div>
                  </div>
                </ArtistProfilePhoneFrame>
              </div>
            </div>

            <div className='homepage-v2-hero__shot homepage-v2-hero__shot--a absolute left-0 top-0 z-10'>
              <MarketingScreenshot
                scenarioId='dashboard-releases-sidebar-desktop'
                altOverride='Release page workspace with launch routing and destination controls'
                title='Release surfaces'
                chrome='minimal'
                className='homepage-v2-hero__shot-a-frame'
              />
            </div>

            <div className='homepage-v2-hero__shot homepage-v2-hero__shot--b absolute bottom-[9%] left-[4%] z-10'>
              <MarketingScreenshot
                scenarioId='artist-spec-geo-insights-desktop'
                altOverride='Audience insights showing top cities and engagement signals'
                title='Audience insight'
                chrome='minimal'
                className='rounded-xl'
              />
            </div>

            <div className='homepage-v2-hero__shot homepage-v2-hero__shot--c absolute right-0 top-[8%] z-10'>
              <MarketingScreenshot
                scenarioId='artist-spec-tracked-links-desktop'
                altOverride='Tracked link share menu with campaign routing controls'
                title='Share and route'
                chrome='minimal'
                className='rounded-xl'
              />
            </div>

            <div className='homepage-v2-hero__card--a absolute left-[2%] top-[8%] z-30 hidden lg:block'>
              <ArtistNotificationFloatingCardView card={floatingCards[0]} />
            </div>
            <div className='homepage-v2-hero__card--b absolute right-[4%] top-[12%] z-30 hidden lg:block'>
              <ArtistNotificationFloatingCardView card={floatingCards[1]} />
            </div>
            <div className='homepage-v2-hero__card--c absolute right-[9%] top-[44%] z-30 hidden lg:block'>
              <ArtistNotificationFloatingCardView card={floatingCards[2]} />
            </div>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

export function HomepageV2SystemOverview() {
  return (
    <section
      data-testid='homepage-v2-system-overview'
      className='homepage-story-section'
    >
      <MarketingContainer width='page'>
        <HomepageStoryHeader
          align='center'
          headline={HOMEPAGE_V2_COPY.systemOverview.headline}
          body={HOMEPAGE_V2_COPY.systemOverview.subhead}
          className='max-w-2xl'
          bodyClassName='max-w-lg'
        />

        <div className='homepage-overview-grid'>
          {HOMEPAGE_V2_COPY.systemOverview.cards.map(card => (
            <article key={card.title} className='homepage-overview-item'>
              <p className='homepage-overview-title'>{card.title}</p>
              <p className='homepage-overview-body'>{card.body}</p>
              {card.href ? (
                <Link href={card.href} className='homepage-story-link mt-5'>
                  {card.ctaLabel}
                  <ArrowRight className='h-3.5 w-3.5' strokeWidth={1.9} />
                </Link>
              ) : null}
              {!card.href && card.status ? (
                <p
                  data-testid='homepage-v2-release-pages-preview'
                  className='mt-5 inline-flex rounded-full border border-subtle px-3 py-1.5 text-xs font-medium text-tertiary-token'
                >
                  {card.status}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}

export function HomepageV2Spotlight() {
  return (
    <section
      data-testid='homepage-v2-spotlight'
      className='homepage-story-section relative overflow-hidden'
    >
      <MarketingContainer width='page'>
        <div className='mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(16rem,0.36fr)_minmax(0,0.64fr)] lg:items-center xl:gap-16'>
          <div className='homepage-v2-spotlight__copy lg:self-center'>
            <div className='homepage-v2-spotlight__copy'>
              <h2 className='homepage-story-heading homepage-v2-spotlight__heading'>
                <span className='block'>One Link.</span>
                <span className='block whitespace-nowrap'>Always In Sync.</span>
              </h2>
              <p className='homepage-story-body max-w-xs'>
                {HOMEPAGE_V2_COPY.spotlight.body}
              </p>
            </div>
          </div>

          <div className='homepage-spotlight-stage homepage-v2-spotlight-stage px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12'>
            <div className='homepage-v2-spotlight-rail'>
              <ArtistProfileModeSwitcher
                adaptive={ARTIST_PROFILE_COPY.adaptive}
                phoneCaption={ARTIST_PROFILE_COPY.hero.phoneCaption}
                phoneSubcaption={ARTIST_PROFILE_COPY.hero.phoneSubcaption}
                showIntroHeading={false}
              />
            </div>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

export function HomepageV2CaptureReactivate() {
  return (
    <section
      data-testid='homepage-v2-capture-reactivate'
      className='homepage-story-section relative overflow-hidden'
    >
      <MarketingContainer width='page'>
        <HomepageStoryHeader
          align='center'
          headline={HOMEPAGE_V2_COPY.captureReactivation.headline}
          body={HOMEPAGE_V2_COPY.captureReactivation.body}
          className='max-w-2xl'
          headlineClassName='whitespace-pre-line'
          bodyClassName='homepage-v2-capture__body mx-auto'
        />

        <div className='homepage-split-surface mt-10 grid gap-0 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]'>
          <article className='homepage-split-column'>
            <p className='homepage-split-label'>
              {HOMEPAGE_V2_COPY.captureReactivation.captureLabel}
            </p>
            <p className='homepage-split-copy'>
              {HOMEPAGE_V2_COPY.captureReactivation.captureBody}
            </p>
            <ArtistProfileCaptureVisual
              capture={ARTIST_PROFILE_COPY.capture}
              className='mt-8'
            />
          </article>

          <article className='homepage-split-column'>
            <p className='homepage-split-label'>
              {HOMEPAGE_V2_COPY.captureReactivation.reactivateLabel}
            </p>
            <p className='homepage-split-copy'>
              {HOMEPAGE_V2_COPY.captureReactivation.reactivateBody}
            </p>
            <ArtistProfileReactivationVisual
              className='mt-8 lg:grid-cols-1'
              notification={ARTIST_PROFILE_COPY.capture.notification}
              reactivation={ARTIST_PROFILE_COPY.reactivation}
            />
          </article>
        </div>
      </MarketingContainer>
    </section>
  );
}

export function HomepageV2PowerGrid() {
  return (
    <div data-testid='homepage-v2-power-grid'>
      <ArtistProfileSpecWall
        specWall={HOMEPAGE_V2_COPY.powerGrid}
        tiles={HOMEPAGE_V2_POWER_TILES}
      />
    </div>
  );
}

function HomepageV2SocialProof() {
  return (
    <section
      data-testid='homepage-v2-social-proof'
      className='section-spacing-linear-sm'
    >
      <MarketingContainer width='page'>
        <ArtistProfileSectionHeader
          align='center'
          headline={HOMEPAGE_V2_COPY.socialProof.headline}
          body={HOMEPAGE_V2_COPY.socialProof.body}
          className='homepage-v2-proof__header'
          bodyClassName='mx-auto max-w-md'
        />

        <div className='mt-8 grid gap-4 lg:grid-cols-3'>
          {ARTIST_PROFILE_SOCIAL_PROOF.profileCards.map(card => (
            <article
              key={card.id}
              className='overflow-hidden rounded-2xl bg-surface-1'
            >
              <div className='relative aspect-[4/3]'>
                <Image
                  src={card.src}
                  alt={`${card.name} profile image`}
                  fill
                  sizes='(max-width: 1024px) 100vw, 360px'
                  className='object-cover'
                />
                <div className='homepage-v2-proof__scrim absolute inset-0' />
                <div className='absolute inset-x-0 bottom-0 z-10 p-5'>
                  <p className='font-mono text-xs text-tertiary-token'>
                    jov.ie/{card.handle}
                  </p>
                  <p className='mt-2 text-xl font-medium tracking-tight text-primary-token'>
                    {card.name}
                  </p>
                  <p className='homepage-v2-proof__line mt-2 text-app text-secondary-token'>
                    {card.supportingLine}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}

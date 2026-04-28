import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { DemoPublicProfileSurface } from '@/components/features/demo/DemoPublicProfileSurface';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { ProductScreenshot } from '@/components/features/home/ProductScreenshot';
import { MarketingContainer, MarketingPageShell } from '@/components/marketing';
import { ArtistProfileModeSwitcher } from '@/components/marketing/artist-profile';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { ArtistProfileSectionHeader } from '@/components/marketing/artist-profile/ArtistProfileSectionHeader';
import { ArtistProfileSpecWall } from '@/components/marketing/artist-profile/ArtistProfileSpecWall';
import {
  ArtistNotificationFloatingCardView,
  ArtistProfileCaptureVisual,
  ArtistProfileReactivationVisual,
} from '@/components/marketing/MarketingStoryPrimitives';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  HOMEPAGE_V2_COPY,
  HOMEPAGE_V2_POWER_TILES,
} from '@/data/homepageV2Copy';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';
import { cn } from '@/lib/utils';

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
      <HomepageV2PowerGrid />
      {FEATURE_FLAGS.SHOW_HOMEPAGE_V2_SOCIAL_PROOF ? (
        <HomepageV2SocialProof />
      ) : null}
      <HomepageV2Pricing />
      <HomepageV2FinalCta />
    </>
  );
}

function HomepageStoryHeader({
  headline,
  body,
  align = 'center',
  className,
  headlineClassName,
  bodyClassName,
  headlineTestId,
}: Readonly<{
  headline: string;
  body?: string;
  align?: 'center' | 'left';
  className?: string;
  headlineClassName?: string;
  bodyClassName?: string;
  headlineTestId?: string;
}>) {
  const centered = align === 'center';

  return (
    <div
      className={cn(
        centered ? 'mx-auto text-center' : 'max-w-[38rem]',
        className
      )}
    >
      <h2
        className={cn('homepage-story-heading', headlineClassName)}
        data-testid={headlineTestId}
      >
        {headline}
      </h2>
      {body ? (
        <p
          className={cn(
            'homepage-story-body',
            centered && 'mx-auto',
            bodyClassName
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
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
      className='relative overflow-hidden pb-16 pt-[5.75rem] sm:pb-20 md:pt-[6.25rem] lg:pb-24'
      aria-labelledby='homepage-v2-hero-heading'
    >
      <style>{`
        @keyframes homepage-v2-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -10px, 0); }
        }

        @keyframes homepage-v2-drift {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--drift-rotate, 0deg)); }
          50% { transform: translate3d(0, -6px, 0) rotate(var(--drift-rotate, 0deg)); }
        }
      `}</style>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[42rem]' />

      <MarketingContainer width='landing' className='relative'>
        <div className='grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center'>
          <div className='max-w-[34rem]'>
            <h1
              id='homepage-v2-hero-heading'
              data-testid='homepage-v2-hero'
              className='marketing-h1-linear max-w-[10ch] text-primary-token'
            >
              {HOMEPAGE_V2_COPY.hero.headline}
            </h1>
            <p className='marketing-lead-linear mt-5 max-w-[31rem] text-secondary-token'>
              {HOMEPAGE_V2_COPY.hero.subhead}
            </p>

            <div className='mt-7 flex flex-wrap items-center gap-3'>
              <Link
                href={APP_ROUTES.SIGNUP}
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

            <p className='mt-5 text-[13px] font-medium tracking-[-0.01em] text-tertiary-token'>
              {HOMEPAGE_V2_COPY.hero.microproof}
            </p>
          </div>

          <div className='relative min-h-[32rem] sm:min-h-[37rem] lg:min-h-[42rem]'>
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-16 top-16 h-48 blur-3xl'
              style={{
                background:
                  'radial-gradient(circle at center, rgba(132,146,255,0.18), transparent 68%)',
              }}
            />

            <div className='absolute left-1/2 top-1/2 z-20 w-[14.75rem] -translate-x-1/2 -translate-y-1/2 sm:w-[16.5rem]'>
              <div
                className='drop-shadow-[0_38px_120px_rgba(0,0,0,0.58)]'
                style={{
                  animation: 'homepage-v2-float 8s ease-in-out infinite',
                }}
              >
                <ArtistProfilePhoneFrame>
                  <div className='relative h-full w-full overflow-hidden bg-[#07080c]'>
                    <div
                      className='pointer-events-none absolute left-0 top-0 origin-top-left scale-[0.41] sm:scale-[0.455]'
                      style={{
                        width: '244%',
                        minHeight: '244%',
                      }}
                    >
                      <DemoPublicProfileSurface />
                    </div>
                  </div>
                </ArtistProfilePhoneFrame>
              </div>
            </div>

            <div
              className='absolute left-0 top-0 z-10 w-[52%]'
              style={
                {
                  '--drift-rotate': '-3deg',
                  animation: 'homepage-v2-drift 10s ease-in-out infinite',
                } as CSSProperties
              }
            >
              <ProductScreenshot
                src='/product-screenshots/releases-dashboard-sidebar.png'
                alt='Release page workspace with launch routing and destination controls'
                width={2880}
                height={1800}
                title='Release surfaces'
                chrome='minimal'
                skipCheck
                className='rounded-[1.15rem]'
              />
            </div>

            <div
              className='absolute bottom-[9%] left-[4%] z-10 w-[44%]'
              style={
                {
                  '--drift-rotate': '2deg',
                  animation: 'homepage-v2-drift 11s ease-in-out infinite',
                } as CSSProperties
              }
            >
              <ProductScreenshot
                src='/product-screenshots/artist-spec-geo-insights-desktop.png'
                alt='Audience insights showing top cities and engagement signals'
                width={970}
                height={518}
                title='Audience insight'
                chrome='minimal'
                skipCheck
                className='rounded-[1rem]'
              />
            </div>

            <div
              className='absolute right-0 top-[8%] z-10 w-[45%]'
              style={
                {
                  '--drift-rotate': '4deg',
                  animation: 'homepage-v2-drift 12s ease-in-out infinite',
                } as CSSProperties
              }
            >
              <ProductScreenshot
                src='/product-screenshots/artist-spec-tracked-links-desktop.png'
                alt='Tracked link share menu with campaign routing controls'
                width={920}
                height={442}
                title='Share and route'
                chrome='minimal'
                skipCheck
                className='rounded-[1rem]'
              />
            </div>

            <div className='absolute left-[2%] top-[8%] z-30 hidden w-[15rem] lg:block'>
              <ArtistNotificationFloatingCardView card={floatingCards[0]} />
            </div>
            <div className='absolute right-[4%] top-[12%] z-30 hidden w-[15.75rem] lg:block'>
              <ArtistNotificationFloatingCardView card={floatingCards[1]} />
            </div>
            <div className='absolute right-[9%] top-[44%] z-30 hidden w-[16rem] lg:block'>
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
          className='max-w-[42rem]'
          bodyClassName='max-w-[32rem]'
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
                  className='mt-5 inline-flex rounded-full border border-white/[0.08] px-3 py-1.5 text-[12px] font-medium text-white/46'
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
      <style>{`
        .homepage-v2-spotlight-stage {
          position: relative;
        }

        .homepage-v2-spotlight-rail {
          position: relative;
        }

        @media (min-width: 1024px) and (min-height: 821px) {
          .homepage-v2-spotlight-stage {
            min-height: clamp(38rem, 62vw, 50rem);
          }

          .homepage-v2-spotlight-rail {
            position: sticky;
            top: clamp(
              calc(var(--linear-header-height) + 1.25rem),
              11svh,
              calc(var(--linear-header-height) + 4rem)
            );
          }
        }
      `}</style>
      <MarketingContainer width='page'>
        <div className='mx-auto grid max-w-[72rem] gap-10 lg:grid-cols-[minmax(16rem,0.36fr)_minmax(0,0.64fr)] lg:items-center xl:gap-16'>
          <div className='max-w-[23rem] lg:self-center'>
            <div className='max-w-[23rem]'>
              <h2 className='homepage-story-heading max-w-[11ch]'>
                <span className='block'>One Link.</span>
                <span className='block whitespace-nowrap'>Always In Sync.</span>
              </h2>
              <p className='homepage-story-body max-w-[20rem]'>
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
          className='max-w-[42rem]'
          headlineClassName='whitespace-pre-line'
          bodyClassName='mx-auto max-w-[29rem]'
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
          className='max-w-[40rem]'
          bodyClassName='mx-auto max-w-[28rem]'
        />

        <div className='mt-8 grid gap-4 lg:grid-cols-3'>
          {ARTIST_PROFILE_SOCIAL_PROOF.profileCards.map(card => (
            <article
              key={card.id}
              className='overflow-hidden rounded-[1.25rem] bg-white/[0.03]'
            >
              <div className='relative aspect-[4/3]'>
                <Image
                  src={card.src}
                  alt={`${card.name} profile image`}
                  fill
                  sizes='(max-width: 1024px) 100vw, 360px'
                  className='object-cover'
                />
                <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,12,0.05),rgba(8,9,12,0.8)_100%)]' />
                <div className='absolute inset-x-0 bottom-0 z-10 p-5'>
                  <p className='font-mono text-[12px] tracking-[-0.02em] text-white/68'>
                    jov.ie/{card.handle}
                  </p>
                  <p className='mt-2 text-[20px] font-medium tracking-[-0.02em] text-white'>
                    {card.name}
                  </p>
                  <p className='mt-2 text-[13px] leading-[1.6] text-white/72'>
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

export function HomepageV2Pricing() {
  return (
    <section
      data-testid='homepage-v2-pricing'
      className='homepage-story-section'
    >
      <MarketingContainer width='page'>
        <HomepageStoryHeader
          align='center'
          headline={HOMEPAGE_V2_COPY.pricing.headline}
          className='max-w-[40rem]'
          headlineClassName='max-w-[10ch]'
        />

        <div className='homepage-pricing-grid'>
          <PricingCard
            body='One plan. 14-day free trial. Then the workspace keeps running.'
            ctaHref={`${APP_ROUTES.SIGNUP}?plan=pro`}
            ctaLabel='Start 14-Day Free Trial'
            featured
            price={`$${ENTITLEMENT_REGISTRY.pro.marketing.price?.monthly ?? 0}/mo`}
            testId='homepage-v2-pricing-pro'
            title={ENTITLEMENT_REGISTRY.pro.marketing.displayName}
          />
        </div>
      </MarketingContainer>
    </section>
  );
}

const HOMEPAGE_FINAL_CTA_ARCS = [
  { radiusX: 70, radiusY: 245 },
  { radiusX: 130, radiusY: 235 },
  { radiusX: 195, radiusY: 225 },
  { radiusX: 265, radiusY: 215 },
  { radiusX: 340, radiusY: 205 },
  { radiusX: 420, radiusY: 198 },
  { radiusX: 505, radiusY: 192 },
  { radiusX: 590, radiusY: 188 },
] as const;

export function HomepageV2FinalCta() {
  return (
    <section
      data-testid='homepage-v2-final-cta'
      className='homepage-story-final-cta relative isolate overflow-hidden bg-black'
    >
      <div
        aria-hidden='true'
        className='homepage-final-cta-glow pointer-events-none absolute inset-0 z-[1]'
      />
      <svg
        className='homepage-final-cta-rays pointer-events-none absolute inset-x-0 bottom-0 z-[2] w-full'
        viewBox='0 0 1200 540'
        preserveAspectRatio='xMidYMax slice'
        aria-hidden='true'
      >
        <defs>
          <linearGradient
            id='homepage-final-cta-ray-primary'
            x1='0'
            x2='0'
            y1='0'
            y2='1'
          >
            <stop offset='0%' stopColor='#0070f3' stopOpacity='0' />
            <stop offset='55%' stopColor='#0070f3' stopOpacity='0.35' />
            <stop offset='92%' stopColor='#ffffff' stopOpacity='0.95' />
            <stop offset='100%' stopColor='#ffffff' stopOpacity='0.6' />
          </linearGradient>
          <linearGradient
            id='homepage-final-cta-ray-secondary'
            x1='0'
            x2='0'
            y1='0'
            y2='1'
          >
            <stop offset='0%' stopColor='#0070f3' stopOpacity='0' />
            <stop offset='70%' stopColor='#0070f3' stopOpacity='0.55' />
            <stop offset='100%' stopColor='#dbeaff' stopOpacity='0.85' />
          </linearGradient>
        </defs>
        <ellipse
          cx='600'
          cy='600'
          rx='22'
          ry='260'
          stroke='url(#homepage-final-cta-ray-secondary)'
          strokeWidth='2.2'
          fill='none'
        />
        {HOMEPAGE_FINAL_CTA_ARCS.map((arc, index) => (
          <ellipse
            key={`${arc.radiusX}-${arc.radiusY}`}
            cx='600'
            cy='600'
            rx={arc.radiusX}
            ry={arc.radiusY}
            stroke={
              index % 2 === 0
                ? 'url(#homepage-final-cta-ray-primary)'
                : 'url(#homepage-final-cta-ray-secondary)'
            }
            strokeWidth={index < 4 ? 1.5 : 1.2}
            fill='none'
            opacity={1 - index * 0.05}
          />
        ))}
        <rect
          x='0'
          y='538'
          width='1200'
          height='2'
          fill='#0070f3'
          opacity='0.3'
        />
      </svg>
      <MarketingContainer width='page' className='relative z-10'>
        <div className='homepage-final-cta-copy mx-auto'>
          <h2
            data-testid='homepage-v2-final-cta-heading'
            className='text-balance text-[clamp(2.1rem,3.9vw,3.25rem)] font-semibold leading-[0.98] tracking-[-0.052em] text-white'
          >
            Start using Jovie
            <br />
            today for free.
          </h2>
          <Link
            href={APP_ROUTES.SIGNUP}
            className='homepage-final-cta-action inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.12] px-4 text-[12px] font-medium tracking-[-0.01em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition-colors hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
            data-testid='homepage-v2-final-cta-primary'
          >
            {HOMEPAGE_V2_COPY.finalCta.primaryCtaLabel}
          </Link>
        </div>
      </MarketingContainer>
    </section>
  );
}

function PricingCard({
  title,
  body,
  price,
  ctaLabel,
  ctaHref,
  featured = false,
  testId,
}: Readonly<{
  title: string;
  body: string;
  price: string;
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
  testId: string;
}>) {
  return (
    <article
      data-testid={testId}
      className={cn(
        'homepage-pricing-card',
        featured && 'homepage-pricing-card--featured'
      )}
    >
      <p className='text-[1.1rem] font-semibold tracking-[-0.03em] text-primary-token'>
        {title}
      </p>
      <p className='mt-2 text-[14px] leading-[1.6] text-secondary-token'>
        {body}
      </p>
      <p className='mt-auto pt-8 text-[2.4rem] font-semibold tracking-[-0.07em] text-primary-token'>
        {price}
      </p>
      <Link href={ctaHref} className='public-action-primary mt-5 inline-flex'>
        {ctaLabel}
      </Link>
    </article>
  );
}

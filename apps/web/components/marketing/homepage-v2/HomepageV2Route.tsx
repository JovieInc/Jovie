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
      <HomepageV2FooterLinks />
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

function HomepageV2SystemOverview() {
  return (
    <section
      data-testid='homepage-v2-system-overview'
      className='section-spacing-linear-sm'
    >
      <MarketingContainer width='page'>
        <ArtistProfileSectionHeader
          align='left'
          headline={HOMEPAGE_V2_COPY.systemOverview.headline}
          body={HOMEPAGE_V2_COPY.systemOverview.subhead}
          className='max-w-[44rem]'
          headlineClassName='text-[clamp(2.8rem,5vw,4.4rem)]'
          bodyClassName='max-w-[36rem]'
        />

        <div className='mt-8 grid gap-4 lg:grid-cols-3'>
          {HOMEPAGE_V2_COPY.systemOverview.cards.map(card => (
            <article
              key={card.title}
              className='rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-5'
            >
              <p className='text-[1.05rem] font-semibold tracking-[-0.03em] text-primary-token'>
                {card.title}
              </p>
              <p className='mt-3 text-[14px] leading-[1.65] text-secondary-token'>
                {card.body}
              </p>
              {card.href ? (
                <Link
                  href={card.href}
                  className='mt-5 inline-flex items-center gap-2 text-[13px] font-medium tracking-[-0.01em] text-primary-token'
                >
                  {card.ctaLabel}
                  <ArrowRight className='h-3.5 w-3.5' strokeWidth={1.9} />
                </Link>
              ) : (
                <p
                  data-testid='homepage-v2-release-pages-preview'
                  className='mt-5 inline-flex rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-medium text-tertiary-token'
                >
                  {card.status}
                </p>
              )}
            </article>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}

function HomepageV2Spotlight() {
  return (
    <section
      data-testid='homepage-v2-spotlight'
      className='section-spacing-linear-sm relative overflow-hidden'
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
            min-height: calc(100svh + 12rem);
          }

          .homepage-v2-spotlight-rail {
            position: sticky;
            top: clamp(
              calc(var(--linear-header-height) + 1.5rem),
              15svh,
              calc(var(--linear-header-height) + 6rem)
            );
          }
        }
      `}</style>
      <MarketingContainer width='page'>
        <div className='grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start'>
          <div className='max-w-[32rem] lg:pt-10'>
            <ArtistProfileSectionHeader
              align='left'
              headline={HOMEPAGE_V2_COPY.spotlight.headline}
              body={HOMEPAGE_V2_COPY.spotlight.body}
              className='max-w-[34rem]'
              headlineClassName='text-[clamp(2.9rem,5vw,4.5rem)]'
              bodyClassName='max-w-[28rem]'
            />
            <Link
              href={HOMEPAGE_V2_COPY.spotlight.href}
              className='mt-6 inline-flex items-center gap-2 text-[14px] font-medium tracking-[-0.01em] text-primary-token'
            >
              {HOMEPAGE_V2_COPY.spotlight.ctaLabel}
              <ArrowRight className='h-3.5 w-3.5' strokeWidth={1.9} />
            </Link>
          </div>

          <div className='homepage-v2-spotlight-stage'>
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

function HomepageV2CaptureReactivate() {
  return (
    <section
      data-testid='homepage-v2-capture-reactivate'
      className='section-spacing-linear-sm relative overflow-hidden bg-white/[0.012]'
    >
      <MarketingContainer width='page'>
        <ArtistProfileSectionHeader
          align='center'
          headline={HOMEPAGE_V2_COPY.captureReactivation.headline}
          body={HOMEPAGE_V2_COPY.captureReactivation.body}
          className='max-w-[48rem]'
          bodyClassName='mx-auto max-w-[38rem]'
        />

        <div className='mt-12 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]'>
          <article className='rounded-[1.6rem] border border-white/10 bg-black/35 p-5 sm:p-6'>
            <p className='text-[12px] font-medium tracking-[0.12em] text-tertiary-token'>
              {HOMEPAGE_V2_COPY.captureReactivation.captureLabel}
            </p>
            <p className='mt-3 max-w-[30rem] text-[15px] leading-[1.65] text-secondary-token'>
              {HOMEPAGE_V2_COPY.captureReactivation.captureBody}
            </p>
            <ArtistProfileCaptureVisual
              capture={ARTIST_PROFILE_COPY.capture}
              className='mt-8'
            />
          </article>

          <article className='rounded-[1.6rem] border border-white/10 bg-black/35 p-5 sm:p-6'>
            <p className='text-[12px] font-medium tracking-[0.12em] text-tertiary-token'>
              {HOMEPAGE_V2_COPY.captureReactivation.reactivateLabel}
            </p>
            <p className='mt-3 max-w-[34rem] text-[15px] leading-[1.65] text-secondary-token'>
              {HOMEPAGE_V2_COPY.captureReactivation.reactivateBody}
            </p>
            <ArtistProfileReactivationVisual
              className='mt-8 lg:grid-cols-1'
              notification={ARTIST_PROFILE_COPY.capture.notification}
              reactivation={ARTIST_PROFILE_COPY.reactivation}
            />
          </article>
        </div>

        <div className='mt-8 flex justify-center'>
          <Link
            href={HOMEPAGE_V2_COPY.captureReactivation.href}
            className='public-action-secondary'
          >
            {HOMEPAGE_V2_COPY.captureReactivation.ctaLabel}
          </Link>
        </div>
      </MarketingContainer>
    </section>
  );
}

function HomepageV2PowerGrid() {
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

function HomepageV2Pricing() {
  return (
    <section
      data-testid='homepage-v2-pricing'
      className='section-spacing-linear-sm'
    >
      <MarketingContainer width='page'>
        <ArtistProfileSectionHeader
          align='center'
          headline={HOMEPAGE_V2_COPY.pricing.headline}
          body={HOMEPAGE_V2_COPY.pricing.body}
          className='max-w-[42rem]'
          bodyClassName='mx-auto max-w-[32rem]'
        />

        <div className='mt-8 grid gap-4 md:grid-cols-2'>
          <PricingCard
            body={ENTITLEMENT_REGISTRY.free.marketing.tagline}
            ctaHref={`${APP_ROUTES.SIGNUP}?plan=free`}
            ctaLabel='Start Free'
            price='$0'
            testId='homepage-v2-pricing-free'
            title={ENTITLEMENT_REGISTRY.free.marketing.displayName}
          />
          <PricingCard
            body={ENTITLEMENT_REGISTRY.pro.marketing.tagline}
            ctaHref={`${APP_ROUTES.SIGNUP}?plan=pro`}
            ctaLabel='Start Pro Trial'
            featured
            price={`$${ENTITLEMENT_REGISTRY.pro.marketing.price?.monthly ?? 0}/mo`}
            testId='homepage-v2-pricing-pro'
            title={ENTITLEMENT_REGISTRY.pro.marketing.displayName}
          />
        </div>

        <div className='mt-6 text-center'>
          <p className='text-[13px] font-medium tracking-[-0.01em] text-tertiary-token'>
            {HOMEPAGE_V2_COPY.pricing.supportLine}
          </p>
          <Link
            href={HOMEPAGE_V2_COPY.pricing.href}
            className='mt-4 inline-flex items-center gap-2 text-[14px] font-medium tracking-[-0.01em] text-primary-token'
          >
            {HOMEPAGE_V2_COPY.pricing.ctaLabel}
            <ArrowRight className='h-3.5 w-3.5' strokeWidth={1.9} />
          </Link>
        </div>
      </MarketingContainer>
    </section>
  );
}

function HomepageV2FinalCta() {
  return (
    <section className='section-glow section-glow-cta relative overflow-hidden border-t border-white/8 py-20 sm:py-24 lg:py-28'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/3 h-[24rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 blur-3xl'
        style={{
          background:
            'radial-gradient(ellipse at center, oklch(18% 0.04 270 / 0.34), transparent 68%)',
        }}
      />
      <MarketingContainer width='page'>
        <div className='relative mx-auto max-w-[40rem] text-center'>
          <h2
            className='marketing-h2-linear text-primary-token'
            data-testid='homepage-v2-final-cta-heading'
          >
            {HOMEPAGE_V2_COPY.finalCta.headline}
          </h2>
          <p className='mx-auto mt-4 max-w-[32rem] text-[15px] leading-[1.65] text-secondary-token sm:text-[16px]'>
            {HOMEPAGE_V2_COPY.finalCta.body}
          </p>
          <div className='mt-7 flex flex-wrap items-center justify-center gap-3'>
            <Link href={APP_ROUTES.SIGNUP} className='public-action-primary'>
              {HOMEPAGE_V2_COPY.finalCta.primaryCtaLabel}
            </Link>
            <Link href={APP_ROUTES.PRICING} className='public-action-secondary'>
              {HOMEPAGE_V2_COPY.finalCta.secondaryCtaLabel}
            </Link>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

function HomepageV2FooterLinks() {
  return (
    <section className='border-t border-white/8 py-10 sm:py-12'>
      <MarketingContainer width='page'>
        <div className='grid gap-8 sm:grid-cols-2 lg:grid-cols-4'>
          {HOMEPAGE_V2_COPY.footerColumns.map(column => (
            <div key={column.title}>
              <p className='text-[12px] font-medium tracking-[0.12em] text-tertiary-token'>
                {column.title}
              </p>
              <div className='mt-4 flex flex-col gap-3'>
                {column.links.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className='text-[14px] text-secondary-token transition-colors hover:text-primary-token'
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
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
      className={`rounded-[1.5rem] border p-6 ${
        featured
          ? 'border-white/18 bg-white/[0.04]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <p className='text-[1.1rem] font-semibold tracking-[-0.03em] text-primary-token'>
        {title}
      </p>
      <p className='mt-2 text-[14px] leading-[1.6] text-secondary-token'>
        {body}
      </p>
      <p className='mt-6 text-[2.4rem] font-semibold tracking-[-0.07em] text-primary-token'>
        {price}
      </p>
      <Link href={ctaHref} className='public-action-primary mt-6 inline-flex'>
        {ctaLabel}
      </Link>
    </article>
  );
}

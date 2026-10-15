// @coverage-via apps/web/tests/unit/home/homepage-v3-page.test.tsx
import { Button } from '@jovie/ui/atoms/button';
import Image from 'next/image';
import Link from 'next/link';
import {
  MarketingContainer,
  MarketingContentShell,
  MarketingHero,
  MarketingHeroPhoto,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { MarketingScreenshot } from '@/components/marketing/MarketingScreenshot';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import { APP_ROUTES } from '@/constants/routes';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { HOMEPAGE_YOUTUBE_MVP as copy } from '@/data/homepageYoutubeMvp';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';
import { HomepagePrimaryAction } from './HomepagePrimaryAction';

const OWNER = 'apps/web/components/homepage/HomepageYoutubeMvp.tsx';
const PROFILE = getMarketingExportImage('tim-white-profile-subscribe-mobile');

function FindArtist({ placement }: Readonly<{ placement: 'hero' | 'close' }>) {
  return (
    <HomepagePrimaryAction
      appearance='editorial'
      inputId={`homepage-${placement}-artist-search`}
      placeholder={copy.search.placeholder}
      submitLabel={copy.search.action}
      submitTestId={
        placement === 'hero'
          ? 'homepage-primary-cta'
          : 'homepage-close-primary-cta'
      }
      submitAnalytics={{
        eventName: HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED,
        properties: { ...HOMEPAGE_CERTIFIED_CONTEXT, placement },
      }}
    />
  );
}

export function HomepageYoutubeMvp() {
  return (
    <div data-homepage-variant={copy.variantIdentity}>
      <HomepageCertifiedExposure />
      <div
        className='marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden'
        data-homepage-testid='homepage-hero-shell'
      >
        <MarketingHeroPhoto
          src='/assets/generated/homepage-hero-technical-texture-v1.webp'
          width={1600}
          height={900}
        />
        <MarketingHero
          variant='centered'
          headingId='home-hero-heading'
          testId='marketing-section-hero'
          sectionVariant='centered-none'
          sectionOwner={OWNER}
        >
          <p className='text-xs font-medium text-secondary-token'>
            {copy.hero.kicker}
          </p>
          <h1
            id='home-hero-heading'
            className='mt-6 max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-tight text-primary-token sm:text-5xl lg:text-6xl'
          >
            {copy.hero.headline}
          </h1>
          <p className='mt-6 max-w-2xl text-base leading-7 text-secondary-token sm:text-lg'>
            {copy.hero.subhead}
          </p>
          <div
            className='mt-8 w-full max-w-xl'
            data-testid='homepage-editorial-hero-search'
          >
            <FindArtist placement='hero' />
          </div>
        </MarketingHero>
      </div>
      {copy.features.map(feature => (
        <section
          key={feature.id}
          id={feature.id}
          className='border-t border-subtle py-16 sm:py-20'
          aria-labelledby={`home-${feature.id}`}
          data-testid='marketing-section-feature-split'
          data-marketing-owner={OWNER}
          data-marketing-variant='editorial'
          data-marketing-occurrence={feature.id}
        >
          <MarketingContainer width='page'>
            <div className='grid items-center gap-10 md:grid-cols-2'>
              <div>
                <h2
                  id={`home-${feature.id}`}
                  className='text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'
                >
                  {feature.headline}
                </h2>
                <p className='mt-5 max-w-xl text-base leading-7 text-secondary-token'>
                  {feature.body}
                </p>
                <Button asChild variant='link' className='mt-5'>
                  <Link href={feature.href}>{feature.action}</Link>
                </Button>
              </div>
              {feature.id === 'youtube-thumbnails' && (
                <MarketingSurfaceCard
                  variant='floating'
                  glowTone='none'
                  contentClassName='p-8 sm:p-10'
                >
                  <p className='mt-4 text-2xl font-semibold text-primary-token'>
                    Preview before you publish.
                  </p>
                </MarketingSurfaceCard>
              )}
              {feature.id === 'release-launch' && (
                <MarketingScreenshot
                  scenarioId='dashboard-releases-desktop'
                  title='Release workspace'
                />
              )}
              {feature.id === 'public-profile' && (
                <div className='mx-auto max-w-72'>
                  <ArtistProfilePhoneFrame size='md'>
                    <Image
                      src={PROFILE.publicUrl}
                      alt={PROFILE.alt}
                      width={PROFILE.width}
                      height={PROFILE.height}
                      sizes='18rem'
                      className='h-auto w-full'
                    />
                  </ArtistProfilePhoneFrame>
                </div>
              )}
            </div>
          </MarketingContainer>
        </section>
      ))}
      <section
        className='border-t border-subtle py-16 sm:py-20'
        aria-labelledby='home-loop-heading'
        data-testid='marketing-section-spec-wall'
        data-marketing-owner={OWNER}
        data-marketing-variant='bento'
      >
        <MarketingContainer width='page'>
          <h2
            id='home-loop-heading'
            className='text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'
          >
            {/* ui-casing-allow: marketing display headline (DESIGN.md) */}
            From upload to the next release.
          </h2>
          <ul className='mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4'>
            {copy.surfaces.map(surface => (
              <li
                key={surface.id}
                data-capability-id={surface.id}
                className='border-t border-subtle pt-4'
              >
                <Button asChild variant='link'>
                  <Link href={surface.href}>{surface.label}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </MarketingContainer>
      </section>
      <section
        aria-labelledby='home-founder-proof-heading'
        data-testid='marketing-section-social-proof'
        data-marketing-owner={OWNER}
        data-marketing-variant='founder-credits'
      >
        <MarketingContentShell>
          <h2
            id='home-founder-proof-heading'
            className='text-xs font-medium text-primary-token'
          >
            {copy.proof.headline}
          </h2>
          <p className='mt-6 text-secondary-token'>Music: {copy.proof.music}</p>
          <p className='mt-4 text-secondary-token'>
            Digital marketing: {copy.proof.marketing}
          </p>
          <div className='mt-8 flex items-center gap-4'>
            <Image
              src={TIM_WHITE_PROFILE.avatarSrc}
              alt='Tim White'
              width={64}
              height={64}
              className='size-16 rounded-full object-cover'
            />
            <div>
              <p className='text-primary-token'>{copy.proof.attribution}</p>
              <Link
                href={APP_ROUTES.ABOUT}
                className='text-secondary-token underline underline-offset-4'
              >
                Read the story
              </Link>
            </div>
          </div>
        </MarketingContentShell>
      </section>
      <section
        aria-labelledby='home-pricing-heading'
        data-testid='marketing-section-pricing'
        data-marketing-owner={OWNER}
        data-marketing-variant='one-liner-link'
      >
        <MarketingContentShell>
          <h2
            id='home-pricing-heading'
            className='text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'
          >
            {copy.pricing.headline}
          </h2>
          <p className='mt-5 text-secondary-token'>{copy.pricing.body}</p>
          <Button asChild variant='link' className='mt-5'>
            <Link href={APP_ROUTES.PRICING}>See plans and pricing</Link>
          </Button>
        </MarketingContentShell>
      </section>
      <MarketingCtaSection
        className='border-t border-subtle py-16 sm:py-20'
        aria-labelledby='homepage-close-heading'
        data-testid='marketing-section-cta'
        data-homepage-testid='homepage-close'
        data-marketing-owner={OWNER}
        data-marketing-variant='editorial-search'
      >
        <MarketingContainer width='page'>
          <div className='mx-auto max-w-xl text-center'>
            <h2
              id='homepage-close-heading'
              className='text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'
            >
              {copy.close.headline}
            </h2>
            <div className='mt-8'>
              <FindArtist placement='close' />
            </div>
          </div>
        </MarketingContainer>
      </MarketingCtaSection>
    </div>
  );
}

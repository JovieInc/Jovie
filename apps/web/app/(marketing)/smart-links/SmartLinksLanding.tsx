import { Button } from '@jovie/ui';
import Link from 'next/link';
import { MarketingContainer, MarketingPageShell } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { resolveMarketingAuthPrefetch } from '@/data/marketing/authEntryPrefetch';
import { getSmartLinksHeroCopy } from '@/data/smartLinksHeroCopy';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { SmartLinksDemo } from './SmartLinksDemo';

const STEP_BODIES = [
  'Artwork and artist come first. Every available music app lives in one dial.',
  'Pick a service once. Stream Now follows that choice.',
  'Your choice follows the next release. You can always switch.',
] as const;

export function SmartLinksLanding() {
  const hero = getSmartLinksHeroCopy(
    isCodeFlagEnabled('MARKETING_GENERIC_CREATOR_NAV')
  );

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      {/* Static matte hero: no photo or animated field behind the copy (Tim,
          2026-10-29). One focal point: headline, one line, one primary CTA. */}
      <section
        aria-labelledby='smart-links-title'
        className='marketing-hero-dock marketing-hero-dock--inset relative py-14 sm:py-24'
        data-testid='marketing-section-hero'
        data-marketing-variant='split-screenshot-right'
        data-marketing-owner='apps/web/app/(marketing)/smart-links/SmartLinksLanding.tsx'
      >
        <MarketingContainer width='page' className='relative'>
          <div className='grid items-center gap-12 lg:grid-cols-2 lg:gap-16'>
            <div>
              <h1
                id='smart-links-title'
                className='marketing-h1-linear max-w-3xl text-balance line-clamp-2'
              >
                {hero.title}
              </h1>
              <p className='mt-6 max-w-xl text-base leading-7 text-secondary-token sm:text-lg'>
                {hero.intro}
              </p>
              <div className='mt-8 flex flex-wrap items-center gap-x-6 gap-y-3'>
                <Button asChild variant='primary' size='md'>
                  <Link
                    href={`${APP_ROUTES.SIGNUP}?source=smart-links`}
                    prefetch={resolveMarketingAuthPrefetch(APP_ROUTES.SIGNUP)}
                  >
                    Create a Smart Link
                  </Link>
                </Button>
                <Link
                  href='/tim/never-say-a-word?noredirect=1'
                  prefetch={false}
                  className='focus-ring-themed rounded-full text-sm text-secondary-token underline-offset-4 hover:text-primary-token hover:underline'
                >
                  Open the live example
                </Link>
              </div>
            </div>
            <SmartLinksDemo />
          </div>
        </MarketingContainer>
      </section>

      <section
        id='how-it-works'
        aria-labelledby='smart-links-how'
        className='border-t border-subtle py-16 sm:py-22'
        data-testid='marketing-section-how-it-works'
        data-marketing-variant='3-step-strip'
        data-marketing-owner='apps/web/app/(marketing)/smart-links/SmartLinksLanding.tsx'
      >
        <MarketingContainer width='page'>
          <h2
            id='smart-links-how'
            className='text-balance line-clamp-2 text-3xl font-semibold tracking-tight sm:text-4xl'
          >
            {hero.howTitle}
          </h2>
          <div className='mt-10 grid gap-6 md:grid-cols-3'>
            {hero.stepTitles.map((title, index) => (
              <article key={title} className='border-t border-subtle pt-5'>
                <h3 className='text-balance text-lg font-semibold'>{title}</h3>
                <p className='mt-3 text-sm leading-6 text-secondary-token'>
                  {STEP_BODIES[index]}
                </p>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </section>

      <section
        aria-labelledby='smart-links-cta'
        className='py-16 text-center sm:py-22'
        data-testid='marketing-section-cta'
        data-marketing-variant='included-single'
        data-marketing-owner='apps/web/app/(marketing)/smart-links/SmartLinksLanding.tsx'
      >
        <MarketingContainer width='page'>
          <h2
            id='smart-links-cta'
            className='text-balance line-clamp-2 text-3xl font-semibold tracking-tight sm:text-4xl'
          >
            {hero.ctaTitle}
          </h2>
          <p className='mx-auto mt-4 max-w-xl text-base leading-7 text-secondary-token'>
            {hero.ctaBody}
          </p>
          <div className='mt-8'>
            <Button asChild variant='secondary' size='md'>
              <Link
                href={`${APP_ROUTES.SIGNUP}?source=smart-links&intent=create`}
                prefetch={resolveMarketingAuthPrefetch(APP_ROUTES.SIGNUP)}
              >
                Create a Smart Link
              </Link>
            </Button>
          </div>
        </MarketingContainer>
      </section>
    </MarketingPageShell>
  );
}

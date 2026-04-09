'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { MarketingHero } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { ProductScreenshot } from '@/features/home/ProductScreenshot';
import { track } from '@/lib/analytics';

export function NewLandingHero() {
  return (
    <section
      className='relative overflow-hidden pb-10 pt-[5.75rem] md:pb-14 md:pt-[6.25rem] lg:pb-18'
      data-testid='homepage-shell'
      aria-labelledby='landing-hero-heading'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[34rem]' />

      <MarketingHero variant='split' className='relative items-center'>
        <div className='hero-stagger max-w-[34rem]'>
          <p className='homepage-section-eyebrow'>
            Built for independent artists
          </p>
          <h1
            id='landing-hero-heading'
            data-testid='hero-heading'
            className='marketing-h1-linear mt-5 max-w-[10ch] text-primary-token'
          >
            Drop More Music. Crush Every Release.
          </h1>
          <p className='marketing-lead-linear mt-5 max-w-[31rem] text-secondary-token'>
            Smart links, artist profiles, release automation, and audience
            proof, all in one clean system that feels like your product, not a
            pile of tools.
          </p>

          <div className='mt-7 flex flex-wrap items-center gap-3'>
            <Button
              asChild
              size='lg'
              data-testid='landing-hero-cta'
              onClick={() => {
                track('landing_cta_get_started', { section: 'hero' });
              }}
            >
              <Link href={APP_ROUTES.SIGNUP}>Get started free</Link>
            </Button>
            <span className='text-[12px] text-tertiary-token'>
              Free forever. No credit card required.
            </span>
          </div>

          <div className='mt-7 flex flex-wrap gap-2.5'>
            {['Zero Setup', 'Own Your Audience', 'Unlimited Smartlinks'].map(
              label => (
                <span
                  key={label}
                  className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-3.5 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-secondary-token'
                >
                  {label}
                </span>
              )
            )}
          </div>
        </div>

        <div data-testid='landing-hero-proof'>
          <div className='relative'>
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-12 top-6 h-40 blur-3xl'
              style={{
                background:
                  'radial-gradient(circle at center, color-mix(in oklab, var(--color-accent) 26%, transparent), transparent 72%)',
              }}
            />

            <ProductScreenshot
              src='/product-screenshots/releases-dashboard-full.png'
              alt='Jovie dashboard showing releases, smart links, and audience workflows'
              width={2880}
              height={1800}
              title='Jovie release command center'
              chrome='minimal'
              priority
              skipCheck
              testId='landing-hero-screenshot'
              className='rounded-[1.35rem]'
            />
          </div>
        </div>
      </MarketingHero>
    </section>
  );
}

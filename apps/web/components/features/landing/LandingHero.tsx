import { ProductScreenshot } from '@/features/home/ProductScreenshot';
import { SharedMarketingHero } from './SharedMarketingHero';

export function LandingHero() {
  return (
    <SharedMarketingHero
      eyebrow='Built for independent artists'
      headingId='landing-hero-heading'
      titleTestId='hero-heading'
      sectionTestId='homepage-shell'
      primaryCtaLabel='Get started free'
      primaryCtaTestId='landing-hero-cta'
      subcopy='Free forever. No credit card required.'
      proofPoints={['Zero Setup', 'Own Your Audience', 'Unlimited Smartlinks']}
      title='Drop More Music. Crush Every Release.'
      body={
        <p className='marketing-lead-linear max-w-[31rem] text-secondary-token'>
          Smart links, artist profiles, release automation, and audience proof,
          all in one clean system that feels like your product, not a pile of
          tools.
        </p>
      }
      media={
        <div data-testid='landing-hero-proof' className='relative'>
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
      }
      gridClassName='lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14'
    />
  );
}

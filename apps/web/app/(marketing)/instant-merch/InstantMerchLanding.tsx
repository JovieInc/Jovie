import { Button } from '@jovie/ui';
import Link from 'next/link';
import { ChatGenerationArtifactSurface } from '@/components/jovie/components/ChatGenerationArtifactSurface';
import {
  MarketingContainer,
  MarketingFeatureGrid,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { INSTANT_MERCH_COPY as copy } from '@/data/instantMerchCopy';

const CREATE_MERCH_HREF = `${APP_ROUTES.CHAT}?q=${encodeURIComponent('Make me merch')}`;

function MerchFlowPreview() {
  return (
    <ChatGenerationArtifactSurface
      title='Merch Options'
      subtitle='Review before you publish'
      className='w-full'
    >
      <div className='grid gap-3 sm:grid-cols-3'>
        {['Heavyweight tee', 'Tour hoodie', 'Limited cap'].map(
          (product, index) => (
            <div
              key={product}
              className='rounded-xl border border-subtle bg-surface-0 p-4'
            >
              <div
                aria-hidden='true'
                className='aspect-square rounded-lg bg-panel'
              />
              <p className='mt-3 text-sm font-medium text-primary-token'>
                {product}
              </p>
              <p className='mt-1 text-xs text-tertiary-token'>
                Concept {index + 1}
              </p>
            </div>
          )
        )}
      </div>
    </ChatGenerationArtifactSurface>
  );
}

export function InstantMerchLanding() {
  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <main>
        <MarketingHero
          eyebrow={copy.hero.eyebrow}
          title={copy.hero.title}
          body={copy.hero.body}
          media={<MerchFlowPreview />}
          headingId='instant-merch-hero-heading'
          sectionTestId='marketing-section-hero'
          primaryCtaLabel={copy.hero.primaryCta}
          primaryCtaHref={CREATE_MERCH_HREF}
          primaryCtaTestId='instant-merch-primary-cta'
          secondaryCtaLabel={copy.hero.secondaryCta}
          secondaryCtaHref='#instant-merch-flow'
          subcopy={copy.hero.subcopy}
        />

        <section
          id='instant-merch-flow'
          aria-labelledby='instant-merch-flow-heading'
          className='border-t border-subtle py-16 sm:py-20'
          data-testid='marketing-section-how-it-works'
        >
          <MarketingContainer width='page'>
            <div className='mx-auto max-w-3xl text-center'>
              <p className='homepage-section-eyebrow'>{copy.flow.eyebrow}</p>
              <h2
                id='instant-merch-flow-heading'
                className='mt-3 text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'
              >
                {copy.flow.title}
              </h2>
              <p className='mt-3 text-pretty leading-7 text-secondary-token'>
                {copy.flow.body}
              </p>
            </div>
            <div className='mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-3'>
              {copy.flow.steps.map((step, index) => (
                <article
                  key={step.title}
                  className='border-t border-subtle pt-5'
                >
                  <p className='text-xs font-mono text-tertiary-token'>
                    0{index + 1}
                  </p>
                  <h3 className='mt-3 text-lg font-medium text-primary-token'>
                    {step.title}
                  </h3>
                  <p className='mt-2 text-sm leading-6 text-secondary-token'>
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='instant-merch-details-heading'
          className='bg-panel py-16 sm:py-20'
          data-testid='marketing-section-feature-grid'
        >
          <MarketingContainer width='page'>
            <div className='mx-auto max-w-3xl'>
              <p className='homepage-section-eyebrow'>{copy.details.eyebrow}</p>
              <h2
                id='instant-merch-details-heading'
                className='mt-3 text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'
              >
                {copy.details.title}
              </h2>
              <MarketingFeatureGrid items={copy.details.items} />
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='instant-merch-cta-heading'
          className='py-16 sm:py-24'
          data-testid='marketing-section-cta'
        >
          <MarketingContainer width='prose' className='text-center'>
            <h2
              id='instant-merch-cta-heading'
              className='text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'
            >
              {copy.cta.title}
            </h2>
            <p className='mt-3 text-pretty leading-7 text-secondary-token'>
              {copy.cta.body}
            </p>
            <Button asChild className='mt-8' data-primary-action='true'>
              <Link
                href={CREATE_MERCH_HREF}
                data-testid='instant-merch-final-cta'
              >
                {copy.cta.primaryCta}
              </Link>
            </Button>
          </MarketingContainer>
        </section>
      </main>
    </MarketingPageShell>
  );
}

export { CREATE_MERCH_HREF };

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { ChatGenerationArtifactSurface } from '@/components/jovie/components/ChatGenerationArtifactSurface';
import { ChatMerchDesignCarousel } from '@/components/jovie/components/ChatMerchDesignCarousel';
import {
  MarketingContainer,
  MarketingFeatureGrid,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { INSTANT_MERCH_COPY as copy } from '@/data/instantMerchCopy';
import { resolveMarketingAuthPrefetch } from '@/data/marketing/authEntryPrefetch';
import type { MerchDesignCarouselResult } from '@/lib/merch/types';

const CREATE_MERCH_HREF = `${APP_ROUTES.CHAT}?q=${encodeURIComponent('Make me merch')}`;

/**
 * Tim White dogfood concepts rendered by the real merch review carousel —
 * the same component the chat mounts after generation. The preview images
 * are garment mockups produced by the canonical merch pipeline
 * (`buildPrintSvg` + `renderMockup` in lib/merch/artwork, see
 * scripts/generate-instant-merch-proof.ts), not album art. Selecting a
 * concept without a signed-in profile submits the choice into the
 * authenticated merch conversation via the chat prompt bridge.
 */
const MERCH_LANDING_RESULT: MerchDesignCarouselResult = {
  success: true,
  generationId: 'instant-merch-landing',
  prompt: 'Make me merch',
  designs: [
    {
      id: 'landing-concept-1',
      option_number: 1,
      design_name: 'Never Say A Word — lyric tee',
      concept: 'Single lyric line over the release artwork palette.',
      status: 'ready',
      preview_url: '/images/merch/never-say-a-word-tee-mockup.webp',
      slots: {
        artist_name: 'Tim White',
        lyric: 'Never say a word',
        source_type: 'song_title',
      },
    },
    {
      id: 'landing-concept-2',
      option_number: 2,
      design_name: 'The Deep End — cover hoodie',
      concept: 'Cover art centered on a heavyweight hoodie.',
      status: 'ready',
      preview_url: '/images/merch/the-deep-end-hoodie-mockup.webp',
      slots: {
        artist_name: 'Tim White',
        short_text: 'The Deep End',
        source_type: 'album_title',
      },
    },
    {
      id: 'landing-concept-3',
      option_number: 3,
      design_name: 'Take Me Over — wordmark cap',
      concept: 'Minimal wordmark treatment on a limited cap.',
      status: 'ready',
      preview_url: '/images/merch/take-me-over-cap-mockup.webp',
      slots: {
        artist_name: 'Tim White',
        short_text: 'Take Me Over',
        source_type: 'song_title',
      },
    },
  ],
};

function MerchFlowPreview() {
  return (
    <ChatGenerationArtifactSurface
      title='Merch Options'
      subtitle='Review before you publish'
      className='w-full'
    >
      <h2 className='sr-only'>Merch Concepts</h2>
      <ChatMerchDesignCarousel result={MERCH_LANDING_RESULT} />
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
          photo={{
            src: '/images/marketing-hero/instant-merch.webp',
            width: 1600,
            height: 901,
          }}
          headingId='instant-merch-hero-heading'
          headlineMaxLines='none'
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
                className='mt-3 text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl line-clamp-2'
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
                className='mt-3 text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl line-clamp-2'
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
              className='text-balance text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl line-clamp-2'
            >
              {copy.cta.title}
            </h2>
            <p className='mt-3 text-pretty leading-7 text-secondary-token'>
              {copy.cta.body}
            </p>
            <Button asChild className='mt-8' data-primary-action='true'>
              <Link
                href={CREATE_MERCH_HREF}
                prefetch={resolveMarketingAuthPrefetch(CREATE_MERCH_HREF)}
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

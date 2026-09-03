import { Button } from '@jovie/ui';
import Link from 'next/link';
import {
  MarketingContainer,
  MarketingFeatureGrid,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { YOUTUBE_THUMBNAILS_COPY as copy } from '@/data/youtubeThumbnailsCopy';
import { YoutubeThumbnailPasteForm } from './YoutubeThumbnailPasteForm';

/** Apply needs an account and YouTube Connect. Live mutation is JOV-5158. */
export const YOUTUBE_THUMBNAILS_APPLY_HREF = `${APP_ROUTES.SIGNUP}?source=youtube-thumbnails&intent=apply`;
export const YOUTUBE_THUMBNAILS_GET_STARTED_HREF = `${APP_ROUTES.START}?source=youtube-thumbnails`;

export function YoutubeThumbnailsLanding() {
  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <main>
        <MarketingHero
          variant='left'
          headingId='youtube-thumbnails-hero-heading'
          testId='marketing-section-hero'
        >
          <p className='homepage-section-eyebrow'>{copy.hero.eyebrow}</p>
          <h1
            id='youtube-thumbnails-hero-heading'
            data-testid='youtube-thumbnails-hero-heading'
            className='marketing-h1-linear mt-5 max-w-3xl text-primary-token'
          >
            {copy.hero.title}
          </h1>
          <p className='mt-5 max-w-2xl text-base leading-7 text-secondary-token sm:text-lg'>
            {copy.hero.body}
          </p>
          <YoutubeThumbnailPasteForm
            className='mt-8 w-full'
            applyHref={YOUTUBE_THUMBNAILS_APPLY_HREF}
          />
        </MarketingHero>

        <section
          id='how-it-works'
          aria-labelledby='approval-loop-heading'
          className='border-t border-subtle py-16 sm:py-20'
          data-testid='marketing-section-how-it-works'
        >
          <MarketingContainer width='page'>
            <div className='mx-auto max-w-3xl text-center'>
              <p className='homepage-section-eyebrow'>
                {copy.workflow.eyebrow}
              </p>
              <h2
                id='approval-loop-heading'
                className='mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl'
              >
                {copy.workflow.title}
              </h2>
              <p className='mt-3 text-pretty leading-7 text-secondary-token'>
                {copy.workflow.body}
              </p>
            </div>
            <div className='mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-3'>
              {copy.workflow.steps.map((step, index) => (
                <article
                  key={step.title}
                  className='border-t border-subtle pt-5'
                >
                  <p className='font-mono text-xs text-tertiary-token'>
                    0{index + 1}
                  </p>
                  <h3 className='mt-3 text-lg font-medium'>{step.title}</h3>
                  <p className='mt-2 text-sm leading-6 text-secondary-token'>
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='thumbnail-safeguards-heading'
          className='bg-panel py-16 sm:py-20'
          data-testid='marketing-section-feature-grid'
        >
          <MarketingContainer width='page'>
            <div className='mx-auto max-w-3xl'>
              <p className='homepage-section-eyebrow'>
                {copy.safeguards.eyebrow}
              </p>
              <h2
                id='thumbnail-safeguards-heading'
                className='mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl'
              >
                {copy.safeguards.title}
              </h2>
              <MarketingFeatureGrid items={copy.safeguards.items} />
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='youtube-thumbnails-included-heading'
          className='py-16 sm:py-20'
          data-testid='marketing-section-cta'
        >
          <MarketingContainer width='page'>
            <div className='mx-auto max-w-3xl text-center'>
              <p className='homepage-section-eyebrow'>
                {copy.included.eyebrow}
              </p>
              <h2
                id='youtube-thumbnails-included-heading'
                className='mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl'
              >
                {copy.included.title}
              </h2>
              <p className='mt-3 text-pretty leading-7 text-secondary-token'>
                {copy.included.body}
              </p>
              <div className='mt-8 flex justify-center'>
                <Button asChild variant='primary' size='md'>
                  <Link
                    href={YOUTUBE_THUMBNAILS_GET_STARTED_HREF}
                    data-testid='youtube-thumbnails-get-started-cta'
                  >
                    {copy.included.cta}
                  </Link>
                </Button>
              </div>
            </div>
          </MarketingContainer>
        </section>
      </main>
    </MarketingPageShell>
  );
}

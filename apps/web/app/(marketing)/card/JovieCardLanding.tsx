import { Button } from '@jovie/ui/atoms/button';
import Link from 'next/link';
import { FaqSection } from '@/components/marketing/FaqSection';
import { MarketingHero } from '@/components/marketing/MarketingHero';
import { MarketingPageShell } from '@/components/marketing/MarketingPageShell';
import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';
import { JOVIE_CARD_COPY } from '@/data/jovieCardCopy';
import { JovieCardInterestCaptureWithAuth } from './JovieCardInterestCapture';

function JovieCardPreview() {
  return (
    <figure
      className='mx-auto w-full max-w-2xl'
      aria-labelledby='card-preview-caption'
    >
      <div className='grid items-end gap-5 sm:grid-cols-5'>
        <div className='rounded-3xl border border-subtle bg-surface-1 p-5 shadow-xl sm:col-span-3'>
          <div className='aspect-video rounded-2xl border border-subtle bg-surface-2 p-6'>
            <div className='flex h-full flex-col justify-between'>
              <div className='flex items-start justify-between gap-4'>
                <span className='text-sm font-semibold tracking-tight text-primary-token'>
                  Jovie Card
                </span>
                <span className='rounded-full border border-subtle px-2.5 py-1 text-xs text-tertiary-token'>
                  Preview
                </span>
              </div>
              <div>
                <p className='text-2xl font-semibold tracking-tight text-primary-token'>
                  Your name
                </p>
                <p className='mt-1 text-sm text-secondary-token'>
                  jov.ie/you · public profile
                </p>
              </div>
            </div>
          </div>
        </div>
        <ProductScreenshotFrame
          scenarioId='public-profile-mobile'
          device='phone'
          sizes='(max-width: 640px) 70vw, 280px'
          className='mx-auto w-44 sm:col-span-2 sm:w-52'
          altOverride='Approved demo capture of a Jovie public profile'
        />
      </div>
      <figcaption
        id='card-preview-caption'
        className='mt-4 text-center text-xs text-tertiary-token'
      >
        Illustrative card paired with an approved demo profile · final Wallet
        appearance and access may change.
      </figcaption>
    </figure>
  );
}

export function JovieCardLanding() {
  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <div data-marketing-section='hero'>
        <MarketingHero
          headline={JOVIE_CARD_COPY.hero.headline}
          subtitle={JOVIE_CARD_COPY.hero.body}
          headingId='jovie-card-hero-heading'
          testId='marketing-section-hero'
          sectionVariant='split-screenshot-right'
          headlineMaxLines={3}
          primaryCta={{
            label: JOVIE_CARD_COPY.publication.primaryCta,
            href: '#join-the-list',
          }}
          secondaryCta={{
            label: JOVIE_CARD_COPY.publication.secondaryCta,
            href: '#how-it-works',
          }}
          logos={false}
          media={<JovieCardPreview />}
        />
        <p className='mx-auto -mt-10 max-w-public-content px-6 pb-16 text-sm font-medium text-secondary-token sm:px-8 lg:px-10'>
          {JOVIE_CARD_COPY.publication.label}
        </p>
      </div>

      <section
        id='how-it-works'
        data-marketing-section='how-it-works'
        data-testid='marketing-section-how-it-works'
        data-marketing-owner='apps/web/app/(marketing)/card/JovieCardLanding.tsx'
        data-marketing-variant='3-step-strip'
        aria-labelledby='jovie-card-how-heading'
        className='mx-auto w-full max-w-public-content px-6 py-20 sm:px-8 lg:px-10 lg:py-28'
      >
        <p className='marketing-kicker'>A future in-person flow</p>
        <h2
          id='jovie-card-how-heading'
          className='system-b-marketing-section-heading mt-5 text-primary-token'
        >
          From hello to your profile
        </h2>
        <ol className='mt-12 grid gap-10 md:grid-cols-3'>
          {JOVIE_CARD_COPY.steps.map((step, index) => (
            <li key={step.title} className='border-t border-subtle pt-6'>
              <span aria-hidden='true' className='text-xs text-tertiary-token'>
                0{index + 1}
              </span>
              <h3 className='mt-4 text-xl font-semibold tracking-tight text-primary-token'>
                {step.title}
              </h3>
              <p className='mt-3 text-base leading-relaxed text-secondary-token'>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        data-marketing-section='feature-grid'
        data-testid='marketing-section-feature-grid'
        data-marketing-owner='apps/web/app/(marketing)/card/JovieCardLanding.tsx'
        data-marketing-variant='two-column-text'
        aria-labelledby='jovie-card-introduction-heading'
        className='border-y border-subtle bg-surface-0'
      >
        <div className='mx-auto w-full max-w-public-content px-6 py-20 sm:px-8 lg:px-10 lg:py-28'>
          <h2
            id='jovie-card-introduction-heading'
            className='system-b-marketing-section-heading max-w-3xl text-primary-token'
          >
            An introduction. Not a list of usernames
          </h2>
          <div className='mt-12 divide-y divide-border-primary border-y border-border-primary'>
            {JOVIE_CARD_COPY.examples.map(example => (
              <article
                key={example.audience}
                className='grid gap-3 py-7 sm:grid-cols-4 sm:gap-8'
              >
                <h3 className='text-sm font-semibold text-primary-token'>
                  {example.audience}
                </h3>
                <p className='max-w-2xl text-base leading-relaxed text-secondary-token sm:col-span-3'>
                  {example.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div
        className='pt-20 lg:pt-28'
        data-testid='marketing-section-faq'
        data-marketing-owner='apps/web/app/(marketing)/card/JovieCardLanding.tsx'
        data-marketing-variant='objection-handler'
      >
        <FaqSection
          heading='Jovie Card questions'
          items={JOVIE_CARD_COPY.faq}
          analyticsEventName='jovie_card_faq_opened'
        />
      </div>

      <section
        id='join-the-list'
        data-marketing-section='cta'
        data-testid='marketing-section-cta'
        data-marketing-owner='apps/web/app/(marketing)/card/JovieCardLanding.tsx'
        data-marketing-variant='final-single-claim'
        aria-labelledby='jovie-card-cta-heading'
        className='border-t border-subtle bg-surface-0'
      >
        <div className='mx-auto grid w-full max-w-public-content items-start gap-10 px-6 py-20 sm:px-8 lg:grid-cols-2 lg:px-10 lg:py-28'>
          <div className='max-w-xl'>
            <p className='marketing-kicker'>
              {JOVIE_CARD_COPY.publication.label}
            </p>
            <h2
              id='jovie-card-cta-heading'
              className='system-b-marketing-section-heading mt-5 text-primary-token'
            >
              Bring your profile into the room
            </h2>
            <p className='mt-5 text-base leading-relaxed text-secondary-token'>
              Join the list for access updates. This does not issue a pass or
              guarantee eligibility.
            </p>
            <Button asChild variant='ghost' size='marketing' className='mt-6'>
              <Link href='#how-it-works'>See how it works</Link>
            </Button>
          </div>
          <JovieCardInterestCaptureWithAuth />
        </div>
      </section>
    </MarketingPageShell>
  );
}

import { FaqSection } from '@/components/marketing/FaqSection';
import { MarketingHero } from '@/components/marketing/MarketingHero';
import { MarketingPageShell } from '@/components/marketing/MarketingPageShell';
import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';
import { JOVIE_CARD_COPY } from '@/data/jovieCardCopy';
import { JovieCardInterestCaptureWithAuth } from './JovieCardInterestCapture';

// One visual: the real public profile a scan opens. No placeholder card
// nested beside the phone.
function JovieCardPreview() {
  return (
    <figure
      className='mx-auto flex w-full max-w-xs flex-col items-center'
      aria-labelledby='card-preview-caption'
    >
      <ProductScreenshotFrame
        scenarioId='public-profile-mobile'
        device='phone'
        sizes='(max-width: 640px) 70vw, 280px'
        className='w-56 sm:w-64'
        altOverride='Approved demo capture of a Jovie public profile'
      />
      <figcaption
        id='card-preview-caption'
        className='mt-4 text-balance text-center text-xs text-tertiary-token'
      >
        {JOVIE_CARD_COPY.publication.label} · A scan opens your profile.
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
        <h2
          id='jovie-card-how-heading'
          data-wrap='editorial-title'
          className='system-b-marketing-section-heading text-primary-token'
        >
          {JOVIE_CARD_COPY.sections.howItWorks}
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
            data-wrap='editorial-title'
            className='system-b-marketing-section-heading max-w-3xl text-primary-token'
          >
            {JOVIE_CARD_COPY.sections.introduction}
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
        data-marketing-variant='objection-handler' /* copy-lint-allow: objection */
      >
        <FaqSection
          heading='Questions'
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
            <h2
              id='jovie-card-cta-heading'
              data-wrap='editorial-title'
              className='system-b-marketing-section-heading text-primary-token'
            >
              {JOVIE_CARD_COPY.sections.closing}
            </h2>
            <p className='mt-5 text-base leading-relaxed text-secondary-token'>
              Join the list for access updates. This does not issue a pass or
              guarantee eligibility.
            </p>
          </div>
          <JovieCardInterestCaptureWithAuth />
        </div>
      </section>
    </MarketingPageShell>
  );
}

import { Button } from '@jovie/ui';
import Link from 'next/link';
import {
  MarketingContainer,
  MarketingFeatureGrid,
  MarketingHero,
  MarketingPageShell,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { YOUTUBE_THUMBNAILS_COPY as copy } from '@/data/youtubeThumbnailsCopy';

export const FREE_THUMBNAIL_SIGNUP_HREF = `${APP_ROUTES.SIGNUP}?plan=free&source=youtube-thumbnails`;
export const FOUNDER_THUMBNAIL_SIGNUP_HREF = `${APP_ROUTES.SIGNUP}?plan=pro&source=youtube-thumbnails&offer=founder&redirect_url=${encodeURIComponent('/billing/youtube-thumbnails')}`;

function ThumbnailApprovalPreview() {
  return (
    <MarketingSurfaceCard
      variant='product-callout'
      glowTone='teal'
      label='Thumbnail Review'
      stateLabel='3 ready'
      testId='youtube-thumbnails-approval-preview'
      contentClassName='p-4 sm:p-5'
    >
      <div
        className='grid gap-3'
        role='img'
        aria-label='Thumbnail Approval Queue Preview With Three Candidates'
      >
        {[
          ['The $1,000 Room', 'Awaiting your approval', 'from-violet-500/35'],
          ['Vegas Is A Trap', 'Approved style', 'from-amber-400/30'],
          ['Skip The Line', 'New direction', 'from-sky-400/30'],
        ].map(([title, status, tone], index) => (
          <div
            key={title}
            className='grid min-h-20 grid-cols-[7rem_1fr_auto] items-center gap-3 border-b border-subtle pb-3 last:border-0 last:pb-0'
          >
            <div
              aria-hidden='true'
              className={`aspect-video rounded-lg bg-gradient-to-br ${tone} to-surface-2`}
            >
              <div className='flex h-full items-end p-2'>
                <span className='text-3xs font-semibold uppercase tracking-wide text-primary-token'>
                  {title}
                </span>
              </div>
            </div>
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium text-primary-token'>
                {title}
              </p>
              <p className='mt-1 text-2xs text-tertiary-token'>{status}</p>
            </div>
            <span
              className='inline-flex size-7 items-center justify-center rounded-full border border-subtle text-xs text-secondary-token'
              aria-hidden='true'
            >
              {index === 1 ? '✓' : '→'}
            </span>
          </div>
        ))}
      </div>
    </MarketingSurfaceCard>
  );
}

function PlanCard({
  plan,
  href,
  recommended = false,
}: Readonly<{
  plan: (typeof copy.plans)['free' | 'founder'];
  href: string;
  recommended?: boolean;
}>) {
  return (
    <article className='flex h-full flex-col border-t border-subtle pt-6'>
      <div className='flex min-h-7 items-center justify-between gap-4'>
        <h3 className='text-lg font-medium text-primary-token'>{plan.name}</h3>
        {recommended ? (
          <span className='rounded-full bg-accent px-2.5 py-1 text-3xs font-semibold uppercase tracking-wide text-on-accent'>
            Founding offer
          </span>
        ) : null}
      </div>
      <p className='mt-5 text-4xl font-semibold tracking-tight text-primary-token'>
        {plan.price}
        <span className='ml-2 text-sm font-normal text-tertiary-token'>
          {plan.cadence}
        </span>
      </p>
      <p className='mt-4 min-h-12 text-sm leading-6 text-secondary-token'>
        {plan.description}
      </p>
      <ul className='mt-6 flex-1 space-y-3 text-sm text-secondary-token'>
        {plan.features.map(feature => (
          <li key={feature} className='flex gap-3'>
            <span aria-hidden='true' className='text-accent-token'>
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Button
        asChild
        variant={recommended ? 'primary' : 'secondary'}
        className='mt-8 w-full'
      >
        <Link
          href={href}
          data-testid={`youtube-thumbnails-${plan.name.toLowerCase()}-cta`}
        >
          {plan.cta}
        </Link>
      </Button>
    </article>
  );
}

export function YoutubeThumbnailsLanding() {
  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <main>
        <MarketingHero
          eyebrow={copy.hero.eyebrow}
          title={copy.hero.title}
          body={copy.hero.body}
          media={<ThumbnailApprovalPreview />}
          headingId='youtube-thumbnails-hero-heading'
          sectionTestId='marketing-section-hero'
          primaryCtaLabel={copy.hero.primaryCta}
          primaryCtaHref={FREE_THUMBNAIL_SIGNUP_HREF}
          primaryCtaTestId='youtube-thumbnails-primary-cta'
          secondaryCtaLabel={copy.hero.secondaryCta}
          secondaryCtaHref='#approval-loop'
          subcopy={copy.hero.subcopy}
        />

        <section
          id='approval-loop'
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
                className='mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl line-clamp-2'
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
                className='mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl line-clamp-2'
              >
                {copy.safeguards.title}
              </h2>
              <MarketingFeatureGrid items={copy.safeguards.items} />
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='thumbnail-plans-heading'
          className='py-16 sm:py-20'
          data-testid='marketing-section-pricing'
        >
          <MarketingContainer width='page'>
            <div className='mx-auto max-w-3xl text-center'>
              <p className='homepage-section-eyebrow'>{copy.plans.eyebrow}</p>
              <h2
                id='thumbnail-plans-heading'
                className='mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl line-clamp-2'
              >
                {copy.plans.title}
              </h2>
            </div>
            <div className='mx-auto mt-12 grid max-w-4xl gap-10 md:grid-cols-2'>
              <PlanCard
                plan={copy.plans.free}
                href={FREE_THUMBNAIL_SIGNUP_HREF}
              />
              <PlanCard
                plan={copy.plans.founder}
                href={FOUNDER_THUMBNAIL_SIGNUP_HREF}
                recommended
              />
            </div>
          </MarketingContainer>
        </section>
      </main>
    </MarketingPageShell>
  );
}

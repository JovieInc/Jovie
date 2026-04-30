import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { cn } from '@/lib/utils';

export function HomepageStoryHeader({
  headline,
  body,
  align = 'center',
  className,
  headlineClassName,
  bodyClassName,
  headlineTestId,
}: Readonly<{
  headline: string;
  body?: string;
  align?: 'center' | 'left';
  className?: string;
  headlineClassName?: string;
  bodyClassName?: string;
  headlineTestId?: string;
}>) {
  const centered = align === 'center';

  return (
    <div
      className={cn(
        centered ? 'mx-auto text-center' : 'max-w-[38rem]',
        className
      )}
    >
      <h2
        className={cn('homepage-story-heading', headlineClassName)}
        data-testid={headlineTestId}
      >
        {headline}
      </h2>
      {body ? (
        <p
          className={cn(
            'homepage-story-body',
            centered && 'mx-auto',
            bodyClassName
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

function PricingCard({
  title,
  body,
  price,
  ctaLabel,
  ctaHref,
  featured = false,
  testId,
}: Readonly<{
  title: string;
  body: string;
  price: string;
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
  testId: string;
}>) {
  return (
    <article
      data-testid={testId}
      className={cn(
        'homepage-pricing-card',
        featured && 'homepage-pricing-card--featured'
      )}
    >
      <p className='text-[1.1rem] font-semibold tracking-[-0.03em] text-primary-token'>
        {title}
      </p>
      <p className='mt-2 text-[14px] leading-[1.6] text-secondary-token'>
        {body}
      </p>
      <p className='mt-auto pt-8 text-[2.4rem] font-semibold tracking-[-0.07em] text-primary-token'>
        {price}
      </p>
      <Link href={ctaHref} className='public-action-primary mt-5 inline-flex'>
        {ctaLabel}
      </Link>
    </article>
  );
}

export function HomepageV2Pricing() {
  const proMonthlyPrice = ENTITLEMENT_REGISTRY.pro.marketing.price?.monthly;
  const proPriceDisplay =
    typeof proMonthlyPrice === 'number'
      ? `$${proMonthlyPrice}/mo`
      : 'Contact Us';

  return (
    <section
      data-testid='homepage-v2-pricing'
      className='homepage-story-section'
    >
      <MarketingContainer width='page'>
        <HomepageStoryHeader
          align='center'
          headline={HOMEPAGE_V2_COPY.pricing.headline}
          className='max-w-[40rem]'
          headlineClassName='mx-auto max-w-[10ch]'
        />

        <div className='homepage-pricing-grid'>
          <PricingCard
            body='One launch workspace. Request access now; setup opens as slots become available.'
            ctaHref={`${APP_ROUTES.SIGNUP}?plan=pro`}
            ctaLabel='Request Access'
            featured
            price={proPriceDisplay}
            testId='homepage-v2-pricing-pro'
            title={ENTITLEMENT_REGISTRY.pro.marketing.displayName}
          />
        </div>
      </MarketingContainer>
    </section>
  );
}

const HOMEPAGE_FINAL_CTA_ARCS = [
  { radiusX: 70, radiusY: 245 },
  { radiusX: 130, radiusY: 235 },
  { radiusX: 195, radiusY: 225 },
  { radiusX: 265, radiusY: 215 },
  { radiusX: 340, radiusY: 205 },
  { radiusX: 420, radiusY: 198 },
  { radiusX: 505, radiusY: 192 },
  { radiusX: 590, radiusY: 188 },
] as const;

export function HomepageV2FinalCta() {
  return (
    <section
      data-testid='homepage-v2-final-cta'
      className='homepage-story-final-cta relative isolate overflow-hidden bg-black'
    >
      <div
        aria-hidden='true'
        className='homepage-final-cta-glow pointer-events-none absolute inset-0 z-[1]'
      />
      <svg
        className='homepage-final-cta-rays pointer-events-none absolute inset-x-0 bottom-0 z-[2] w-full'
        viewBox='0 0 1200 540'
        preserveAspectRatio='xMidYMax slice'
        aria-hidden='true'
      >
        <defs>
          <linearGradient
            id='homepage-final-cta-ray-primary'
            x1='0'
            x2='0'
            y1='0'
            y2='1'
          >
            <stop offset='0%' stopColor='#0070f3' stopOpacity='0' />
            <stop offset='55%' stopColor='#0070f3' stopOpacity='0.35' />
            <stop offset='92%' stopColor='#ffffff' stopOpacity='0.95' />
            <stop offset='100%' stopColor='#ffffff' stopOpacity='0.6' />
          </linearGradient>
          <linearGradient
            id='homepage-final-cta-ray-secondary'
            x1='0'
            x2='0'
            y1='0'
            y2='1'
          >
            <stop offset='0%' stopColor='#0070f3' stopOpacity='0' />
            <stop offset='70%' stopColor='#0070f3' stopOpacity='0.55' />
            <stop offset='100%' stopColor='#dbeaff' stopOpacity='0.85' />
          </linearGradient>
        </defs>
        <ellipse
          cx='600'
          cy='600'
          rx='22'
          ry='260'
          stroke='url(#homepage-final-cta-ray-secondary)'
          strokeWidth='2.2'
          fill='none'
        />
        {HOMEPAGE_FINAL_CTA_ARCS.map((arc, index) => (
          <ellipse
            key={`${arc.radiusX}-${arc.radiusY}`}
            cx='600'
            cy='600'
            rx={arc.radiusX}
            ry={arc.radiusY}
            stroke={
              index % 2 === 0
                ? 'url(#homepage-final-cta-ray-primary)'
                : 'url(#homepage-final-cta-ray-secondary)'
            }
            strokeWidth={index < 4 ? 1.5 : 1.2}
            fill='none'
            opacity={1 - index * 0.05}
          />
        ))}
        <rect
          x='0'
          y='538'
          width='1200'
          height='2'
          fill='#0070f3'
          opacity='0.3'
        />
      </svg>
      <MarketingContainer width='page' className='relative z-10'>
        <div className='homepage-final-cta-copy mx-auto'>
          <h2
            data-testid='homepage-v2-final-cta-heading'
            className='text-balance text-[clamp(2.15rem,3.7vw,3.65rem)] font-semibold leading-[1.03] tracking-[-0.035em] text-white'
          >
            {HOMEPAGE_V2_COPY.finalCta.headline}
          </h2>
          <Link
            href={APP_ROUTES.SIGNUP}
            className='homepage-final-cta-action inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.12] px-4 text-[12px] font-medium tracking-[-0.01em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition-colors hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
            data-testid='homepage-v2-final-cta-primary'
          >
            {HOMEPAGE_V2_COPY.finalCta.primaryCtaLabel}
          </Link>
        </div>
      </MarketingContainer>
    </section>
  );
}

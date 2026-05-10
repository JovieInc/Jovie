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
  badge,
  ctaLabel,
  ctaHref,
  featured = false,
  testId,
  features,
}: Readonly<{
  title: string;
  body: string;
  price: string;
  badge: string;
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
  testId: string;
  features?: readonly string[];
}>) {
  return (
    <article
      data-testid={testId}
      className={cn(
        'homepage-pricing-card',
        featured && 'homepage-pricing-card--featured'
      )}
    >
      <div className='homepage-pricing-card__header'>
        <div>
          <p className='homepage-pricing-card__title'>{title}</p>
          <p className='homepage-pricing-card__body'>{body}</p>
        </div>
        <span className='homepage-pricing-card__badge'>{badge}</span>
      </div>
      <p className='homepage-pricing-card__price'>{price}</p>
      {features?.length ? (
        <ul className='homepage-pricing-feature-list'>
          {features.map(feature => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      ) : null}
      <Link href={ctaHref} className='homepage-pricing-card__cta'>
        {ctaLabel}
      </Link>
    </article>
  );
}

export function HomepageV2Pricing() {
  const freeFeatures = [
    'Public artist profile page',
    'Unlimited smart links',
    'Release pages with listen links per DSP',
    'Basic analytics (30 days)',
  ] as const;
  const proMonthlyPrice = ENTITLEMENT_REGISTRY.pro.marketing.price?.monthly;
  const proFeatures = ENTITLEMENT_REGISTRY.pro.marketing.features
    .filter(feature => feature !== 'All Free features +')
    .slice(0, 4);
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
        <div className='homepage-pricing-shell'>
          <HomepageStoryHeader
            align='center'
            body='Artist profiles are free forever. Pro adds the release tools when you need them.'
            headline={HOMEPAGE_V2_COPY.pricing.headline}
            className='homepage-pricing-copy'
          />

          <div className='homepage-pricing-grid'>
            <PricingCard
              badge='Free forever'
              body={ENTITLEMENT_REGISTRY.free.marketing.tagline}
              ctaHref={`${APP_ROUTES.SIGNUP}?plan=free`}
              ctaLabel='Claim Your Profile'
              features={freeFeatures}
              price='$0'
              testId='homepage-v2-pricing-free'
              title={ENTITLEMENT_REGISTRY.free.marketing.displayName}
            />
            <PricingCard
              badge='14-day trial'
              body={HOMEPAGE_V2_COPY.pricing.supportLine}
              ctaHref={`${APP_ROUTES.SIGNUP}?plan=pro`}
              ctaLabel='Start 14-Day Free Trial'
              featured
              features={proFeatures}
              price={proPriceDisplay}
              testId='homepage-v2-pricing-pro'
              title={ENTITLEMENT_REGISTRY.pro.marketing.displayName}
            />
          </div>
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

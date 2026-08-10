import { Button } from '@jovie/ui';
import { Check } from 'lucide-react';
import Link from 'next/link';
import {
  getMarketingPlanCtaLabel,
  getMarketingPlanHref,
  getVisibleMarketingPricingPlans,
  isMarketingPlanActive,
  type MarketingPricingPlan,
} from '@/data/marketingPricingPlans';
import { cn } from '@/lib/utils';

type MarketingPricingMode = 'compact' | 'expanded';

export const MARKETING_PRICING_VARIANTS = [
  'tier-cards-neutral',
  'tier-cards-recommended',
] as const;

export type MarketingPricingVariant =
  (typeof MARKETING_PRICING_VARIANTS)[number];

const RECOMMENDED_PLAN_ID = 'pro';

function MarketingPricingPlanCard({
  mode,
  plan,
  variant,
}: Readonly<{
  mode: MarketingPricingMode;
  plan: MarketingPricingPlan;
  variant: MarketingPricingVariant;
}>) {
  const active = isMarketingPlanActive(plan.id);
  const recommended =
    variant === 'tier-cards-recommended' && plan.id === RECOMMENDED_PLAN_ID;
  const buttonVariant = recommended
    ? 'primary'
    : variant === 'tier-cards-neutral'
      ? 'secondary'
      : 'ghost';

  return (
    <article
      data-testid={`marketing-pricing-plan-${plan.id}`}
      data-plan-active={active ? 'true' : 'false'}
      data-recommended={recommended ? 'true' : 'false'}
      className={cn(
        'marketing-pricing-plan-card',
        recommended && 'marketing-pricing-plan-card--recommended',
        mode === 'expanded' && 'marketing-pricing-plan-card--expanded'
      )}
    >
      <div
        className='marketing-pricing-plan-card__topline'
        aria-hidden='true'
      />
      <div className='marketing-pricing-plan-card__header'>
        <span className='marketing-pricing-plan-card__badge'>{plan.badge}</span>
        <p className='marketing-pricing-plan-card__name'>{plan.name}</p>
        <p className='marketing-pricing-plan-card__body'>{plan.body}</p>
      </div>

      <p className='marketing-pricing-plan-card__price'>
        {plan.price}
        {plan.cadence ? <span>{plan.cadence}</span> : null}
      </p>

      <Button
        variant={buttonVariant}
        size='lg'
        className='marketing-pricing-plan-card__cta'
        asChild
      >
        <Link href={getMarketingPlanHref(plan.id)} prefetch={false}>
          {getMarketingPlanCtaLabel(plan)}
        </Link>
      </Button>

      <ul className='marketing-pricing-plan-card__features'>
        {plan.features.map(feature => (
          <li key={feature}>
            <Check aria-hidden='true' size={15} strokeWidth={1.8} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function MarketingPricingPlans({
  mode = 'compact',
  className,
  variant,
}: Readonly<{
  mode?: MarketingPricingMode;
  className?: string;
  variant: MarketingPricingVariant;
}>) {
  const visiblePlans = getVisibleMarketingPricingPlans();

  return (
    <div
      data-marketing-section='pricing'
      data-marketing-variant={variant}
      className={cn(
        'marketing-pricing-plans',
        `marketing-pricing-plans--${mode}`,
        className
      )}
    >
      {visiblePlans.map(plan => (
        <MarketingPricingPlanCard
          key={plan.id}
          mode={mode}
          plan={plan}
          variant={variant}
        />
      ))}
    </div>
  );
}

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

function MarketingPricingPlanCard({
  mode,
  plan,
}: Readonly<{
  mode: MarketingPricingMode;
  plan: MarketingPricingPlan;
}>) {
  const active = isMarketingPlanActive(plan.id);

  return (
    <article
      data-testid={`marketing-pricing-plan-${plan.id}`}
      data-plan-active={active ? 'true' : 'false'}
      className={cn(
        'marketing-pricing-plan-card',
        `marketing-pricing-plan-card--${plan.accent}`,
        mode === 'expanded' && 'marketing-pricing-plan-card--expanded'
      )}
    >
      <div
        className='marketing-pricing-plan-card__topline'
        aria-hidden='true'
      />
      <div className='marketing-pricing-plan-card__header'>
        <div className='min-w-0'>
          <p className='marketing-pricing-plan-card__name'>{plan.name}</p>
          <p className='marketing-pricing-plan-card__body'>{plan.body}</p>
        </div>
        <span className='marketing-pricing-plan-card__badge'>{plan.badge}</span>
      </div>

      <p className='marketing-pricing-plan-card__price'>
        {plan.price}
        {plan.cadence ? <span>{plan.cadence}</span> : null}
      </p>

      <Link
        href={getMarketingPlanHref(plan.id)}
        prefetch={false}
        className='marketing-pricing-plan-card__cta public-action-primary focus-ring-themed'
      >
        {getMarketingPlanCtaLabel(plan)}
      </Link>

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
}: Readonly<{
  mode?: MarketingPricingMode;
  className?: string;
}>) {
  const visiblePlans = getVisibleMarketingPricingPlans();

  return (
    <div
      className={cn(
        'marketing-pricing-plans',
        `marketing-pricing-plans--${mode}`,
        className
      )}
    >
      {visiblePlans.map(plan => (
        <MarketingPricingPlanCard key={plan.id} mode={mode} plan={plan} />
      ))}
    </div>
  );
}

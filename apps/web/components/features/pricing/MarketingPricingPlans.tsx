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
type MarketingPricingCtaVariant = 'primary' | 'secondary';

function MarketingPricingPlanCard({
  ctaVariant,
  mode,
  plan,
}: Readonly<{
  ctaVariant: MarketingPricingCtaVariant;
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

      <Button
        variant={ctaVariant === 'primary' ? 'primary' : 'ghost'}
        size='md'
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
  ctaVariant = 'primary',
  mode = 'compact',
  className,
}: Readonly<{
  ctaVariant?: MarketingPricingCtaVariant;
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
        <MarketingPricingPlanCard
          ctaVariant={ctaVariant}
          key={plan.id}
          mode={mode}
          plan={plan}
        />
      ))}
    </div>
  );
}

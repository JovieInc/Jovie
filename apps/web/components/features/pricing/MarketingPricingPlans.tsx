'use client';

import { Button } from '@jovie/ui';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import {
  getMarketingPlanCtaLabel,
  getMarketingPlanHref,
  getVisibleMarketingPricingPlans,
  isMarketingPlanActive,
  type MarketingPricingPlan,
} from '@/data/marketingPricingPlans';
import {
  type BillingInterval,
  formatAnnualMonthlyEquivalent,
  formatUsdAmount,
  getPaidPlanPriceUsd,
} from '@/lib/billing/offer-truth';
import { cn } from '@/lib/utils';

type MarketingPricingMode = 'compact' | 'expanded';

export const MARKETING_PRICING_VARIANTS = [
  'tier-cards-neutral',
  'tier-cards-recommended',
] as const;

export type MarketingPricingVariant =
  (typeof MARKETING_PRICING_VARIANTS)[number];

const RECOMMENDED_PLAN_ID = 'pro';

function BillingIntervalSelector({
  interval,
  onChange,
}: Readonly<{
  interval: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}>) {
  return (
    <fieldset
      data-testid='pricing-billing-interval'
      className='marketing-pricing-interval'
    >
      <legend className='sr-only'>Billing interval</legend>
      <div className='marketing-pricing-interval__control' role='presentation'>
        <button
          type='button'
          data-selected={interval === 'month' ? 'true' : 'false'}
          className='marketing-pricing-interval__option'
          aria-pressed={interval === 'month'}
          onClick={() => onChange('month')}
        >
          Monthly
        </button>
        <button
          type='button'
          data-selected={interval === 'year' ? 'true' : 'false'}
          className='marketing-pricing-interval__option'
          aria-pressed={interval === 'year'}
          onClick={() => onChange('year')}
        >
          Annual
        </button>
      </div>
    </fieldset>
  );
}

function planPriceDisplay(
  plan: MarketingPricingPlan,
  interval: BillingInterval
): { price: string; cadence: string | undefined; equivalent: string | null } {
  if (plan.id === 'free') {
    return { price: plan.price, cadence: plan.cadence, equivalent: null };
  }

  const amount = getPaidPlanPriceUsd(plan.id, interval);
  if (interval === 'year') {
    return {
      price: formatUsdAmount(amount),
      cadence: '/yr',
      equivalent: `${formatAnnualMonthlyEquivalent(amount)} billed annually`,
    };
  }

  return {
    price: formatUsdAmount(amount),
    cadence: '/mo',
    equivalent: null,
  };
}

function MarketingPricingPlanCard({
  mode,
  plan,
  variant,
  interval,
}: Readonly<{
  mode: MarketingPricingMode;
  plan: MarketingPricingPlan;
  variant: MarketingPricingVariant;
  interval: BillingInterval;
}>) {
  const active = isMarketingPlanActive(plan.id);
  const recommended =
    variant === 'tier-cards-recommended' && plan.id === RECOMMENDED_PLAN_ID;
  const strongestAction = plan.id === RECOMMENDED_PLAN_ID;
  const buttonVariant = strongestAction
    ? 'primary'
    : variant === 'tier-cards-neutral'
      ? 'secondary'
      : 'ghost';
  const display = planPriceDisplay(plan, interval);

  return (
    <article
      data-testid={`marketing-pricing-plan-${plan.id}`}
      data-plan-active={active ? 'true' : 'false'}
      data-recommended={recommended ? 'true' : 'false'}
      data-billing-interval={plan.id === 'free' ? 'none' : interval}
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
        {display.price}
        {display.cadence ? <span>{display.cadence}</span> : null}
      </p>
      {display.equivalent ? (
        <p className='marketing-pricing-plan-card__equivalent'>
          {display.equivalent}
        </p>
      ) : null}
      <p className='marketing-pricing-plan-card__offer-note'>
        {plan.offerNote}
      </p>

      <Button
        variant={buttonVariant}
        size='lg'
        className='marketing-pricing-plan-card__cta'
        asChild
      >
        <Link href={getMarketingPlanHref(plan.id, interval)} prefetch={false}>
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
  const [interval, setInterval] = useState<BillingInterval>('month');

  return (
    <div className={cn('marketing-pricing-offer', className)}>
      <BillingIntervalSelector interval={interval} onChange={setInterval} />
      <div
        data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.pricing}
        data-marketing-section='pricing'
        data-marketing-variant={variant}
        data-billing-interval={interval}
        className={cn(
          'marketing-pricing-plans',
          `marketing-pricing-plans--${mode}`
        )}
      >
        {visiblePlans.map(plan => (
          <MarketingPricingPlanCard
            key={plan.id}
            mode={mode}
            plan={plan}
            variant={variant}
            interval={interval}
          />
        ))}
      </div>
    </div>
  );
}

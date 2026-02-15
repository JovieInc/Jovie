'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  SegmentControl,
  Separator,
} from '@jovie/ui';
import { Check, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useState } from 'react';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import type { PricingOption } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  LINEAR_EASE,
  PLAN_FEATURES,
  PLAN_KEYS,
  type PlanKey,
} from './billing-constants';
import { GrowthAccessRequestModal } from './GrowthAccessRequestModal';

function findPriceForPlan(
  options: PricingOption[],
  planKey: PlanKey,
  interval: 'month' | 'year'
): PricingOption | undefined {
  return options.find(
    o =>
      o.description.toLowerCase().includes(planKey) && o.interval === interval
  );
}

function renderCtaButton({
  isCurrentPlan,
  planKey,
  hasAvailablePrice,
  priceOption,
  defaultPriceId,
  planData,
  setGrowthModalOpen,
}: {
  isCurrentPlan: boolean;
  planKey: PlanKey;
  hasAvailablePrice: boolean;
  priceOption: PricingOption | undefined;
  defaultPriceId: string | undefined;
  planData: (typeof PLAN_FEATURES)[PlanKey];
  setGrowthModalOpen: (open: boolean) => void;
}) {
  if (isCurrentPlan) {
    return (
      <Button variant='secondary' className='w-full' disabled>
        <Check className='mr-2 h-4 w-4' />
        Current Plan
      </Button>
    );
  }
  if (planKey === 'growth') {
    return (
      <Button
        variant='secondary'
        className='w-full'
        onClick={() => setGrowthModalOpen(true)}
      >
        <Sparkles className='mr-2 h-4 w-4' />
        Request Early Access
      </Button>
    );
  }
  if (planKey !== 'free' && hasAvailablePrice) {
    return (
      <UpgradeButton
        priceId={priceOption?.priceId ?? defaultPriceId}
        className='w-full'
        variant={planKey === 'pro' ? 'primary' : 'secondary'}
      >
        Upgrade to {planData.name}
      </UpgradeButton>
    );
  }
  if (planKey !== 'free' && !hasAvailablePrice) {
    return (
      <Button variant='secondary' className='w-full' disabled>
        Coming Soon
      </Button>
    );
  }
  return null;
}

export function PlanComparisonSection({
  pricingOptions,
  currentPlan,
  defaultPriceId,
}: {
  readonly pricingOptions: PricingOption[];
  readonly currentPlan: string | null;
  readonly defaultPriceId: string | undefined;
}) {
  const [billingInterval, setBillingInterval] = useQueryState(
    'interval',
    parseAsStringLiteral(['month', 'year'] as const).withDefault('month')
  );
  const [growthModalOpen, setGrowthModalOpen] = useState(false);
  const activePlan = currentPlan ?? 'free';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: LINEAR_EASE }}
      className='space-y-5'
    >
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-xl font-semibold text-primary-token'>
            Compare Plans
          </h2>
          <p className='text-sm text-secondary-token'>
            Choose the plan that fits your needs
          </p>
        </div>
        <SegmentControl
          value={billingInterval}
          onValueChange={setBillingInterval}
          options={[
            { value: 'month' as const, label: 'Monthly' },
            {
              value: 'year' as const,
              label: (
                <span className='flex items-center gap-1.5'>
                  Yearly
                  <Badge variant='success' size='sm'>
                    Save 17%
                  </Badge>
                </span>
              ),
            },
          ]}
          aria-label='Billing interval'
          size='md'
        />
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {PLAN_KEYS.map(planKey => {
          const planData = PLAN_FEATURES[planKey];
          const isCurrentPlan = activePlan === planKey;
          const priceOption = findPriceForPlan(
            pricingOptions,
            planKey,
            billingInterval
          );

          let priceDisplay: string | null = '$0';
          if (planKey !== 'free') {
            priceDisplay = priceOption
              ? `$${(priceOption.amount / 100).toFixed(0)}`
              : null;
          }

          let intervalLabel = 'forever';
          if (planKey !== 'free') {
            intervalLabel = billingInterval === 'month' ? '/mo' : '/yr';
          }

          const hasAvailablePrice = planKey === 'free' || Boolean(priceOption);

          return (
            <Card
              key={planKey}
              className={cn(
                'relative flex flex-col transition-shadow duration-200',
                isCurrentPlan && 'ring-2 ring-[var(--color-accent)] shadow-md'
              )}
            >
              {isCurrentPlan && (
                <div className='absolute -top-3 left-1/2 z-10 -translate-x-1/2'>
                  <Badge variant='primary' size='sm'>
                    Current Plan
                  </Badge>
                </div>
              )}

              <CardContent className='flex flex-1 flex-col p-6'>
                {/* Plan header */}
                <div>
                  <h3 className='text-lg font-semibold text-primary-token'>
                    {planData.name}
                  </h3>
                  <p className='text-sm text-tertiary-token'>
                    {planData.tagline}
                  </p>
                </div>

                {/* Price */}
                <div className='mt-4 flex items-baseline gap-1'>
                  {priceDisplay !== null ? (
                    <>
                      <span className='text-3xl font-bold text-primary-token'>
                        {priceDisplay}
                      </span>
                      <span className='text-sm text-secondary-token'>
                        {intervalLabel}
                      </span>
                    </>
                  ) : (
                    <span className='text-sm font-medium text-tertiary-token'>
                      Coming soon
                    </span>
                  )}
                </div>

                {/* CTA */}
                <div className='mt-5'>
                  {renderCtaButton({
                    isCurrentPlan,
                    planKey,
                    hasAvailablePrice,
                    priceOption,
                    defaultPriceId,
                    planData,
                    setGrowthModalOpen,
                  })}
                </div>

                {/* Feature list */}
                <Separator className='my-5' />
                <ul className='flex-1 space-y-3'>
                  {planData.features.map(feature => (
                    <li
                      key={feature.label}
                      className='flex items-start gap-2.5 text-sm'
                    >
                      <Check className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400' />
                      <span className='text-secondary-token'>
                        {feature.label}
                        {'detail' in feature && feature.detail && (
                          <span className='ml-1 text-tertiary-token'>
                            ({feature.detail})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <GrowthAccessRequestModal
        open={growthModalOpen}
        onOpenChange={setGrowthModalOpen}
      />
    </motion.div>
  );
}

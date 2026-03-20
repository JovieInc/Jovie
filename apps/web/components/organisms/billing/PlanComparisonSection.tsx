'use client';

import { Badge, Button } from '@jovie/ui';
import { Check, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
  const billingInterval = 'month' as const;
  const [growthModalOpen, setGrowthModalOpen] = useState(false);
  const activePlan = currentPlan ?? 'free';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: LINEAR_EASE }}
      className='space-y-4'
    >
      <ContentSectionHeader
        title='Compare Plans'
        subtitle='Choose the plan that fits your needs.'
        className='min-h-0 px-0 py-0'
      />

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
            <ContentSurfaceCard
              key={planKey}
              className={cn(
                'relative flex flex-col overflow-hidden p-0 transition-[border-color,box-shadow] duration-200',
                isCurrentPlan && 'border-(--linear-border-focus)'
              )}
            >
              {isCurrentPlan && (
                <div className='absolute -top-3 left-1/2 z-10 -translate-x-1/2'>
                  <Badge variant='default' size='sm'>
                    Current Plan
                  </Badge>
                </div>
              )}

              <div className='flex flex-1 flex-col px-4 py-4'>
                <div>
                  <h3 className='text-[15px] font-[590] tracking-[-0.018em] text-primary-token'>
                    {planData.name}
                  </h3>
                  <p className='text-[13px] leading-[18px] text-tertiary-token'>
                    {planData.tagline}
                  </p>
                </div>

                <div className='mt-4 flex items-baseline gap-1'>
                  {priceDisplay === null ? (
                    <span className='text-[13px] font-[510] text-tertiary-token'>
                      Coming soon
                    </span>
                  ) : (
                    <>
                      <span className='text-[28px] font-[620] tracking-[-0.03em] text-primary-token'>
                        {priceDisplay}
                      </span>
                      <span className='text-[13px] text-secondary-token'>
                        {intervalLabel}
                      </span>
                    </>
                  )}
                </div>

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

                <div className='my-5 h-px bg-(--linear-app-frame-seam)' />
                <ul className='flex-1 space-y-3'>
                  {planData.features.map(feature => (
                    <li
                      key={feature.label}
                      className='flex items-start gap-2.5 text-[13px]'
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
              </div>
            </ContentSurfaceCard>
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

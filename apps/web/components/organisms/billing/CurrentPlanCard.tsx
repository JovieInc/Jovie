'use client';

import { Badge } from '@jovie/ui';
import { Crown, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import type { BillingStatusData } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { getPlanDisplayName, LINEAR_EASE } from './billing-constants';

export function CurrentPlanCard({
  billingInfo,
  defaultPriceId,
}: {
  readonly billingInfo: BillingStatusData;
  readonly defaultPriceId: string | undefined;
}) {
  const isPro = billingInfo.isPro;
  const planName = getPlanDisplayName(billingInfo.plan);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05, ease: LINEAR_EASE }}
    >
      <ContentSurfaceCard className='relative overflow-hidden p-0'>
        <div className='flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='flex items-start gap-3.5'>
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white',
                isPro
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                  : 'bg-gradient-to-br from-amber-400 to-orange-500'
              )}
            >
              {isPro ? (
                <Crown className='h-5 w-5' />
              ) : (
                <Sparkles className='h-5 w-5' />
              )}
            </div>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='text-mid font-semibold tracking-[-0.018em] text-primary-token'>
                  {planName} Plan
                </h2>
                <Badge variant={isPro ? 'success' : 'warning'} size='sm'>
                  {isPro ? 'Active' : 'Limited'}
                </Badge>
              </div>
              <p className='mt-1 text-app leading-[18px] text-secondary-token'>
                {isPro
                  ? 'Full access to release notifications, deeper analytics, and fan growth tools.'
                  : 'Upgrade to unlock release notifications, advanced analytics, and more.'}
              </p>
            </div>
          </div>
          <div className='shrink-0'>
            {isPro ? (
              <BillingPortalLink variant='secondary' size='sm' />
            ) : (
              <UpgradeButton priceId={defaultPriceId} size='sm' />
            )}
          </div>
        </div>
      </ContentSurfaceCard>
    </motion.div>
  );
}

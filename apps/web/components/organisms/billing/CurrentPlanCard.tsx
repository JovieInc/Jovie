'use client';

import { Badge, Card, CardContent } from '@jovie/ui';
import { Crown, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
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
      <Card
        className={cn(
          'relative overflow-hidden border-l-4',
          isPro
            ? 'border-l-emerald-500 dark:border-l-emerald-400'
            : 'border-l-amber-500 dark:border-l-amber-400'
        )}
      >
        <CardContent className='p-6'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='flex items-start gap-4'>
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-lg',
                  isPro
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                    : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                )}
              >
                {isPro ? (
                  <Crown className='h-6 w-6' />
                ) : (
                  <Sparkles className='h-6 w-6' />
                )}
              </div>
              <div>
                <div className='flex items-center gap-2.5'>
                  <h2 className='text-xl font-semibold text-primary-token'>
                    {planName} Plan
                  </h2>
                  <Badge variant={isPro ? 'success' : 'warning'} size='sm'>
                    {isPro ? 'Active' : 'Limited'}
                  </Badge>
                </div>
                <p className='mt-1 text-sm text-secondary-token'>
                  {isPro
                    ? 'Full access to all features. Branding removed from your profile.'
                    : 'Upgrade to unlock branding removal, extended analytics, and more.'}
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
        </CardContent>
      </Card>
    </motion.div>
  );
}

'use client';

import { Button } from '@jovie/ui';
import { motion } from 'motion/react';

// Animation constants
const CONTAINER_ANIMATION_DURATION = 0.5;
const CONTAINER_ANIMATION_DELAY = 0.4;

interface PricingCTAProps
  extends Readonly<{
    readonly onUpgrade: () => void;
    readonly isLoading: boolean;
  }> {}

export function PricingCTA({ onUpgrade, isLoading }: PricingCTAProps) {
  return (
    <motion.div
      className='mt-16 rounded-xl border border-subtle p-1 shadow-xl bg-surface-1'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: CONTAINER_ANIMATION_DURATION,
        delay: CONTAINER_ANIMATION_DELAY,
      }}
    >
      <div className='rounded-lg bg-surface-2 px-6 py-8 sm:p-10 sm:pb-12'>
        <div className='grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 items-center'>
          <div>
            <h3 className='text-2xl font-bold tracking-tight text-primary-token'>
              Run Every Release With More Leverage.
            </h3>
            <p className='mt-3 text-base text-secondary-token'>
              Upgrade to Pro for release notifications, deeper analytics, and
              stronger fan ownership.
            </p>
          </div>
          <div className='flex justify-end'>
            <Button
              onClick={onUpgrade}
              loading={isLoading}
              size='lg'
              className='px-6 text-base'
            >
              {isLoading ? 'Processing...' : 'Upgrade to Pro →'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

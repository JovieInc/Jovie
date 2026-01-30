'use client';

import { motion } from 'motion/react';

// Animation constants
const CONTAINER_ANIMATION_DURATION = 0.5;
const CONTAINER_ANIMATION_DELAY = 0.4;
const BUTTON_HOVER_SCALE = 1.02;
const BUTTON_TAP_SCALE = 0.98;

interface PricingCTAProps
  extends Readonly<{
    onUpgrade: () => void;
    isLoading: boolean;
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
              Make it yours.
            </h3>
            <p className='mt-3 text-base text-secondary-token'>
              Remove the Jovie branding for just $5. That's it.
            </p>
          </div>
          <div className='flex justify-end'>
            <motion.button
              onClick={onUpgrade}
              disabled={isLoading}
              className='inline-flex items-center justify-center rounded-md px-6 py-3 text-base font-medium transition-all duration-200 cursor-pointer bg-btn-primary text-btn-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed'
              whileHover={{ scale: BUTTON_HOVER_SCALE }}
              whileTap={{ scale: BUTTON_TAP_SCALE }}
            >
              {isLoading ? 'Processing...' : 'Remove branding →'}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

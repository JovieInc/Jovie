'use client';

import { motion } from 'motion/react';
import { getPlanDisplayName, LINEAR_EASE } from './billing-constants';

export function BillingHeader({ plan }: { readonly plan: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: LINEAR_EASE }}
    >
      <h1 className='text-3xl font-bold tracking-tight text-primary-token'>
        Billing
      </h1>
      <p className='mt-2 text-secondary-token'>
        Manage your {getPlanDisplayName(plan)} plan, compare options, and review
        billing history.
      </p>
    </motion.div>
  );
}

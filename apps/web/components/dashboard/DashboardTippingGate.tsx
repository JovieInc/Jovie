'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { DashboardTipping } from '@/components/dashboard/DashboardTipping';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

export function DashboardTippingGate() {
  const tippingGate = useFeatureGate(STATSIG_FLAGS.TIPPING);

  if (!tippingGate.value) {
    return (
      <div className='flex items-center justify-center'>
        <div className='w-full max-w-lg rounded-xl border border-subtle bg-surface-1 p-6 text-center shadow-sm'>
          <h1 className='mb-3 text-2xl font-semibold text-primary-token'>
            Tipping is not available yet
          </h1>
          <p className='text-secondary-token'>
            We&apos;re focusing on getting the core Jovie profile experience
            right before launching tipping.
          </p>
        </div>
      </div>
    );
  }

  return <DashboardTipping />;
}

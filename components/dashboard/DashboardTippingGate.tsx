'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { DashboardTipping } from '@/components/dashboard/DashboardTipping';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

export function DashboardTippingGate() {
  const tippingGate = useFeatureGate(STATSIG_FLAGS.TIPPING);

  if (!tippingGate.value) {
    return (
      <div className='text-center'>
        <h1 className='text-2xl font-semibold text-gray-900 dark:text-white mb-4'>
          Tipping is not available yet
        </h1>
        <p className='text-gray-600 dark:text-white/70'>
          We&apos;re focusing on getting the core Jovie profile experience right
          before launching tipping.
        </p>
      </div>
    );
  }

  return <DashboardTipping />;
}

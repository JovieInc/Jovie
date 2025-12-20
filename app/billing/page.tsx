'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { page } from '@/lib/analytics';

const BillingDashboard = dynamic(
  () =>
    import('@/components/organisms/BillingDashboard').then(mod => ({
      default: mod.BillingDashboard,
    })),
  {
    loading: () => (
      <div className='space-y-6'>
        <div className='h-64 animate-pulse rounded-lg bg-surface-1' />
        <div className='h-48 animate-pulse rounded-lg bg-surface-1' />
      </div>
    ),
    ssr: false,
  }
);

export default function BillingPage() {
  useEffect(() => {
    page('billing_dashboard', {
      page_type: 'billing',
      section: 'dashboard',
    });
  }, []);

  return <BillingDashboard />;
}

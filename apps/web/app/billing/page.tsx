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
      <div className='space-y-8'>
        <div className='space-y-3'>
          <div className='h-9 w-48 skeleton rounded-md' />
          <div className='h-5 w-80 skeleton rounded-sm' />
        </div>
        <div className='h-36 w-full skeleton rounded-2xl' />
        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <div className='h-80 skeleton rounded-2xl' />
          <div className='h-80 skeleton rounded-2xl' />
          <div className='h-80 skeleton rounded-2xl' />
        </div>
        <div className='h-20 skeleton rounded-2xl' />
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

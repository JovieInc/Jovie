'use client';

import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import Link from 'next/link';
import { useEffect } from 'react';
import { page, track } from '@/lib/analytics';

export default function CheckoutSuccessPage() {
  useEffect(() => {
    // Track successful subscription
    track('subscription_success', {
      flow_type: 'checkout',
      page: 'success',
    });

    page('checkout_success', {
      page_type: 'billing',
      section: 'success',
      conversion: true,
    });
  }, []);
  return (
    <div className='bg-base px-4 py-12 sm:py-16'>
      <div className='mx-auto w-full max-w-[560px] text-center'>
        <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/5 dark:shadow-[0_16px_50px_rgba(0,0,0,0.55)] dark:ring-white/5 sm:p-8'>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2'>
            <CheckCircleIcon className='h-6 w-6 text-accent' />
          </div>

          <h1 className='mt-5 text-balance text-2xl font-semibold text-primary-token sm:text-3xl'>
            Welcome to Pro!
          </h1>

          <p className='mt-2 text-sm text-secondary-token sm:text-base'>
            Your subscription has been activated successfully.
          </p>

          <div className='mt-6 flex flex-col justify-center gap-3 sm:flex-row'>
            <Button asChild>
              <Link href='/app/dashboard'>Go to Dashboard</Link>
            </Button>
            <Button variant='outline' asChild>
              <Link href='/billing'>View Billing</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { XCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useEffect } from 'react';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { Button } from '@/components/ui/Button';
import { page, track } from '@/lib/analytics';

export default function CheckoutCancelPage() {
  useEffect(() => {
    // Track checkout cancellation
    track('checkout_cancelled', {
      flow_type: 'checkout',
      page: 'cancel',
    });

    page('checkout_cancel', {
      page_type: 'billing',
      section: 'cancel',
      conversion: false,
    });
  }, []);
  return (
    <div className='text-center'>
      <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900'>
        <XCircleIcon className='h-8 w-8 text-yellow-600 dark:text-yellow-400' />
      </div>

      <h1 className='mt-6 text-3xl font-bold text-gray-900 dark:text-white'>
        Checkout Cancelled
      </h1>

      <p className='mt-4 text-lg text-gray-600 dark:text-gray-400'>
        No worries! Your subscription wasn&apos;t charged.
      </p>

      <p className='mt-2 text-sm text-gray-500 dark:text-gray-500'>
        You can try again anytime or continue using Jovie with the free
        features.
      </p>

      <div className='mt-8 flex flex-col sm:flex-row gap-4 justify-center'>
        <UpgradeButton>Try Again</UpgradeButton>

        <Button variant='outline' as={Link} href='/dashboard'>
          Back to Dashboard
        </Button>
      </div>

      <div className='mt-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'>
        <h3 className='text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
          Still have questions?
        </h3>
        <p className='text-sm text-gray-600 dark:text-gray-400'>
          Check out our{' '}
          <Link
            href='/pricing'
            className='text-blue-600 dark:text-blue-400 hover:underline'
          >
            pricing page
          </Link>{' '}
          or{' '}
          <Link
            href='/support'
            className='text-blue-600 dark:text-blue-400 hover:underline'
          >
            contact support
          </Link>{' '}
          if you need help.
        </p>
      </div>
    </div>
  );
}

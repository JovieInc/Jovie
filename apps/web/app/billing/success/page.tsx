'use client';

import { Button } from '@jovie/ui';
import { CheckCircle } from 'lucide-react';
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
    <div className='flex min-h-[calc(100dvh-4rem)] items-center justify-center'>
      <div className='w-full text-center'>
        <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success-subtle)]'>
          <CheckCircle className='h-8 w-8 text-[var(--color-success)]' />
        </div>

        <h1 className='mt-6 text-3xl font-bold text-primary-token'>
          You&apos;ve been upgraded.
        </h1>

        <p className='mt-4 text-lg text-secondary-token'>
          Your subscription is active and your profile is now branding-free.
        </p>

        <div className='mt-8 flex justify-center'>
          <Button asChild>
            <Link href='/app'>Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

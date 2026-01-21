'use client';

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
    <div className='flex min-h-[calc(100vh-4rem)] items-center justify-center'>
      <div className='w-full text-center'>
        <h1 className='mt-6 text-3xl font-bold text-foreground'>
          You&apos;ve been upgraded.
        </h1>

        <p className='mt-4 text-lg text-muted-foreground'>
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

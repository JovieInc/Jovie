'use client';

import { Button } from '@jovie/ui';
import { XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
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
    <div className='flex min-h-[calc(100vh-4rem)] items-center justify-center'>
      <div className='w-full text-center'>
        <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15'>
          <XCircle className='h-8 w-8 text-amber-500' />
        </div>

        <h1 className='mt-6 text-3xl font-bold text-foreground'>
          Checkout cancelled
        </h1>

        <p className='mt-4 text-lg text-muted-foreground'>
          No worries. Your subscription wasn&apos;t charged.
        </p>

        <div className='mt-8 flex flex-col sm:flex-row gap-4 justify-center'>
          <UpgradeButton>Try again</UpgradeButton>

          <Button variant='outline' asChild>
            <Link href='/app'>Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

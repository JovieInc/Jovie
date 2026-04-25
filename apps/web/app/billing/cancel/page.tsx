'use client';

import { Button } from '@jovie/ui';
import { XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';
import { page, track } from '@/lib/analytics';

export default function CheckoutCancelPage() {
  useEffect(() => {
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
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title='Checkout cancelled'
          subtitle="No worries. Your subscription wasn't charged."
        />

        <div className='space-y-5 px-5 py-5 text-center sm:px-6'>
          <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--linear-warning)_32%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-warning)_10%,var(--linear-app-content-surface))]'>
            <XCircle className='h-7 w-7 text-[var(--linear-warning)]' />
          </div>

          <p className='text-app leading-5 text-secondary-token'>
            You can come back at any time and restart checkout when you&apos;re
            ready.
          </p>

          <div className='flex flex-col gap-2 sm:flex-row'>
            <UpgradeButton
              className='w-full sm:flex-1 [&_button]:w-full'
              size='lg'
            >
              Try again
            </UpgradeButton>
            <Button asChild variant='secondary' size='lg' className='flex-1'>
              <Link href={APP_ROUTES.DASHBOARD}>Back to dashboard</Link>
            </Button>
          </div>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}

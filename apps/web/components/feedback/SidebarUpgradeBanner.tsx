'use client';

import { BadgeCheck } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { track } from '@/lib/analytics';
import {
  formatVerifiedPriceLabel,
  getPreferredVerifiedPrice,
} from '@/lib/billing/verified-upgrade';
import { env } from '@/lib/env-client';
import {
  useBillingStatusQuery,
  useCheckoutMutation,
  usePricingOptionsQuery,
} from '@/lib/queries';

export function SidebarUpgradeBanner() {
  const isPassiveRuntime = env.IS_TEST || env.IS_E2E;

  const billingStatus = useBillingStatusQuery({ enabled: !isPassiveRuntime });
  const pricing = usePricingOptionsQuery({ enabled: !isPassiveRuntime });
  const checkoutMutation = useCheckoutMutation();

  const selectedPrice = useMemo(
    () => getPreferredVerifiedPrice(pricing.data?.options ?? []),
    [pricing.data?.options]
  );

  const priceLabel = useMemo(
    () => formatVerifiedPriceLabel(selectedPrice),
    [selectedPrice]
  );

  const handleUpgrade = useCallback(async () => {
    if (!selectedPrice?.priceId || checkoutMutation.isPending) return;

    track('billing_upgrade_clicked', {
      surface: 'sidebar_upgrade_banner',
      placement: 'sidebar_bottom',
    });

    const checkout = await checkoutMutation.mutateAsync({
      priceId: selectedPrice.priceId,
    });

    track('billing_upgrade_checkout_redirected', {
      surface: 'sidebar_upgrade_banner',
      placement: 'sidebar_bottom',
      interval: selectedPrice.interval,
    });

    globalThis.location.href = checkout.url;
  }, [checkoutMutation, selectedPrice]);

  if (
    isPassiveRuntime ||
    billingStatus.isLoading ||
    billingStatus.data?.isPro
  ) {
    return null;
  }

  return (
    <div className='group-data-[collapsible=icon]:hidden px-2 pb-1'>
      <div className='rounded-[10px] border border-sidebar-border/70 bg-sidebar-accent/35 p-2 shadow-none'>
        <div className='flex items-start gap-2'>
          <BadgeCheck className='mt-0.5 size-3.5 shrink-0 text-sidebar-item-icon' />
          <div className='min-w-0'>
            <p className='text-[12px] font-medium tracking-[-0.01em] text-sidebar-item-foreground'>
              Get Verified — {priceLabel}
            </p>
            <p className='mt-0.5 text-[10px] leading-[1.35] text-sidebar-muted'>
              Stand out with trusted verification.
            </p>
            <button
              type='button'
              onClick={() => handleUpgrade()}
              disabled={!selectedPrice?.priceId || checkoutMutation.isPending}
              className='mt-1.5 inline-flex h-6 items-center rounded-[7px] border border-sidebar-border/60 px-2 text-2xs font-medium text-sidebar-item-foreground transition-colors duration-normal hover:bg-sidebar-accent-active disabled:cursor-not-allowed disabled:opacity-60'
            >
              {checkoutMutation.isPending ? 'Opening…' : 'Upgrade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

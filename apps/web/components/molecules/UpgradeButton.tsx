'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FEATURE_FLAGS, track, useFeatureFlag } from '@/lib/analytics';
import { useCheckoutMutation } from '@/lib/queries';

interface UpgradeButtonProps {
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly variant?: 'primary' | 'secondary' | 'outline';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly priceId?: string; // Default price ID for direct checkout
}

export function UpgradeButton({
  className,
  children = 'Upgrade to Standard',
  variant = 'primary',
  size = 'md',
  priceId,
}: UpgradeButtonProps) {
  const router = useRouter();
  const checkoutMutation = useCheckoutMutation();

  // Check if direct upgrade is enabled
  const directUpgradeEnabled = useFeatureFlag(
    FEATURE_FLAGS.BILLING_UPGRADE_DIRECT,
    false
  );

  const handleClick = () => {
    // Track upgrade button click
    track('upgrade_button_clicked', {
      flow_type:
        directUpgradeEnabled && priceId
          ? 'direct_checkout'
          : 'billing_remove_branding',
      price_id: priceId || null,
      feature_flag_enabled: directUpgradeEnabled,
    });

    if (directUpgradeEnabled && priceId) {
      // Direct checkout flow - skip pricing page
      track('checkout_initiated', {
        flow_type: 'direct',
        price_id: priceId,
      });

      checkoutMutation.mutate(
        { priceId },
        {
          onSuccess: data => {
            track('checkout_redirect', {
              flow_type: 'direct',
              price_id: priceId,
            });
            // Redirect to Stripe checkout
            window.location.href = data.url;
          },
          onError: error => {
            const errorMessage =
              error instanceof Error
                ? error.message
                : 'Failed to create checkout session';
            track('checkout_failed', {
              flow_type: 'direct',
              price_id: priceId,
              error: errorMessage,
            });
          },
        }
      );
    } else {
      // Traditional flow - redirect to billing remove-branding route
      track('pricing_page_redirect', {
        flow_type: 'traditional',
      });
      router.push('/billing/remove-branding');
    }
  };

  const mappedSize: ButtonProps['size'] = size === 'md' ? 'default' : size;
  const isLoading = checkoutMutation.isPending;
  const error = checkoutMutation.error;

  return (
    <div className={className}>
      <Button
        onClick={handleClick}
        disabled={isLoading}
        variant={variant}
        size={mappedSize}
        className='inline-flex items-center gap-2'
      >
        <Rocket className='h-4 w-4' />
        {isLoading ? 'Loading...' : children}
      </Button>
      {error && (
        <p className='mt-2 text-sm text-red-600 dark:text-red-400'>
          {error instanceof Error ? error.message : 'Failed to start checkout'}
        </p>
      )}
    </div>
  );
}

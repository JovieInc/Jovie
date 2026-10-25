'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { Rocket } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { resolveCheckoutReturnFeature } from '@/app/billing/success/checkout-success-state';
import { APP_ROUTES } from '@/constants/routes';
import { track, useFeatureFlag } from '@/lib/analytics';
import { PRO_PLAN_DISPLAY_NAME } from '@/lib/config/plan-prices';
import { useCheckoutMutation } from '@/lib/queries';

interface UpgradeButtonProps {
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly variant?: 'primary' | 'secondary' | 'outline';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly priceId?: string; // Default price ID for direct checkout
  /**
   * Feature route that triggered the upgrade (JOV-9035). The checkout return
   * lands back on it when it is on the allowlist. Defaults to the current
   * pathname when that is itself an allowlisted feature route.
   */
  readonly from?: string;
}

export function UpgradeButton({
  className,
  children = `Upgrade to ${PRO_PLAN_DISPLAY_NAME}`,
  variant = 'primary',
  size = 'md',
  priceId,
  from,
}: UpgradeButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const checkoutMutation = useCheckoutMutation();

  // Check if direct upgrade is enabled
  const directUpgradeEnabled = useFeatureFlag('BILLING_UPGRADE_DIRECT');

  const fromFeature = from ?? resolveCheckoutReturnFeature(pathname);
  const isLoading = checkoutMutation.isPending;
  const error = checkoutMutation.error;

  const handleClick = () => {
    if (isLoading) return;

    // Track upgrade button click
    track('upgrade_button_clicked', {
      flow_type:
        directUpgradeEnabled && priceId ? 'direct_checkout' : 'pricing_page',
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
        { priceId, from: fromFeature },
        {
          onSuccess: data => {
            track('checkout_redirect', {
              flow_type: 'direct',
              price_id: priceId,
            });
            // Redirect to Stripe checkout
            globalThis.location.href = data.url;
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
      // Traditional flow - redirect to pricing
      track('pricing_page_redirect', {
        flow_type: 'traditional',
      });
      router.push(APP_ROUTES.PRICING);
    }
  };

  const mappedSize: ButtonProps['size'] = size === 'md' ? 'default' : size;

  return (
    <div className={className}>
      {/*
       * JOV-9035 pay-button moment: the morph presentation reserves the
       * label footprint across idle/pending/error, so the pill's bounding
       * box never jumps while the checkout session is created. The atom owns
       * the single status region, keeps the accessible name stable, blocks
       * duplicate submits, and skips decorative motion for key presses.
       */}
      <Button
        onClick={handleClick}
        pendingPresentation='morph'
        actionState={error ? 'error' : 'idle'}
        loading={isLoading}
        stateLabels={{
          pending: 'Opening checkout',
          success: 'Complete',
          error: 'Could not start checkout',
          retry: 'Try again',
        }}
        variant={variant}
        size={mappedSize}
        className='inline-flex items-center gap-2'
      >
        <Rocket className='h-4 w-4' aria-hidden='true' />
        {children}
      </Button>
      {error ? (
        <p className='mt-2 text-sm text-destructive' role='alert'>
          {error instanceof Error ? error.message : 'Failed to start checkout'}
        </p>
      ) : null}
    </div>
  );
}

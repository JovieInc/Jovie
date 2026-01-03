'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FEATURE_FLAGS, track, useFeatureFlag } from '@/lib/analytics';

interface UpgradeButtonProps {
  className?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  priceId?: string; // Default price ID for direct checkout
}

export function UpgradeButton({
  className,
  children = 'Upgrade to Standard',
  variant = 'primary',
  size = 'md',
  priceId,
}: UpgradeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if direct upgrade is enabled
  const directUpgradeEnabled = useFeatureFlag(
    FEATURE_FLAGS.BILLING_UPGRADE_DIRECT,
    false
  );

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    // Validate priceId if direct upgrade is enabled
    if (directUpgradeEnabled && !priceId) {
      setError('Price ID is required for direct checkout');
      setLoading(false);
      return;
    }

    try {
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

        const response = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ priceId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          track('checkout_failed', {
            flow_type: 'direct',
            price_id: priceId,
            error: errorData.error || 'Unknown error',
          });
          throw new Error(
            errorData.error || 'Failed to create checkout session'
          );
        }

        const { url } = await response.json();

        track('checkout_redirect', {
          flow_type: 'direct',
          price_id: priceId,
        });

        // Redirect to Stripe checkout
        window.location.href = url;
      } else {
        // Traditional flow - redirect to billing remove-branding route
        track('pricing_page_redirect', {
          flow_type: 'traditional',
        });
        router.push('/billing/remove-branding');
      }
    } catch (err) {
      console.error('Error starting upgrade flow:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to start upgrade';
      setError(errorMessage);

      track('upgrade_flow_error', {
        flow_type:
          directUpgradeEnabled && priceId ? 'direct_checkout' : 'pricing_page',
        error: errorMessage,
        price_id: priceId || null,
      });
    } finally {
      setLoading(false);
    }
  };

  const mappedSize: ButtonProps['size'] = size === 'md' ? 'default' : size;

  return (
    <div className={className}>
      <Button
        onClick={handleClick}
        disabled={loading}
        variant={variant}
        size={mappedSize}
        className='inline-flex items-center gap-2'
      >
        <Rocket className='h-4 w-4' />
        {loading ? 'Loading...' : children}
      </Button>
      {error && (
        <p className='mt-2 text-sm text-red-600 dark:text-red-400'>{error}</p>
      )}
    </div>
  );
}

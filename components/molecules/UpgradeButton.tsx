'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { useFeatureFlag } from '@/lib/analytics';
import { FEATURE_FLAGS } from '@/lib/analytics';

interface UpgradeButtonProps {
  className?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  priceId?: string; // Default price ID for direct checkout
}

export function UpgradeButton({
  className,
  children = 'Upgrade to Pro',
  variant = 'primary',
  size = 'md',
  priceId,
}: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Check if direct upgrade is enabled
  const directUpgradeEnabled = useFeatureFlag(FEATURE_FLAGS.BILLING_UPGRADE_DIRECT, false);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      if (directUpgradeEnabled && priceId) {
        // Direct checkout flow - skip pricing page
        const response = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ priceId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create checkout session');
        }

        const { url } = await response.json();
        
        // Redirect to Stripe checkout
        window.location.href = url;
      } else {
        // Traditional flow - redirect to pricing page
        window.location.href = '/pricing';
      }
    } catch (err) {
      console.error('Error starting upgrade flow:', err);
      setError(err instanceof Error ? err.message : 'Failed to start upgrade');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <Button
        onClick={handleClick}
        disabled={loading}
        variant={variant}
        size={size}
        className="inline-flex items-center gap-2"
      >
        <RocketLaunchIcon className="h-4 w-4" />
        {loading ? 'Loading...' : children}
      </Button>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

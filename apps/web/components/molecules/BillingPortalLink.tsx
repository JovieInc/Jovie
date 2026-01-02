'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import { track } from '@/lib/analytics';

interface BillingPortalLinkProps {
  className?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export function BillingPortalLink({
  className,
  children = 'Manage Billing',
  variant = 'outline',
  size = 'md',
}: BillingPortalLinkProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      // Track billing portal access attempt
      track('billing_portal_clicked', {
        source: 'billing_dashboard',
      });

      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.error || 'Failed to create billing portal session';

        track('billing_portal_failed', {
          error: errorMessage,
          source: 'billing_dashboard',
        });

        throw new Error(errorMessage);
      }

      const { url } = await response.json();

      track('billing_portal_redirect', {
        source: 'billing_dashboard',
      });

      // Redirect to Stripe billing portal
      window.location.href = url;
    } catch (err) {
      console.error('Error accessing billing portal:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to access billing portal';
      setError(errorMessage);

      track('billing_portal_error', {
        error: errorMessage,
        source: 'billing_dashboard',
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
        <CreditCard className='h-4 w-4' />
        {loading ? 'Loading...' : children}
      </Button>
      {error && (
        <p className='mt-2 text-sm text-red-600 dark:text-red-400'>{error}</p>
      )}
    </div>
  );
}

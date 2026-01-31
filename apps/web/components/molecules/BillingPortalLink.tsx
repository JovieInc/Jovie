'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { CreditCard } from 'lucide-react';
import { track } from '@/lib/analytics';
import { usePortalMutation } from '@/lib/queries';

interface BillingPortalLinkProps {
  readonly className?: string;
  readonly children?: React.ReactNode;
  readonly variant?: 'primary' | 'secondary' | 'outline';
  readonly size?: 'sm' | 'md' | 'lg';
}

export function BillingPortalLink({
  className,
  children = 'Manage Billing',
  variant = 'outline',
  size = 'md',
}: BillingPortalLinkProps) {
  const portalMutation = usePortalMutation();

  const handleClick = () => {
    // Track billing portal access attempt
    track('billing_portal_clicked', {
      source: 'billing_dashboard',
    });

    portalMutation.mutate(undefined, {
      onSuccess: data => {
        track('billing_portal_redirect', {
          source: 'billing_dashboard',
        });
        // Redirect to Stripe billing portal
        globalThis.location.href = data.url;
      },
      onError: error => {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to access billing portal';
        track('billing_portal_error', {
          error: errorMessage,
          source: 'billing_dashboard',
        });
      },
    });
  };

  const mappedSize: ButtonProps['size'] = size === 'md' ? 'default' : size;
  const isLoading = portalMutation.isPending;
  const error = portalMutation.error;

  return (
    <div className={className}>
      <Button
        onClick={handleClick}
        disabled={isLoading}
        variant={variant}
        size={mappedSize}
        className='inline-flex items-center gap-2'
      >
        <CreditCard className='h-4 w-4' />
        {isLoading ? 'Loading...' : children}
      </Button>
      {error && (
        <p className='mt-2 text-sm text-red-600 dark:text-red-400'>
          {error instanceof Error
            ? error.message
            : 'Failed to access billing portal'}
        </p>
      )}
    </div>
  );
}

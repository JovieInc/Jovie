'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CreditCardIcon } from '@heroicons/react/24/outline';

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
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create billing portal session');
      }

      const { url } = await response.json();
      
      // Redirect to Stripe billing portal
      window.location.href = url;
    } catch (err) {
      console.error('Error accessing billing portal:', err);
      setError(err instanceof Error ? err.message : 'Failed to access billing portal');
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
        <CreditCardIcon className="h-4 w-4" />
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

'use client';

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useState } from 'react';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { useNotifications } from '@/lib/hooks/useNotifications';

interface BillingInfo {
  isPro: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export function BillingDashboard() {
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [defaultPriceId, setDefaultPriceId] = useState<string | undefined>(
    undefined
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { error: notifyError } = useNotifications();

  const fetchBillingInfo = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // Fetch billing status and pricing options in parallel
      const [billingResponse, pricingResponse] = await Promise.all([
        fetch('/api/billing/status'),
        fetch('/api/stripe/pricing-options'),
      ]);

      if (!billingResponse.ok) {
        throw new Error('Failed to fetch billing status');
      }

      const billingData = await billingResponse.json();
      setBillingInfo(billingData);

      // Get default price ID from pricing options
      if (pricingResponse.ok) {
        const pricingData = await pricingResponse.json();
        const firstPriceId =
          pricingData.pricingOptions?.[0]?.priceId ||
          pricingData.options?.[0]?.priceId;
        if (firstPriceId) {
          setDefaultPriceId(firstPriceId);
        }
      }
    } catch (err) {
      console.error('Error fetching billing info:', err);
      setBillingInfo(null);
      setErrorMessage(
        'We could not load your billing details. Please retry or visit the portal once the connection is restored.'
      );
      notifyError('Billing is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    fetchBillingInfo();
  }, [fetchBillingInfo]);

  if (loading) {
    return (
      <div className='animate-pulse motion-reduce:animate-none'>
        <div className='mb-4 h-8 rounded bg-muted'></div>
        <div className='mb-4 h-32 rounded bg-muted'></div>
        <div className='h-10 rounded bg-muted'></div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <ErrorBanner
        title='Billing is temporarily unavailable'
        description={errorMessage}
        actions={[
          { label: 'Retry', onClick: fetchBillingInfo },
          { label: 'Contact support', href: '/support' },
        ]}
        testId='billing-error-state'
      />
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-3xl font-bold text-foreground'>
          Billing & Subscription
        </h1>
        <p className='mt-2 text-muted-foreground'>
          Manage your subscription and billing information
        </p>
      </div>

      {/* Subscription Status Card */}
      <div className='rounded-lg border border-border bg-muted/30 p-6'>
        <div className='flex items-center'>
          <div className='shrink-0'>
            {billingInfo?.isPro ? (
              <CheckCircleIcon className='h-8 w-8 text-emerald-500' />
            ) : (
              <ExclamationTriangleIcon className='h-8 w-8 text-amber-500' />
            )}
          </div>
          <div className='ml-4'>
            <h3 className='text-lg font-medium text-foreground'>
              {billingInfo?.isPro
                ? 'Standard Subscription Active'
                : 'Free Plan'}
            </h3>
            <p className='text-sm text-muted-foreground'>
              {billingInfo?.isPro
                ? 'Branding is removed from your profile'
                : 'Upgrade to Standard to remove branding'}
            </p>
            {billingInfo?.stripeSubscriptionId && (
              <p className='mt-1 text-xs text-muted-foreground'>
                Subscription ID: {billingInfo.stripeSubscriptionId}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className='rounded-lg border border-border bg-muted/30 p-6'>
        <h3 className='mb-4 text-lg font-medium text-foreground'>
          Billing Actions
        </h3>

        <div className='space-y-4'>
          {billingInfo?.isPro ? (
            <>
              <div>
                <h4 className='mb-2 text-sm font-medium text-foreground'>
                  Manage Subscription
                </h4>
                <p className='mb-3 text-sm text-muted-foreground'>
                  Update payment methods, view invoices, or cancel your
                  subscription
                </p>
                <BillingPortalLink />
              </div>
            </>
          ) : (
            <>
              <div>
                <h4 className='mb-2 text-sm font-medium text-foreground'>
                  Upgrade to Standard
                </h4>
                <p className='mb-3 text-sm text-muted-foreground'>
                  Remove Jovie branding from your profile
                </p>
                <UpgradeButton priceId={defaultPriceId} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Features Overview */}
      <div className='rounded-lg border border-border bg-muted/30 p-6'>
        <h3 className='mb-4 text-lg font-medium text-foreground'>
          Standard Features
        </h3>
        <ul className='space-y-2 text-sm text-muted-foreground'>
          <li className='flex items-center'>
            <CheckCircleIcon className='mr-2 h-4 w-4 text-emerald-500' />
            Remove Jovie branding
          </li>
        </ul>
      </div>
    </div>
  );
}

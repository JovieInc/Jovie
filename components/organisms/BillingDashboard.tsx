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
import { getActivePriceIds } from '@/lib/stripe/config';

interface BillingInfo {
  isPro: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export function BillingDashboard() {
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { error: notifyError } = useNotifications();

  const fetchBillingInfo = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/billing/status');
      if (!response.ok) {
        throw new Error('Failed to fetch billing status');
      }

      const data = await response.json();
      setBillingInfo(data);
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
      <div className='animate-pulse'>
        <div className='h-8 bg-gray-200 dark:bg-gray-700 rounded mb-4'></div>
        <div className='h-32 bg-gray-200 dark:bg-gray-700 rounded mb-4'></div>
        <div className='h-10 bg-gray-200 dark:bg-gray-700 rounded'></div>
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

  const activePriceIds = getActivePriceIds();
  const defaultPriceId = activePriceIds[0]; // Use first active price as default

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
          Billing & Subscription
        </h1>
        <p className='mt-2 text-gray-600 dark:text-gray-400'>
          Manage your subscription and billing information
        </p>
      </div>

      {/* Subscription Status Card */}
      <div className='bg-white dark:bg-gray-800 shadow rounded-lg p-6'>
        <div className='flex items-center'>
          <div className='shrink-0'>
            {billingInfo?.isPro ? (
              <CheckCircleIcon className='h-8 w-8 text-green-500' />
            ) : (
              <ExclamationTriangleIcon className='h-8 w-8 text-yellow-500' />
            )}
          </div>
          <div className='ml-4'>
            <h3 className='text-lg font-medium text-gray-900 dark:text-white'>
              {billingInfo?.isPro
                ? 'Standard Subscription Active'
                : 'Free Plan'}
            </h3>
            <p className='text-sm text-gray-600 dark:text-gray-400'>
              {billingInfo?.isPro
                ? 'Branding is removed from your profile'
                : 'Upgrade to Standard to remove branding'}
            </p>
            {billingInfo?.stripeSubscriptionId && (
              <p className='text-xs text-gray-500 dark:text-gray-500 mt-1'>
                Subscription ID: {billingInfo.stripeSubscriptionId}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className='bg-white dark:bg-gray-800 shadow rounded-lg p-6'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
          Billing Actions
        </h3>

        <div className='space-y-4'>
          {billingInfo?.isPro ? (
            <>
              <div>
                <h4 className='text-sm font-medium text-gray-900 dark:text-white mb-2'>
                  Manage Subscription
                </h4>
                <p className='text-sm text-gray-600 dark:text-gray-400 mb-3'>
                  Update payment methods, view invoices, or cancel your
                  subscription
                </p>
                <BillingPortalLink />
              </div>
            </>
          ) : (
            <>
              <div>
                <h4 className='text-sm font-medium text-gray-900 dark:text-white mb-2'>
                  Upgrade to Standard
                </h4>
                <p className='text-sm text-gray-600 dark:text-gray-400 mb-3'>
                  Remove Jovie branding from your profile
                </p>
                <UpgradeButton priceId={defaultPriceId} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Features Overview */}
      <div className='bg-white dark:bg-gray-800 shadow rounded-lg p-6'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
          Standard Features
        </h3>
        <ul className='space-y-2 text-sm text-gray-600 dark:text-gray-400'>
          <li className='flex items-center'>
            <CheckCircleIcon className='h-4 w-4 text-green-500 mr-2' />
            Remove Jovie branding
          </li>
        </ul>
      </div>
    </div>
  );
}

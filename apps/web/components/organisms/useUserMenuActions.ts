'use client';

import type { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  useCheckoutMutation,
  usePortalMutation,
  usePricingOptionsQuery,
} from '@/lib/queries';
import type { BillingStatus } from './user-button/useUserButton';

type ClerkSignOut = ReturnType<typeof useClerk>['signOut'];

const ANALYTICS_CONTEXT = {
  surface: 'sidebar_user_menu',
} as const;

export interface UserMenuLoadingState {
  signOut: boolean;
  manageBilling: boolean;
  upgrade: boolean;
  any: boolean;
}

interface UseUserMenuActionsParams {
  billingStatus: BillingStatus;
  profileUrl?: string;
  settingsUrl?: string;
  redirectToUrl: (url: string) => void;
  signOut: ClerkSignOut;
}

export function useUserMenuActions({
  billingStatus,
  profileUrl,
  settingsUrl,
  redirectToUrl,
  signOut,
}: UseUserMenuActionsParams) {
  const notifications = useNotifications();
  const router = useRouter();
  const [signOutLoading, setSignOutLoading] = useState(false);

  // TanStack Query for pricing options (pre-fetched for faster checkout)
  const { data: pricingData, refetch: fetchPricing } = usePricingOptionsQuery();

  // TanStack Query mutations for Stripe operations
  const checkoutMutation = useCheckoutMutation();
  const portalMutation = usePortalMutation();

  const derivedLoading = useMemo<UserMenuLoadingState>(
    () => ({
      signOut: signOutLoading,
      manageBilling: portalMutation.isPending,
      upgrade: checkoutMutation.isPending,
      any:
        signOutLoading ||
        portalMutation.isPending ||
        checkoutMutation.isPending,
    }),
    [signOutLoading, portalMutation.isPending, checkoutMutation.isPending]
  );

  const navigateTo = (href?: string) => {
    if (!href) return;
    router.push(href);
  };

  const handleProfile = () => navigateTo(profileUrl);
  const handleSettings = () => navigateTo(settingsUrl);

  const handleSignOut = async () => {
    if (derivedLoading.signOut) return;

    setSignOutLoading(true);
    try {
      await signOut({ redirectUrl: '/' });
    } catch (error) {
      console.error('Sign out error:', error);
      notifications.error("Couldn't sign you out. Please try again.");
      setSignOutLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (derivedLoading.upgrade) return;

    try {
      track('billing_upgrade_clicked', {
        ...ANALYTICS_CONTEXT,
        plan: billingStatus.plan ?? 'unknown',
      });

      // Use cached data or fetch pricing options
      let pricing = pricingData;
      if (!pricing?.pricingOptions?.length) {
        const result = await fetchPricing();
        pricing = result.data;
      }

      const monthPrice = pricing?.pricingOptions?.find(
        option => option.interval === 'month'
      );

      if (!monthPrice?.priceId) {
        throw new TypeError('Monthly pricing option missing');
      }

      // Use TanStack Query mutation for checkout
      const checkout = await checkoutMutation.mutateAsync({
        priceId: monthPrice.priceId,
      });

      if (!checkout.url) {
        throw new TypeError('Checkout URL missing from response');
      }

      track('billing_upgrade_checkout_redirected', {
        ...ANALYTICS_CONTEXT,
        interval: monthPrice.interval,
      });

      redirectToUrl(checkout.url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to start upgrade';

      track('billing_upgrade_failed', {
        ...ANALYTICS_CONTEXT,
        plan: billingStatus.plan ?? 'unknown',
        reason: message,
      });

      // Only show notification if mutation didn't already show one
      if (!checkoutMutation.isError) {
        notifications.error("Couldn't start your upgrade. Please try again.", {
          duration: 6000,
        });
      }
    }
  };

  const handleManageBilling = async () => {
    if (derivedLoading.manageBilling) return;

    try {
      if (!billingStatus.hasStripeCustomer) {
        track('billing_manage_billing_missing_customer', {
          ...ANALYTICS_CONTEXT,
          plan: billingStatus.plan ?? 'unknown',
        });

        notifications.warning(
          'Still setting up your billing profile. Try again or start an upgrade.',
          { duration: 6000 }
        );
        return;
      }

      track('billing_manage_billing_clicked', {
        ...ANALYTICS_CONTEXT,
        plan: billingStatus.plan ?? 'unknown',
      });

      // Use TanStack Query mutation for portal
      const portal = await portalMutation.mutateAsync();

      if (!portal.url) {
        throw new TypeError('Billing portal URL missing from response');
      }

      track('billing_manage_billing_redirected', {
        ...ANALYTICS_CONTEXT,
        plan: billingStatus.plan ?? 'unknown',
      });

      redirectToUrl(portal.url);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to open the billing portal';

      track('billing_manage_billing_failed', {
        ...ANALYTICS_CONTEXT,
        plan: billingStatus.plan ?? 'unknown',
        reason: message,
      });

      // Only show notification if mutation didn't already show one
      if (!portalMutation.isError) {
        notifications.error(
          "Couldn't open billing portal. Taking you to pricing instead.",
          { duration: 6000 }
        );
      }

      router.push('/pricing');
    }
  };

  return {
    handleProfile,
    handleSettings,
    // Wrap async handlers to prevent promise leakage in onClick handlers
    handleUpgrade: () => void handleUpgrade(),
    handleManageBilling: () => void handleManageBilling(),
    handleSignOut: () => void handleSignOut(),
    loading: derivedLoading,
  } as const;
}

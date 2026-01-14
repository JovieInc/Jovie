'use client';

import type { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
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

interface StripeRedirectResponse {
  url?: string;
}

interface PricingOption {
  interval: 'month' | 'year';
  priceId: string;
}

interface PricingOptionsResponse {
  pricingOptions: PricingOption[];
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
  const [loading, setLoading] = useState<Omit<UserMenuLoadingState, 'any'>>({
    manageBilling: false,
    signOut: false,
    upgrade: false,
  });

  const derivedLoading = useMemo<UserMenuLoadingState>(
    () => ({
      ...loading,
      any: loading.manageBilling || loading.signOut || loading.upgrade,
    }),
    [loading]
  );

  const navigateTo = (href?: string) => {
    if (!href) return;
    router.push(href);
  };

  const handleProfile = () => navigateTo(profileUrl);
  const handleSettings = () => navigateTo(settingsUrl);

  const handleSignOut = async () => {
    if (derivedLoading.signOut) return;

    setLoading(prev => ({ ...prev, signOut: true }));
    try {
      await signOut({ redirectUrl: '/' });
    } catch (error) {
      console.error('Sign out error:', error);
      notifications.error("Couldn't sign you out. Please try again.");
      setLoading(prev => ({ ...prev, signOut: false }));
    }
  };

  const handleUpgrade = async () => {
    if (derivedLoading.upgrade) return;

    setLoading(prev => ({ ...prev, upgrade: true }));
    try {
      track('billing_upgrade_clicked', {
        ...ANALYTICS_CONTEXT,
        plan: billingStatus.plan ?? 'unknown',
      });

      const pricingResponse = await fetch('/api/stripe/pricing-options');
      if (!pricingResponse.ok) {
        throw new Error('Failed to load pricing options');
      }

      const pricingData =
        (await pricingResponse.json()) as PricingOptionsResponse;
      const monthPrice = pricingData.pricingOptions.find(
        option => option.interval === 'month'
      );

      if (!monthPrice?.priceId) {
        throw new Error('Monthly pricing option missing');
      }

      const checkoutResponse = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: monthPrice.priceId }),
      });

      if (!checkoutResponse.ok) {
        throw new Error('Failed to create checkout session');
      }

      const checkout =
        (await checkoutResponse.json()) as StripeRedirectResponse;
      if (!checkout.url) {
        throw new Error('Checkout URL missing from response');
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

      notifications.error("Couldn't start your upgrade. Please try again.", {
        duration: 6000,
      });
    } finally {
      setLoading(prev => ({ ...prev, upgrade: false }));
    }
  };

  const handleManageBilling = async () => {
    if (derivedLoading.manageBilling) return;

    setLoading(prev => ({ ...prev, manageBilling: true }));

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

      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to create billing portal session');
      }

      const portal = (await response.json()) as StripeRedirectResponse;

      if (!portal.url) {
        throw new Error('Billing portal URL missing from response');
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

      notifications.error(
        "Couldn't open billing portal. Taking you to pricing instead.",
        { duration: 6000 }
      );

      router.push('/pricing');
    } finally {
      setLoading(prev => ({ ...prev, manageBilling: false }));
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

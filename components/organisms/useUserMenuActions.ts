'use client';

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback, useState } from 'react';
import type { ToastContextValue } from '@/components/molecules/ToastContainer';
import type { BillingStatus } from '@/hooks/use-billing-status';
import { track } from '@/lib/analytics';

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

export type UserMenuLoadingAction =
  | 'idle'
  | 'signOut'
  | 'upgrade'
  | 'manageBilling';

interface UseUserMenuActionsOptions {
  billingStatus: BillingStatus;
  profileUrl?: string;
  settingsUrl?: string;
  router: AppRouterInstance;
  signOut: (callback?: () => void) => Promise<unknown>;
  showToast: ToastContextValue['showToast'];
}

const ANALYTICS_CONTEXT = {
  surface: 'sidebar_user_menu',
} as const;

const redirectToUrl = (url: string) => {
  if (typeof window === 'undefined') return;
  if (typeof window.location.assign === 'function') {
    window.location.assign(url);
    return;
  }
  window.location.href = url;
};

export function useUserMenuActions({
  billingStatus,
  profileUrl,
  settingsUrl,
  router,
  signOut,
  showToast,
}: UseUserMenuActionsOptions) {
  const [loadingAction, setLoadingAction] =
    useState<UserMenuLoadingAction>('idle');

  const navigateTo = useCallback(
    (href?: string) => {
      if (!href) return;
      router.push(href);
    },
    [router]
  );

  const handleProfile = useCallback(
    () => navigateTo(profileUrl),
    [navigateTo, profileUrl]
  );

  const handleSettings = useCallback(
    () => navigateTo(settingsUrl),
    [navigateTo, settingsUrl]
  );

  const handleSignOut = useCallback(async () => {
    if (loadingAction !== 'idle') return;
    setLoadingAction('signOut');

    try {
      await signOut(() => router.push('/'));
    } catch (error) {
      console.error('Sign out error:', error);
      showToast({
        type: 'error',
        message: "We couldn't sign you out. Please try again in a few seconds.",
      });
    } finally {
      setLoadingAction('idle');
    }
  }, [loadingAction, router, showToast, signOut]);

  const handleUpgrade = useCallback(async () => {
    if (loadingAction !== 'idle') return;
    setLoadingAction('upgrade');

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

      if (!monthPrice) {
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

      showToast({
        type: 'error',
        message:
          "We couldn't start your upgrade just now. Please try again in a moment.",
        duration: 6000,
      });
    } finally {
      setLoadingAction('idle');
    }
  }, [billingStatus.plan, loadingAction, showToast]);

  const handleManageBilling = useCallback(async () => {
    if (loadingAction !== 'idle') return;
    setLoadingAction('manageBilling');

    try {
      if (!billingStatus.hasStripeCustomer) {
        track('billing_manage_billing_missing_customer', {
          ...ANALYTICS_CONTEXT,
          plan: billingStatus.plan ?? 'unknown',
        });

        showToast({
          type: 'warning',
          message:
            'We are still setting up your billing profile. Try again in a moment or start an upgrade to create it instantly.',
          duration: 6000,
        });
        setLoadingAction('idle');
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

      showToast({
        type: 'error',
        message:
          "We couldn't open your billing portal just now. We're taking you to pricing so you can manage your plan there.",
        duration: 6000,
      });

      router.push('/pricing');
    } finally {
      setLoadingAction('idle');
    }
  }, [
    billingStatus.hasStripeCustomer,
    billingStatus.plan,
    loadingAction,
    router,
    showToast,
  ]);

  return {
    handleProfile,
    handleSettings,
    handleUpgrade,
    handleManageBilling,
    handleSignOut,
    loadingAction,
    isSigningOut: loadingAction === 'signOut',
    isUpgradeLoading: loadingAction === 'upgrade',
    isManageBillingLoading: loadingAction === 'manageBilling',
  };
}

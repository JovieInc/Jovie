import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useToast } from '@/components/molecules/ToastContainer';
import type { BillingStatus } from '@/hooks/use-billing-status';
import { track } from '@/lib/analytics';

const ANALYTICS_CONTEXT = {
  surface: 'sidebar_user_menu',
} as const;

type ClerkSignOut = ReturnType<
  typeof import('@clerk/nextjs').useClerk
>['signOut'];

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
  const router = useRouter();
  const { showToast } = useToast();
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
      showToast({
        type: 'error',
        message: "We couldn't sign you out. Please try again in a few seconds.",
      });
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

      showToast({
        type: 'error',
        message:
          "We couldn't start your upgrade just now. Please try again in a moment.",
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

        showToast({
          type: 'warning',
          message:
            'We are still setting up your billing profile. Try again in a moment or start an upgrade to create it instantly.',
          duration: 6000,
        });
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
      setLoading(prev => ({ ...prev, manageBilling: false }));
    }
  };

  return {
    handleProfile,
    handleSettings,
    handleUpgrade,
    handleManageBilling,
    handleSignOut,
    loading: derivedLoading,
  } as const;
}

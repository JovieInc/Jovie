'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useToast } from '@/components/ui/ToastContainer';
import { useBillingStatus } from '@/hooks/use-billing-status';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';

interface UserButtonProps {
  artist?: Artist | null;
  showUserInfo?: boolean;
}

type PricingInterval = 'day' | 'week' | 'month' | 'year' | string;

interface PricingOption {
  interval: PricingInterval;
  priceId: string;
}

interface PricingOptionsResponse {
  pricingOptions: PricingOption[];
}

interface StripeRedirectResponse {
  url?: string;
}

const ANALYTICS_CONTEXT = {
  surface: 'sidebar_user_menu',
} as const;

export function UserButton({ showUserInfo = false }: UserButtonProps) {
  const { isLoaded, user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const router = useRouter();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isManageBillingLoading, setIsManageBillingLoading] = useState(false);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  const billingStatus = useBillingStatus();
  const billingErrorNotifiedRef = useRef(false);

  useEffect(() => {
    if (billingStatus.error && !billingErrorNotifiedRef.current) {
      showToast({
        type: 'error',
        message:
          "We couldn't confirm your current plan just now. Billing actions may be temporarily unavailable.",
        duration: 6000,
      });
      billingErrorNotifiedRef.current = true;
    }

    if (!billingStatus.error) {
      billingErrorNotifiedRef.current = false;
    }
  }, [billingStatus.error, showToast]);

  // User display info
  const userImageUrl = user?.imageUrl;
  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.emailAddresses[0]?.emailAddress ||
    '';
  const userInitials = displayName
    ? displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  // shadcn dropdown-menu handles focus/aria for us

  // Handle loading state
  if (!isLoaded || !user) {
    return showUserInfo ? (
      <div className='flex w-full items-center gap-3 p-2'>
        <div className='h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse' />
        <div className='flex-1 space-y-1'>
          <div className='h-4 w-24 rounded-sm bg-gray-200 dark:bg-gray-700 animate-pulse' />
          <div className='h-3 w-16 rounded-sm bg-gray-200 dark:bg-gray-700 animate-pulse' />
        </div>
      </div>
    ) : (
      <div className='h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse' />
    );
  }

  // Handle sign out
  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut(() => router.push('/'));
    } catch (error) {
      console.error('Sign out error:', error);
      showToast({
        type: 'error',
        message: "We couldn't sign you out. Please try again in a few seconds.",
      });
      setIsLoading(false);
    }
  };

  // Handle profile click
  const handleProfile = () => {
    openUserProfile();
  };

  const handleManageBilling = async () => {
    if (isManageBillingLoading) return;
    setIsManageBillingLoading(true);

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

      window.location.assign(portal.url);
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
      setIsManageBillingLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (isUpgradeLoading) return;
    setIsUpgradeLoading(true);

    try {
      track('billing_upgrade_clicked', {
        ...ANALYTICS_CONTEXT,
        currentPlan: billingStatus.plan ?? 'free',
      });

      const pricingResponse = await fetch('/api/stripe/pricing-options');
      if (!pricingResponse.ok)
        throw new Error('Failed to fetch pricing options');

      const { pricingOptions } =
        (await pricingResponse.json()) as PricingOptionsResponse;

      if (!Array.isArray(pricingOptions) || pricingOptions.length === 0) {
        throw new Error('No pricing options available');
      }

      const preferredPlan =
        pricingOptions.find(option => option.interval === 'month') ||
        pricingOptions[0];

      if (!preferredPlan?.priceId) {
        throw new Error('Pricing option missing price identifier');
      }

      track('billing_upgrade_checkout_requested', {
        ...ANALYTICS_CONTEXT,
        interval: preferredPlan.interval,
      });

      const checkoutResponse = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: preferredPlan.priceId }),
      });

      if (!checkoutResponse.ok)
        throw new Error('Failed to create checkout session');
      const checkout =
        (await checkoutResponse.json()) as StripeRedirectResponse;

      if (!checkout.url) {
        throw new Error('Checkout URL missing from response');
      }

      track('billing_upgrade_checkout_redirected', {
        ...ANALYTICS_CONTEXT,
        interval: preferredPlan.interval,
      });

      window.location.assign(checkout.url);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to start upgrade checkout';

      track('billing_upgrade_failed', {
        ...ANALYTICS_CONTEXT,
        currentPlan: billingStatus.plan ?? 'free',
        reason: message,
      });

      showToast({
        type: 'error',
        message:
          "We couldn't start the upgrade checkout. We're opening the pricing page so you can retry in a moment.",
        duration: 6000,
      });

      router.push('/pricing');
    } finally {
      setIsUpgradeLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {showUserInfo ? (
          <div
            className={cn(
              'flex w-full items-center gap-3 p-2 rounded-md border border-subtle bg-surface-1 hover:bg-surface-2 transition-colors'
            )}
          >
            {userImageUrl ? (
              <Image
                src={userImageUrl}
                alt={displayName || 'User avatar'}
                width={32}
                height={32}
                className='w-8 h-8 rounded-full object-cover flex-shrink-0'
              />
            ) : (
              <div className='w-8 h-8 rounded-full bg-indigo-500 text-white text-sm flex items-center justify-center font-medium'>
                {userInitials}
              </div>
            )}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2 truncate'>
                <p className='text-sm font-medium truncate'>{displayName}</p>
                {billingStatus.isPro && (
                  <Badge
                    variant='secondary'
                    size='sm'
                    className='shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide'
                  >
                    Pro
                  </Badge>
                )}
              </div>
              <p className='text-xs text-secondary-token truncate'>
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
            <Icon
              name='ChevronRight'
              className='w-4 h-4 text-tertiary-token'
              aria-hidden='true'
            />
          </div>
        ) : (
          <Button
            variant='ghost'
            size='icon'
            className='rounded-full border border-subtle bg-surface-1 hover:bg-surface-2'
          >
            {userImageUrl ? (
              <Image
                src={userImageUrl}
                alt={displayName || 'User avatar'}
                width={20}
                height={20}
                className='w-5 h-5 rounded-full object-cover'
              />
            ) : (
              <div className='flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-xs font-medium text-white'>
                {userInitials}
              </div>
            )}
            <span className='sr-only'>Open user menu</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-64'>
        <DropdownMenuLabel>
          <div className='flex items-center gap-3'>
            {userImageUrl ? (
              <Image
                src={userImageUrl}
                alt={displayName || 'User avatar'}
                width={32}
                height={32}
                className='w-8 h-8 rounded-full object-cover'
              />
            ) : (
              <div className='w-8 h-8 rounded-full bg-indigo-500 text-white text-sm flex items-center justify-center font-medium'>
                {userInitials}
              </div>
            )}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <span className='truncate text-sm font-medium'>
                  {displayName}
                </span>
                {billingStatus.isPro && (
                  <Badge
                    variant='secondary'
                    size='sm'
                    className='shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide'
                  >
                    Pro
                  </Badge>
                )}
              </div>
              <p className='truncate text-xs text-secondary-token'>
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleProfile} className='cursor-pointer'>
          <Icon name='User' className='w-4 h-4 mr-2 text-tertiary-token' />{' '}
          Profile
        </DropdownMenuItem>
        {billingStatus.loading ? (
          <DropdownMenuItem
            disabled
            className='cursor-default focus:bg-transparent focus:text-secondary-token'
          >
            <div className='flex w-full items-center gap-3'>
              <div className='h-6 w-6 animate-pulse rounded-full bg-surface-2' />
              <div className='flex flex-1 flex-col gap-1'>
                <div className='h-2.5 w-24 animate-pulse rounded-full bg-surface-2' />
                <div className='h-2 w-16 animate-pulse rounded-full bg-surface-2/80' />
              </div>
            </div>
          </DropdownMenuItem>
        ) : billingStatus.isPro ? (
          <DropdownMenuItem
            onClick={handleManageBilling}
            disabled={isManageBillingLoading}
            className='cursor-pointer'
          >
            <Icon
              name='CreditCard'
              className='w-4 h-4 mr-2 text-tertiary-token'
            />
            {isManageBillingLoading ? 'Opening Stripe…' : 'Manage Billing'}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={handleUpgrade}
            disabled={isUpgradeLoading}
            className='cursor-pointer font-medium text-primary-token focus:text-primary-token'
          >
            <Icon name='Sparkles' className='w-4 h-4 mr-2 text-primary-token' />
            {isUpgradeLoading ? 'Securing your upgrade…' : 'Upgrade to Pro'}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isLoading}
          className='cursor-pointer text-red-600 focus:text-red-600'
        >
          <Icon name='LogOut' className='w-4 h-4 mr-2' />{' '}
          {isLoading ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

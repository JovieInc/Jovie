'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/atoms/Avatar';
import { Icon } from '@/components/atoms/Icon';
import { FeedbackModal } from '@/components/dashboard/molecules/FeedbackModal';
import { useToast } from '@/components/molecules/ToastContainer';
import { useBillingStatus } from '@/hooks/use-billing-status';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';

interface UserButtonProps {
  artist?: Artist | null;
  profileHref?: string;
  settingsHref?: string;
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

export function UserButton({
  artist,
  profileHref,
  settingsHref,
  showUserInfo = false,
}: UserButtonProps) {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isManageBillingLoading, setIsManageBillingLoading] = useState(false);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const billingStatus = useBillingStatus();
  const billingErrorNotifiedRef = useRef(false);

  const redirectToUrl = (url: string) => {
    if (typeof window === 'undefined') return;
    if (typeof window.location.assign === 'function') {
      window.location.assign(url);
      return;
    }
    window.location.href = url;
  };

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
  const contactEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress;

  const emailDerivedName = contactEmail?.split('@')[0]?.replace(/[._-]+/g, ' ');

  const displayName =
    artist?.name ||
    user?.fullName ||
    (user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName) ||
    user?.username ||
    artist?.handle ||
    emailDerivedName ||
    'Artist';

  // Email is shown once in the dropdown identity block
  const userInitials = displayName
    ? displayName
        .split(' ')
        .map((n: string) => n[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'A';

  // shadcn dropdown-menu handles focus/aria for us

  // Handle loading state
  if (!isLoaded || !user) {
    return showUserInfo ? (
      <div className='flex w-full items-center gap-3 rounded-md border border-subtle bg-surface-1 px-3 py-2'>
        <div className='h-8 w-8 shrink-0 rounded-full bg-surface-2 animate-pulse' />
        <div className='flex-1 space-y-1'>
          <div className='h-4 w-24 rounded-sm bg-surface-2 animate-pulse' />
          <div className='h-3 w-16 rounded-sm bg-surface-2/80 animate-pulse' />
        </div>
      </div>
    ) : (
      <div className='h-10 w-10 shrink-0 rounded-full bg-surface-2 animate-pulse' />
    );
  }

  // Fallback if user failed to load but Clerk is ready
  if (!user) {
    return (
      <Button
        variant='ghost'
        size={showUserInfo ? 'default' : 'icon'}
        className={cn(
          'w-full justify-start gap-3 rounded-md border border-subtle bg-surface-1 hover:bg-surface-2',
          !showUserInfo && 'h-10 w-10 justify-center'
        )}
        onClick={() => {
          router.push('/signin');
        }}
      >
        <Avatar
          name='User'
          alt='User avatar'
          size={showUserInfo ? 'sm' : 'xs'}
        />
        {showUserInfo && (
          <div className='flex flex-1 items-center justify-between'>
            <span className='text-sm font-medium'>Sign in</span>
            <Icon name='ChevronRight' className='h-4 w-4 text-tertiary-token' />
          </div>
        )}
      </Button>
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

  const profileUrl = profileHref ?? '/dashboard/settings';
  const settingsUrl = settingsHref ?? '/dashboard/settings';
  const navigateTo = (href: string) => {
    setIsMenuOpen(false);
    router.push(href);
  };
  const handleProfile = () => navigateTo(profileUrl);
  const handleSettings = () => navigateTo(settingsUrl);

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

      redirectToUrl(checkout.url);
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

  const themeOptions = ['light', 'dark', 'system'] as const;
  const rawIndex = themeOptions.findIndex(option =>
    option === 'system' ? theme === 'system' : resolvedTheme === option
  );
  const activeIndex = rawIndex === -1 ? 0 : rawIndex;

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger asChild>
        {showUserInfo ? (
          <button
            type='button'
            className={cn(
              'flex w-full items-center gap-3 rounded-md border border-subtle bg-surface-1 px-3 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            )}
            onClick={() => setIsMenuOpen(prev => !prev)}
          >
            <Avatar
              src={userImageUrl}
              alt={displayName || 'User avatar'}
              name={displayName || userInitials}
              size='sm'
              className='shrink-0'
            />
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
            </div>
            <Icon
              name='ChevronRight'
              className='w-4 h-4 text-tertiary-token'
              aria-hidden='true'
            />
          </button>
        ) : (
          <Button
            variant='ghost'
            size='icon'
            className='h-10 w-10 rounded-full border border-subtle bg-surface-1 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent'
            onClick={() => setIsMenuOpen(prev => !prev)}
          >
            <Avatar
              src={userImageUrl}
              alt={displayName || 'User avatar'}
              name={displayName || userInitials}
              size='xs'
              className='h-5 w-5 shrink-0 ring-0 shadow-none'
            />
            <span className='sr-only'>Open user menu</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-[244px] rounded-xl border-none bg-surface-1/95 text-primary-token p-3.5 shadow-[0_22px_72px_-14px_rgba(0,0,0,0.38)] backdrop-blur-xl font-sans text-[13px] leading-[18px] space-y-1 dark:bg-surface-2/90'
      >
        {/* Identity block - name first, email once, smaller */}
        <DropdownMenuLabel className='px-0 py-0 mb-1'>
          <div className='flex items-center gap-3 px-2 py-2'>
            <Avatar
              src={userImageUrl}
              alt={displayName || 'User avatar'}
              name={displayName || userInitials}
              size='sm'
              className='shrink-0'
            />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-1.5'>
                <span className='truncate text-sm font-medium text-primary-token/90'>
                  {displayName}
                </span>
                {billingStatus.isPro && (
                  <Badge
                    variant='secondary'
                    size='sm'
                    className='shrink-0 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider bg-linear-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30'
                  >
                    Pro
                  </Badge>
                )}
              </div>
              {contactEmail && (
                <p className='truncate text-xs text-secondary-token/75 mt-0.5'>
                  {contactEmail}
                </p>
              )}
            </div>
          </div>
        </DropdownMenuLabel>

        <div className='h-1' />

        {/* Primary actions group */}
        <DropdownMenuItem
          onClick={handleProfile}
          className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] text-primary-token transition-all duration-100 ease-[cubic-bezier(.33,.01,.27,1)] hover:bg-(--accents-1) hover:opacity-90 focus:bg-(--accents-1) active:scale-[0.97] active:opacity-95'
        >
          <Icon
            name='User'
            className='h-4 w-4 text-secondary-token group-hover:text-primary-token transition-colors'
          />
          <span className='flex-1'>Profile</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleSettings}
          className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] text-primary-token transition-all duration-100 ease-[cubic-bezier(.33,.01,.27,1)] hover:bg-(--accents-1) hover:opacity-90 focus:bg-(--accents-1) active:scale-[0.97] active:opacity-95'
        >
          <Icon
            name='Settings'
            className='h-4 w-4 text-secondary-token group-hover:text-primary-token transition-colors'
          />
          <span className='flex-1'>Account settings</span>
        </DropdownMenuItem>

        {/* Billing - only show for Pro users */}
        {billingStatus.loading ? (
          <DropdownMenuItem
            disabled
            className='cursor-default focus:bg-transparent px-2 py-2 text-[13px] h-9'
          >
            <div className='flex w-full items-center gap-2.5'>
              <div className='h-4 w-4 animate-pulse rounded bg-white/10' />
              <div className='h-3 w-20 animate-pulse rounded bg-white/10' />
            </div>
          </DropdownMenuItem>
        ) : billingStatus.isPro ? (
          <DropdownMenuItem
            onClick={handleManageBilling}
            disabled={isManageBillingLoading}
            className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] text-primary-token transition-all duration-100 ease-[cubic-bezier(.33,.01,.27,1)] hover:bg-(--accents-1) hover:opacity-90 focus:bg-(--accents-1) active:scale-[0.97] active:opacity-95 disabled:active:scale-100'
          >
            <Icon
              name='CreditCard'
              className='h-4 w-4 text-secondary-token group-hover:text-primary-token transition-colors'
            />
            <span className='flex-1'>
              {isManageBillingLoading ? 'Opening…' : 'Manage billing'}
            </span>
          </DropdownMenuItem>
        ) : null}

        <div className='h-1' />

        {/* Theme toggle - inline row: label left, pill right */}
        <div className='flex items-center justify-between px-2 py-2'>
          <span className='text-[13px] text-primary-token'>Theme</span>
          <div className='relative h-7 w-[84px] rounded-full border border-(--accents-2) bg-(--accents-1) p-0.5'>
            <div
              className='pointer-events-none absolute top-0.5 h-6 w-6 rounded-full bg-black dark:bg-white shadow-sm transition-all duration-200 ease-out'
              style={{
                left: `calc(${activeIndex * 28}px + 2px)`,
              }}
            />
            <div
              role='radiogroup'
              aria-label='Theme mode'
              className='relative flex h-full'
            >
              {themeOptions.map(option => {
                const isActive =
                  (option === 'system' && theme === 'system') ||
                  (option !== 'system' && resolvedTheme === option);
                const label =
                  option === 'light'
                    ? 'Light'
                    : option === 'dark'
                      ? 'Dark'
                      : 'Auto';
                const icon =
                  option === 'dark'
                    ? 'Moon'
                    : option === 'light'
                      ? 'Sun'
                      : 'Monitor';

                return (
                  <button
                    key={option}
                    type='button'
                    role='radio'
                    aria-checked={isActive}
                    aria-label={label}
                    onClick={() => setTheme(option)}
                    className={cn(
                      'relative z-10 flex h-6 w-7 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                      isActive
                        ? 'text-white dark:text-black'
                        : 'text-secondary-token hover:text-primary-token'
                    )}
                  >
                    <Icon
                      name={icon}
                      className='h-3.5 w-3.5'
                      aria-hidden='true'
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Feedback */}
        <DropdownMenuItem
          onClick={() => {
            setIsMenuOpen(false);
            setIsFeedbackOpen(true);
          }}
          className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] text-primary-token transition-all duration-100 ease-[cubic-bezier(.33,.01,.27,1)] hover:bg-(--accents-1) hover:opacity-90 focus:bg-(--accents-1) active:scale-[0.97] active:opacity-95'
        >
          <Icon
            name='MessageSquare'
            className='h-4 w-4 text-secondary-token group-hover:text-primary-token transition-colors'
          />
          <span className='flex-1'>Send feedback</span>
        </DropdownMenuItem>

        <div className='h-1' />

        {/* Sign out - pinned at bottom */}
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isLoading}
          className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] text-red-400 transition-all duration-100 ease-[cubic-bezier(.33,.01,.27,1)] hover:bg-red-500/10 hover:opacity-90 focus:bg-red-500/10 active:scale-[0.97] active:opacity-95 disabled:active:scale-100'
        >
          <Icon name='LogOut' className='h-4 w-4 text-red-400' />
          <span className='flex-1'>
            {isLoading ? 'Signing out…' : 'Sign out'}
          </span>
        </DropdownMenuItem>

        {/* Upgrade CTA - text-only button, theme-aware colors */}
        {!billingStatus.isPro && !billingStatus.loading && (
          <div className='pt-2 pb-1 px-1'>
            <button
              type='button'
              onClick={handleUpgrade}
              disabled={isUpgradeLoading}
              className='flex w-full items-center justify-center rounded-lg bg-black text-white dark:bg-white dark:text-black px-4 py-2.5 text-[13px] font-semibold transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isUpgradeLoading ? 'Upgrading…' : 'Upgrade to Pro'}
            </button>
          </div>
        )}
      </DropdownMenuContent>
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </DropdownMenu>
  );
}

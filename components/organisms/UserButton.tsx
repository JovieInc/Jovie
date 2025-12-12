'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useRouter } from 'next/navigation';
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

  const profileUrl =
    profileHref ??
    (user?.username
      ? `/${user.username}`
      : artist?.handle
        ? `/${artist.handle}`
        : '/app/settings');
  const settingsUrl = settingsHref ?? '/app/settings';
  const navigateTo = (href: string | undefined) => {
    if (!href) return;
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

  const jovieUsername =
    user?.username || artist?.handle || contactEmail?.split('@')[0] || null;
  const formattedUsername = jovieUsername ? `@${jovieUsername}` : null;

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger asChild>
        {showUserInfo ? (
          <button
            type='button'
            className={cn(
              'flex w-full items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-surface px-3 py-2 text-left transition-colors hover:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
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
            className='h-10 w-10 rounded-full border border-sidebar-border bg-sidebar-surface hover:bg-sidebar-surface-hover focus-visible:ring-2 focus-visible:ring-sidebar-ring'
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
        className='w-[calc(var(--radix-dropdown-menu-trigger-width)+16px)] min-w-[calc(var(--radix-dropdown-menu-trigger-width)+16px)] rounded-xl border border-sidebar-border bg-sidebar-surface p-2 font-sans text-[13px] leading-[18px] text-sidebar-foreground shadow-lg'
      >
        <DropdownMenuItem
          onClick={handleProfile}
          className='cursor-pointer rounded-lg px-2 py-2 focus:bg-sidebar-surface-hover hover:bg-sidebar-surface-hover'
        >
          <div className='flex w-full items-center gap-3'>
            <Avatar
              src={userImageUrl}
              alt={displayName || 'User avatar'}
              name={displayName || userInitials}
              size='sm'
              className='shrink-0'
            />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <span className='truncate text-sm font-medium text-sidebar-foreground'>
                  {displayName}
                </span>
                {billingStatus.isPro && (
                  <Badge
                    variant='secondary'
                    size='sm'
                    className='shrink-0 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider'
                  >
                    Pro
                  </Badge>
                )}
              </div>
              {formattedUsername && (
                <p className='truncate text-xs text-sidebar-muted mt-0.5'>
                  {formattedUsername}
                </p>
              )}
            </div>
            <Icon
              name='ExternalLink'
              className='h-4 w-4 shrink-0 text-sidebar-muted'
              aria-hidden='true'
            />
          </div>
        </DropdownMenuItem>

        <div className='h-2' />

        {/* Primary actions group */}
        <DropdownMenuItem
          onClick={handleSettings}
          className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-surface-hover focus:bg-sidebar-surface-hover'
        >
          <Icon
            name='Settings'
            className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
          />
          <span className='flex-1'>Settings</span>
        </DropdownMenuItem>

        {/* Billing - only show for Pro users */}
        {billingStatus.loading ? (
          <DropdownMenuItem
            disabled
            className='cursor-default focus:bg-transparent px-2.5 py-2 text-[13px] h-9'
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
            className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-surface-hover focus:bg-sidebar-surface-hover disabled:cursor-not-allowed disabled:opacity-70'
          >
            <Icon
              name='CreditCard'
              className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
            />
            <span className='flex-1'>
              {isManageBillingLoading ? 'Opening…' : 'Manage billing'}
            </span>
          </DropdownMenuItem>
        ) : null}

        {/* Feedback */}
        <DropdownMenuItem
          onClick={() => {
            setIsMenuOpen(false);
            setIsFeedbackOpen(true);
          }}
          className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-surface-hover focus:bg-sidebar-surface-hover'
        >
          <Icon
            name='MessageSquare'
            className='h-4 w-4 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors'
          />
          <span className='flex-1'>Send feedback</span>
        </DropdownMenuItem>

        <div className='h-2' />

        {/* Sign out - pinned at bottom */}
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isLoading}
          className='group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-500/10 focus:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60'
        >
          <Icon name='LogOut' className='h-4 w-4 text-red-400' />
          <span className='flex-1'>
            {isLoading ? 'Signing out…' : 'Sign out'}
          </span>
        </DropdownMenuItem>

        {/* Upgrade CTA - text-only button, theme-aware colors */}
        {!billingStatus.isPro && !billingStatus.loading && (
          <div className='pt-2 pb-1 px-1'>
            <Button
              type='button'
              onClick={handleUpgrade}
              disabled={isUpgradeLoading}
              variant='primary'
              className='w-full justify-center rounded-lg text-[13px] font-semibold'
            >
              {isUpgradeLoading ? 'Upgrading…' : 'Upgrade to Pro'}
            </Button>
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

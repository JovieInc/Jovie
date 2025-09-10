'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useBillingStatus } from '@/hooks/use-billing-status';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';

interface UserButtonProps {
  artist?: Artist | null;
  showUserInfo?: boolean;
}

export function UserButton({ showUserInfo = false }: UserButtonProps) {
  const { isLoaded, user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const billingStatus = useBillingStatus();

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

  // Floating UI setup for dropdown
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(8),
      flip({
        mainAxis: true,
        crossAxis: true,
        fallbackPlacements: [
          'bottom-start',
          'top-end',
          'top-start',
          'left',
          'right',
        ],
        padding: 16,
      }),
      shift({
        mainAxis: true,
        crossAxis: true,
        padding: 16,
      }),
      size({
        apply({ availableWidth, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.min(availableWidth, 256)}px`,
            maxHeight: `${Math.min(availableHeight, 400)}px`,
          });
        },
        padding: 16,
      }),
    ],
    whileElementsMounted: autoUpdate,
    placement: 'bottom-end',
    strategy: 'fixed',
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  // Handle loading state
  if (!isLoaded || !user) {
    if (showUserInfo) {
      return (
        <div className='flex w-full items-center gap-3 p-2'>
          <div className='h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse' />
          <div className='flex-1 space-y-1'>
            <div className='h-4 w-24 rounded-sm bg-gray-200 dark:bg-gray-700 animate-pulse' />
            <div className='h-3 w-16 rounded-sm bg-gray-200 dark:bg-gray-700 animate-pulse' />
          </div>
        </div>
      );
    }
    return (
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
      setIsLoading(false);
    }
  };

  // Handle profile click
  const handleProfile = () => {
    openUserProfile();
    setIsOpen(false);
  };

  // Handle billing portal
  const handleBilling = async () => {
    if (isBillingLoading) return;
    setIsBillingLoading(true);

    try {
      if (billingStatus.isPro && billingStatus.hasStripeCustomer) {
        const response = await fetch('/api/stripe/portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok)
          throw new Error('Failed to create billing portal session');
        const { url } = await response.json();
        window.location.href = url;
      } else {
        // Handle subscription flow
        const pricingResponse = await fetch('/api/stripe/pricing-options');
        if (!pricingResponse.ok)
          throw new Error('Failed to fetch pricing options');

        const { pricingOptions } = await pricingResponse.json();
        const defaultPlan =
          pricingOptions.find(
            (option: { interval: string }) => option.interval === 'month'
          ) || pricingOptions[0];

        if (!defaultPlan?.priceId)
          throw new Error('No pricing options available');

        const checkoutResponse = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId: defaultPlan.priceId }),
        });

        if (!checkoutResponse.ok)
          throw new Error('Failed to create checkout session');
        const { url } = await checkoutResponse.json();
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error handling billing:', error);
      router.push('/pricing');
    } finally {
      setIsBillingLoading(false);
    }
  };

  return (
    <>
      <button
        ref={refs.setReference}
        className={cn(
          'flex items-center transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          'rounded-full',
          showUserInfo
            ? 'gap-2.5 w-full px-3 py-1.5 text-left border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            : 'justify-center w-9 h-9 p-0 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50',
          isOpen &&
            'ring-2 ring-offset-2 ring-primary/50 ring-offset-white dark:ring-offset-gray-900'
        )}
        aria-haspopup='menu'
        aria-expanded={isOpen}
        {...getReferenceProps()}
      >
        {userImageUrl ? (
          <Image
            src={userImageUrl}
            alt={displayName || 'User avatar'}
            width={showUserInfo ? 32 : 20}
            height={showUserInfo ? 32 : 20}
            className={`${showUserInfo ? 'w-8 h-8' : 'w-5 h-5'} rounded-full object-cover flex-shrink-0`}
          />
        ) : (
          <div
            className={`${showUserInfo ? 'w-8 h-8 text-sm' : 'w-5 h-5 text-xs'} rounded-full bg-indigo-500 text-white flex items-center justify-center font-medium`}
          >
            {userInitials}
          </div>
        )}

        {showUserInfo && (
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
              {displayName}
            </p>
            <p className='text-xs text-gray-500 dark:text-gray-400 truncate'>
              {user.primaryEmailAddress?.emailAddress}
            </p>
          </div>
        )}

        {showUserInfo && (
          <Icon
            name='ChevronRight'
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
            aria-hidden='true'
          />
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className='z-50 min-w-[220px] rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/10 dark:ring-white/10 overflow-hidden backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95'
              {...getFloatingProps()}
            >
              <div className='p-2'>
                {/* Profile section */}
                <div className='flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 mb-2'>
                  {userImageUrl ? (
                    <Image
                      src={userImageUrl}
                      alt={displayName || 'User avatar'}
                      width={40}
                      height={40}
                      className='w-10 h-10 rounded-full object-cover flex-shrink-0'
                    />
                  ) : (
                    <div className='w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-medium text-sm'>
                      {userInitials}
                    </div>
                  )}
                  <div className='min-w-0'>
                    <p className='text-sm font-medium text-gray-900 dark:text-white truncate'>
                      {displayName}
                    </p>
                    <p className='text-xs text-gray-500 dark:text-gray-400 truncate'>
                      {user.primaryEmailAddress?.emailAddress}
                    </p>
                  </div>
                </div>

                {/* Menu items */}
                <div className='space-y-1'>
                  <button
                    onClick={handleProfile}
                    className='w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-md transition-colors'
                  >
                    <Icon
                      name='User'
                      className='w-4 h-4 text-gray-500 dark:text-gray-400'
                    />
                    <span>Profile</span>
                  </button>

                  <button
                    onClick={handleBilling}
                    disabled={isBillingLoading}
                    className='w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-md transition-colors disabled:opacity-50'
                  >
                    <Icon
                      name='CreditCard'
                      className='w-4 h-4 text-gray-500 dark:text-gray-400'
                    />
                    <span>
                      {isBillingLoading ? 'Loading...' : 'Billing & Plans'}
                    </span>
                  </button>

                  <div className='border-t border-gray-100 dark:border-gray-700 my-1' />

                  <button
                    onClick={handleSignOut}
                    disabled={isLoading}
                    className='w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50'
                  >
                    <Icon name='LogOut' className='w-4 h-4' />
                    <span>{isLoading ? 'Signing out...' : 'Sign out'}</span>
                  </button>
                </div>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

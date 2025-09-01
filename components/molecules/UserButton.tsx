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
import { useBillingStatus } from '@/hooks/use-billing-status';
import type { Artist } from '@/types/db';

interface UserButtonProps {
  artist?: Artist | null;
  showUserInfo?: boolean;
}

export function UserButton({ artist, showUserInfo = false }: UserButtonProps) {
  const { isLoaded, user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const billingStatus = useBillingStatus();

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
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  if (!isLoaded || !user) {
    if (showUserInfo) {
      return (
        <div className='flex w-full items-center gap-3 p-2'>
          <div className='h-8 w-8 rounded-full skeleton motion-reduce:animate-none' />
          <div className='flex-1 space-y-1'>
            <div className='h-4 w-24 rounded-sm skeleton motion-reduce:animate-none' />
            <div className='h-3 w-16 rounded-sm skeleton motion-reduce:animate-none' />
          </div>
        </div>
      );
    }
    return (
      <div className='h-8 w-8 rounded-full skeleton motion-reduce:animate-none' />
    );
  }

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut(() => router.push('/'));
    } catch (error) {
      console.error('Sign out error:', error);
      setIsLoading(false);
    }
  };

  const handleProfile = () => {
    openUserProfile();
  };

  const handleBilling = async () => {
    if (isBillingLoading) return;

    setIsBillingLoading(true);

    try {
      if (billingStatus.isPro && billingStatus.hasStripeCustomer) {
        // User has a subscription - open billing portal
        const response = await fetch('/api/stripe/portal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to create billing portal session');
        }

        const { url } = await response.json();
        window.location.href = url;
      } else {
        // User doesn't have a subscription - get default Pro plan price ID and redirect to checkout
        try {
          const pricingResponse = await fetch('/api/stripe/pricing-options');
          if (!pricingResponse.ok) {
            throw new Error('Failed to fetch pricing options');
          }

          const { pricingOptions } = await pricingResponse.json();
          // Get the monthly Pro plan (cheapest option for quick upgrade)
          const defaultPlan =
            pricingOptions.find(
              (option: { interval: string }) => option.interval === 'month'
            ) || pricingOptions[0];

          if (!defaultPlan?.priceId) {
            throw new Error('No pricing options available');
          }

          // Create checkout session for the default Pro plan
          const checkoutResponse = await fetch('/api/stripe/checkout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              priceId: defaultPlan.priceId,
            }),
          });

          if (!checkoutResponse.ok) {
            throw new Error('Failed to create checkout session');
          }

          const { url } = await checkoutResponse.json();
          window.location.href = url;
        } catch (checkoutError) {
          console.error('Error creating checkout session:', checkoutError);
          // Fallback to pricing page
          router.push('/pricing');
        }
      }
    } catch (error) {
      console.error('Error handling billing:', error);
      // Fallback to pricing page
      router.push('/pricing');
    } finally {
      setIsBillingLoading(false);
    }
  };

  const userImageUrl = user.imageUrl;
  const displayName =
    user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress;
  const userInitials = displayName
    ? displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className={`flex items-center gap-3 transition-all duration-300 ease-in-out focus-ring-themed ${showUserInfo ? 'w-full rounded-md p-2 text-left interactive-hover' : 'justify-center w-8 h-8 rounded-full surface-hover hover:surface-pressed'}`}
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
          <div className='w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0'>
            <span className='text-xs font-medium text-gray-700 dark:text-gray-200'>
              {userInitials}
            </span>
          </div>
        )}
        <div
          className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${
            showUserInfo && artist
              ? 'opacity-100 w-auto overflow-visible'
              : 'opacity-0 w-0 overflow-hidden'
          }`}
        >
          {artist && (
            <>
              <p className='text-sm font-medium text-primary truncate'>
                {artist.name || artist.handle}
              </p>
              <p className='text-xs text-tertiary truncate'>@{artist.handle}</p>
            </>
          )}
        </div>
      </button>

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              {...getFloatingProps()}
              className='z-50 w-64 rounded-lg border border-subtle bg-surface-0 shadow-xl backdrop-blur-sm focus-visible:outline-none ring-1 ring-black/5 dark:ring-white/5'
              style={{
                ...floatingStyles,
                animation: 'user-menu-enter 150ms ease-out',
              }}
            >
              <div className='p-4 border-b border-subtle'>
                <div className='flex items-center gap-3'>
                  {userImageUrl ? (
                    <Image
                      src={userImageUrl}
                      alt={displayName || 'User avatar'}
                      width={40}
                      height={40}
                      className='w-10 h-10 rounded-full object-cover'
                    />
                  ) : (
                    <div className='w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center'>
                      <span className='text-sm font-medium text-primary-token'>
                        {userInitials}
                      </span>
                    </div>
                  )}
                  <div className='flex-1 min-w-0'>
                    <p className='text-sm font-medium text-primary-token truncate'>
                      {displayName}
                    </p>
                    <p className='text-xs text-secondary-token truncate'>
                      {user.primaryEmailAddress?.emailAddress}
                    </p>
                  </div>
                </div>
              </div>

              <div className='py-1'>
                {artist?.handle && (
                  <button
                    onClick={() => {
                      router.push(`/${artist.handle}`);
                      setIsOpen(false);
                    }}
                    className='w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 text-secondary-token hover:text-primary-token hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                  >
                    <svg
                      className='w-4 h-4'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                      />
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                      />
                    </svg>
                    View Profile
                  </button>
                )}

                <button
                  onClick={() => {
                    handleProfile();
                    setIsOpen(false);
                  }}
                  className='w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 text-secondary-token hover:text-primary-token hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                >
                  <svg
                    className='w-4 h-4'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                    />
                  </svg>
                  Account Settings
                </button>

                <button
                  onClick={() => {
                    handleBilling();
                    setIsOpen(false);
                  }}
                  disabled={isBillingLoading || billingStatus.loading}
                  className='w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 text-secondary-token hover:text-primary-token hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {isBillingLoading ? (
                    <svg
                      className='w-4 h-4 animate-spin'
                      fill='none'
                      viewBox='0 0 24 24'
                    >
                      <circle
                        className='opacity-25'
                        cx='12'
                        cy='12'
                        r='10'
                        stroke='currentColor'
                        strokeWidth='4'
                      ></circle>
                      <path
                        className='opacity-75'
                        fill='currentColor'
                        d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                      ></path>
                    </svg>
                  ) : (
                    <svg
                      className='w-4 h-4'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z'
                      />
                    </svg>
                  )}
                  {isBillingLoading
                    ? 'Loading...'
                    : billingStatus.loading
                      ? 'Billing'
                      : billingStatus.isPro
                        ? 'Manage Billing'
                        : 'Upgrade to Pro'}
                </button>

                <button
                  onClick={() => {
                    router.push('/support');
                    setIsOpen(false);
                  }}
                  className='w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 text-secondary-token hover:text-primary-token hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                >
                  <svg
                    className='w-4 h-4'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                    />
                  </svg>
                  Help & Support
                </button>
              </div>

              <div className='py-1 border-t border-subtle'>
                <button
                  onClick={() => {
                    handleSignOut();
                    setIsOpen(false);
                  }}
                  disabled={isLoading}
                  className='w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  <svg
                    className='w-4 h-4'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
                    />
                  </svg>
                  {isLoading ? 'Signing out...' : 'Sign out'}
                </button>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

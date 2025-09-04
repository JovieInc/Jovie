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

  const { refs, floatingStyles, context, x, y } = useFloating({
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
        className={`flex items-center transition-all duration-300 ease-in-out focus-ring-themed ${
          showUserInfo
            ? 'gap-3 w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-2 text-left hover:bg-surface-2'
            : 'items-center justify-center gap-0 w-8 h-8 p-0 rounded-md border border-subtle bg-surface-0 hover:bg-surface-2'
        }`}
        aria-haspopup='menu'
        aria-expanded={isOpen}
      >
        {userImageUrl ? (
          <Image
            src={userImageUrl}
            alt={displayName || 'User avatar'}
            width={showUserInfo ? 32 : 20}
            height={showUserInfo ? 32 : 20}
            className={`${showUserInfo ? 'w-8 h-8' : 'w-5 h-5'} rounded-full object-cover flex-shrink-0 block`}
          />
        ) : (
          <div
            className={`${showUserInfo ? 'w-8 h-8 text-sm' : 'w-5 h-5 text-[10px]'} rounded-full bg-indigo-500 text-white flex items-center justify-center font-semibold`}
          >
            {userInitials}
          </div>
        )}
        <div
          className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${
            showUserInfo
              ? 'opacity-100 w-auto overflow-visible'
              : 'opacity-0 w-0 overflow-hidden'
          }`}
        >
          {showUserInfo && (
            <>
              <p className='text-sm font-medium text-primary truncate'>
                {displayName}
              </p>
              <p className='text-xs text-tertiary truncate'>
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </>
          )}
        </div>
        {showUserInfo && (
          <svg
            className={`w-4 h-4 text-tertiary-token transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
            strokeWidth={2}
            aria-hidden='true'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M19 9l-7 7-7-7'
            />
          </svg>
        )}
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
              {/* Creator section */}
              <div className='p-3 border-b border-subtle'>
                <p className='px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-tertiary-token'>
                  Creator
                </p>
                <button
                  disabled
                  className='w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface-1 text-primary-token border border-subtle'
                  title='Creator switching coming soon'
                >
                  <span className='flex items-center gap-2'>
                    <svg
                      className='w-4 h-4 text-secondary-token'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                    >
                      <path d='M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5z' />
                      <path d='M3 22c0-4.971 4.029-9 9-9s9 4.029 9 9' />
                    </svg>
                    @{artist?.handle ?? 'creator'}
                  </span>
                  <svg
                    className='w-4 h-4 text-tertiary-token'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                  >
                    <path d='M20 6L9 17l-5-5' />
                  </svg>
                </button>
                <button
                  disabled
                  className='mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-md text-secondary-token hover:text-secondary-token border border-dashed border-subtle'
                  title='Add creator coming soon'
                >
                  <svg
                    className='w-4 h-4'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                  >
                    <path d='M12 5v14M5 12h14' />
                  </svg>
                  Add creator (soon)
                </button>
              </div>

              {/* Profile summary */}
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
                        d='M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z'
                      />
                    </svg>
                  ) : (
                    <svg
                      className='w-4 h-4'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                    >
                      <path d='M3 10h18M7 15h1m4 0h5M6 19h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z' />
                    </svg>
                  )}
                  {billingStatus.isPro ? 'Manage Billing' : 'Upgrade to Pro'}
                </button>
                <button
                  onClick={() => router.push('/support')}
                  className='w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all duration-200 hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                >
                  <svg
                    className='w-4 h-4'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
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

              {/* Settings + Sign out at bottom */}
              <div className='py-1 border-t border-subtle'>
                <button
                  onClick={handleProfile}
                  disabled={isLoading}
                  className='w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all duration-200 hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                >
                  <svg
                    className='w-4 h-4'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                  >
                    <path d='M12 15c2.761 0 5-2.239 5-5S14.761 5 12 5 7 7.239 7 10s2.239 5 5 5z' />
                    <path d='M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009.09 5H9a2 2 0 114 0h.09a1.65 1.65 0 001-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82 1.65 1.65 0 001 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z' />
                  </svg>
                  Personal Settings
                </button>
                <button
                  onClick={() => {
                    handleSignOut();
                    setIsOpen(false);
                  }}
                  disabled={isLoading}
                  className='w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'
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

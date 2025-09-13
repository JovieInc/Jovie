'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
      setIsLoading(false);
    }
  };

  // Handle profile click
  const handleProfile = () => {
    openUserProfile();
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {showUserInfo ? (
          <div className={cn('flex w-full items-center gap-3 p-2 rounded-md border border-subtle bg-surface-1 hover:bg-surface-2 transition-colors')}>
            {userImageUrl ? (
              <Image src={userImageUrl} alt={displayName || 'User avatar'} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-sm flex items-center justify-center font-medium">{userInitials}</div>
            )}
            <div className='min-w-0 flex-1'>
              <p className='text-sm font-medium truncate'>{displayName}</p>
              <p className='text-xs text-secondary-token truncate'>{user.primaryEmailAddress?.emailAddress}</p>
            </div>
            <Icon name='ChevronRight' className='w-4 h-4 text-tertiary-token' aria-hidden='true' />
          </div>
        ) : (
          <Button variant='ghost' size='icon' className='rounded-full border border-subtle bg-surface-1 hover:bg-surface-2'>
            {userImageUrl ? (
              <Image src={userImageUrl} alt={displayName || 'User avatar'} width={20} height={20} className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-indigo-500 text-white text-xs flex items center justify-center font-medium">{userInitials}</div>
            )}
            <span className='sr-only'>Open user menu</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-64'>
        <DropdownMenuLabel>
          <div className='flex items-center gap-3'>
            {userImageUrl ? (
              <Image src={userImageUrl} alt={displayName || 'User avatar'} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-sm flex items-center justify-center font-medium">{userInitials}</div>
            )}
            <div className='min-w-0'>
              <div className='text-sm font-medium truncate'>{displayName}</div>
              <div className='text-xs text-secondary-token truncate'>{user.primaryEmailAddress?.emailAddress}</div>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleProfile} className='cursor-pointer'>
          <Icon name='User' className='w-4 h-4 mr-2 text-tertiary-token' /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleBilling} disabled={isBillingLoading} className='cursor-pointer'>
          <Icon name='CreditCard' className='w-4 h-4 mr-2 text-tertiary-token' /> {isBillingLoading ? 'Loading…' : 'Billing & Plans'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} disabled={isLoading} className='cursor-pointer text-red-600 focus:text-red-600'>
          <Icon name='LogOut' className='w-4 h-4 mr-2' /> {isLoading ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

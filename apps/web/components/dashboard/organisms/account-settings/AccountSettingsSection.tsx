'use client';

/**
 * AccountSettingsSection Component
 *
 * Main container for account settings, composing email and session management cards.
 */

import { useSession, useUser } from '@clerk/nextjs';

import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

import { DashboardCard } from '../../atoms/DashboardCard';
import { ConnectedAccountsCard } from './ConnectedAccountsCard';
import { EmailManagementCard } from './EmailManagementCard';
import { SessionManagementCard } from './SessionManagementCard';
import type { ClerkUserResource } from './types';

export function AccountSettingsSection() {
  const { user, isLoaded } = useUser();
  const { session: activeSession } = useSession();

  const typedUser = user as unknown as ClerkUserResource | null;

  if (!isLoaded || !user || !typedUser) {
    return (
      <DashboardCard variant='settings'>
        <div className='space-y-4'>
          <LoadingSkeleton height='h-6' width='w-1/3' />
          <LoadingSkeleton height='h-4' />
          <LoadingSkeleton height='h-12' />
          <LoadingSkeleton height='h-6' width='w-1/2' />
        </div>
      </DashboardCard>
    );
  }

  return (
    <div
      className='divide-y divide-subtle'
      data-testid='account-settings-section'
    >
      <div className='pb-5 sm:pb-8'>
        <EmailManagementCard user={typedUser} />
      </div>
      <div className='py-5 sm:py-8'>
        <ConnectedAccountsCard user={typedUser} />
      </div>
      <div className='pt-5 sm:pt-8'>
        <SessionManagementCard
          user={typedUser}
          activeSessionId={activeSession?.id}
        />
      </div>
    </div>
  );
}

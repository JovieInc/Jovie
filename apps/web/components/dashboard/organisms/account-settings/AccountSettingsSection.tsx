'use client';

/**
 * AccountSettingsSection Component
 *
 * Main container for account settings, composing email, session management,
 * appearance, and notification preference cards.
 */

import { useSession, useUser } from '@clerk/nextjs';
import { SettingsAppearanceSection } from '@/components/dashboard/organisms/SettingsAppearanceSection';
import { SettingsNotificationsSection } from '@/components/dashboard/organisms/SettingsNotificationsSection';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

import { DashboardCard } from '../../atoms/DashboardCard';
import { ConnectedAccountsCard } from './ConnectedAccountsCard';
import { EmailManagementCard } from './EmailManagementCard';
import { SessionManagementCard } from './SessionManagementCard';
import type { ClerkUserResource } from './types';

function ClerkAccountSections() {
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
    <>
      <div>
        <h3 className='text-[13px] font-medium text-secondary-token mb-3'>
          Email
        </h3>
        <EmailManagementCard user={typedUser} />
      </div>
      <div>
        <h3 className='text-[13px] font-medium text-secondary-token mb-3'>
          Connected accounts
        </h3>
        <ConnectedAccountsCard user={typedUser} />
      </div>
      <div>
        <h3 className='text-[13px] font-medium text-secondary-token mb-3'>
          Sessions
        </h3>
        <SessionManagementCard
          user={typedUser}
          activeSessionId={activeSession?.id}
        />
      </div>
    </>
  );
}

export function AccountSettingsSection() {
  return (
    <div className='space-y-8' data-testid='account-settings-section'>
      <ClerkAccountSections />
      <div>
        <h3 className='text-[13px] font-medium text-secondary-token mb-3'>
          Appearance
        </h3>
        <SettingsAppearanceSection />
      </div>
      <div>
        <h3 className='text-[13px] font-medium text-secondary-token mb-3'>
          Notifications
        </h3>
        <SettingsNotificationsSection />
      </div>
    </div>
  );
}

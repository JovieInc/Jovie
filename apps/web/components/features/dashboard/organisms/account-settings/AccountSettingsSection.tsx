'use client';

/**
 * AccountSettingsSection Component
 *
 * Main container for account settings, composing email, session management,
 * appearance, and notification preference cards.
 */

import { useSession, useUser } from '@clerk/nextjs';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SettingsGroupHeading } from '@/features/dashboard/molecules/SettingsGroupHeading';
import { SettingsAppearanceSection } from '@/features/dashboard/organisms/SettingsAppearanceSection';
import { SettingsNotificationsSection } from '@/features/dashboard/organisms/SettingsNotificationsSection';

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
      <div className='space-y-6 py-3'>
        <div className='space-y-3'>
          <LoadingSkeleton height='h-4' width='w-20' />
          <LoadingSkeleton height='h-12' />
        </div>
        <div className='space-y-3'>
          <LoadingSkeleton height='h-4' width='w-32' />
          <LoadingSkeleton height='h-12' />
        </div>
        <div className='space-y-3'>
          <LoadingSkeleton height='h-4' width='w-24' />
          <LoadingSkeleton height='h-12' />
        </div>
        <LoadingSkeleton height='h-12' />
      </div>
    );
  }

  return (
    <>
      <div>
        <SettingsGroupHeading className='pb-3 pt-6 first:pt-0'>
          Email
        </SettingsGroupHeading>
        <EmailManagementCard user={typedUser} />
      </div>
      <div>
        <SettingsGroupHeading className='pb-3 pt-6'>
          Connected accounts
        </SettingsGroupHeading>
        <ConnectedAccountsCard user={typedUser} />
      </div>
      <div>
        <SettingsGroupHeading className='pb-3 pt-6'>
          Sessions
        </SettingsGroupHeading>
        <SessionManagementCard
          user={typedUser}
          activeSessionId={activeSession?.id}
        />
      </div>
    </>
  );
}

interface AccountSettingsSectionProps {
  readonly isGrowth?: boolean;
}

export function AccountSettingsSection({
  isGrowth = false,
}: AccountSettingsSectionProps) {
  return (
    <div className='space-y-0' data-testid='account-settings-section'>
      <ClerkAccountSections />
      <div>
        <SettingsGroupHeading className='pb-3 pt-6'>
          Appearance
        </SettingsGroupHeading>
        <SettingsAppearanceSection />
      </div>
      <div>
        <SettingsGroupHeading className='pb-3 pt-6'>
          Notifications
        </SettingsGroupHeading>
        <SettingsNotificationsSection isGrowth={isGrowth} />
      </div>
    </div>
  );
}

'use client';

/**
 * AccountSettingsSection Component
 *
 * Main container for account settings, composing email, session management,
 * appearance, and notification preference cards.
 */
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsAppearanceSection } from '@/features/dashboard/organisms/SettingsAppearanceSection';
import { SettingsNotificationsSection } from '@/features/dashboard/organisms/SettingsNotificationsSection';
import { useSessionSafe, useUserSafe } from '@/hooks/useClerkSafe';

import { ConnectedAccountsCard } from './ConnectedAccountsCard';
import { EmailManagementCard } from './EmailManagementCard';
import { SessionManagementCard } from './SessionManagementCard';
import type { ClerkUserResource } from './types';

function ClerkAccountSections() {
  const { user, isLoaded } = useUserSafe();
  const { session: activeSession } = useSessionSafe();

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
      <SettingsPanel
        title='Email'
        cardClassName='border-0 bg-transparent shadow-none p-0'
      >
        <EmailManagementCard user={typedUser} />
      </SettingsPanel>
      <SettingsPanel
        title='Connected accounts'
        cardClassName='border-0 bg-transparent shadow-none p-0'
      >
        <ConnectedAccountsCard user={typedUser} />
      </SettingsPanel>
      <SettingsPanel
        title='Sessions'
        cardClassName='border-0 bg-transparent shadow-none p-0'
      >
        <SessionManagementCard
          user={typedUser}
          activeSessionId={activeSession?.id}
        />
      </SettingsPanel>
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
    <div className='space-y-6' data-testid='account-settings-section'>
      <ClerkAccountSections />
      <SettingsAppearanceSection />
      <SettingsNotificationsSection isGrowth={isGrowth} />
    </div>
  );
}

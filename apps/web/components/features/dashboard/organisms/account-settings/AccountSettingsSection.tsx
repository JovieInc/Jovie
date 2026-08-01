'use client';

/**
 * AccountSettingsSection
 *
 * Better Auth–backed account summary for Settings → Account.
 * Shows the authenticated identity from the live session plus supported
 * appearance/notification preferences. Full email/provider/session mutation
 * parity is deferred (legacy Clerk resource controls intentionally removed).
 */
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsAppearanceSection } from '@/features/dashboard/organisms/SettingsAppearanceSection';
import { SettingsNotificationsSection } from '@/features/dashboard/organisms/SettingsNotificationsSection';
import { useUserSafe } from '@/hooks/useJovieAuth';

function AccountIdentitySummary() {
  const { user, isLoaded, isSignedIn } = useUserSafe();

  if (!isLoaded) {
    return (
      <div
        className='min-h-32 space-y-3'
        data-testid='account-identity-loading'
      >
        {[0, 1, 2].map(index => (
          <div key={index} className='space-y-1'>
            <LoadingSkeleton height='h-3' width='w-16' />
            <LoadingSkeleton height='h-4' width='w-44' />
          </div>
        ))}
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <p
        className='flex min-h-32 items-center text-app text-secondary-token'
        data-testid='account-identity-unsigned'
      >
        Sign in to view your account details.
      </p>
    );
  }

  const email = user.primaryEmailAddress?.emailAddress ?? null;
  const displayName = user.fullName?.trim() || null;

  return (
    <dl
      className='min-h-32 space-y-3 text-app'
      data-testid='account-identity-summary'
    >
      <div className='space-y-1'>
        <dt className='text-secondary-token'>Email</dt>
        <dd
          className='break-all text-primary-token'
          data-testid='account-identity-email'
        >
          {email ?? 'No email on this account'}
        </dd>
      </div>
      {displayName ? (
        <div className='space-y-1'>
          <dt className='text-secondary-token'>Name</dt>
          <dd
            className='text-primary-token'
            data-testid='account-identity-name'
          >
            {displayName}
          </dd>
        </div>
      ) : null}
      {user.username ? (
        <div className='space-y-1'>
          <dt className='text-secondary-token'>Handle</dt>
          <dd
            className='break-all text-primary-token'
            data-testid='account-identity-username'
          >
            @{user.username}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

interface AccountSettingsSectionProps {
  readonly isGrowth?: boolean;
}

export function AccountSettingsSection({
  isGrowth = false,
}: AccountSettingsSectionProps) {
  return (
    <div className='space-y-4' data-testid='account-settings-section'>
      <SettingsPanel title='Signed In As' cardClassName='px-4 py-4 sm:px-5'>
        <AccountIdentitySummary />
      </SettingsPanel>
      <SettingsAppearanceSection />
      <SettingsNotificationsSection isGrowth={isGrowth} />
    </div>
  );
}

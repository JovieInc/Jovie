'use client';

import { AccountSettingsSection } from '@/features/dashboard/organisms/account-settings';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';
import { publicEnv } from '@/lib/env-public';

export default function SettingsAccountPage() {
  const { isGrowth } = useSettingsContext();

  return (
    <SettingsSection
      id='account'
      title='Account'
      description='Manage your security, theme, and notification preferences.'
    >
      {publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <AccountSettingsSection isGrowth={isGrowth} />
      ) : (
        <div className='py-4 text-center'>
          <h3 className='mb-3 text-[14px] font-[510] text-primary-token'>
            Account settings unavailable
          </h3>
          <p className='text-[13px] text-secondary'>
            Clerk is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to
            enable account management.
          </p>
        </div>
      )}
    </SettingsSection>
  );
}

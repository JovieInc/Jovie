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
      description='Security, theme, and notifications.'
    >
      {publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <AccountSettingsSection isGrowth={isGrowth} />
      ) : (
        <div className='py-4 text-center'>
          <h3 className='mb-3 text-[14px] font-caption text-primary-token'>
            Account settings unavailable
          </h3>
          <p className='text-[13px] text-secondary'>
            Account management is currently unavailable. Please contact support
            if this issue persists.
          </p>
        </div>
      )}
    </SettingsSection>
  );
}

'use client';

import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsAudienceSection() {
  const [doubleOptIn, setDoubleOptIn] = useState(true);
  const { updateNotifications, isPending } = useNotificationSettingsMutation();

  return (
    <DashboardCard variant='settings' padding='none'>
      <div className='px-5 py-4'>
        <SettingsToggleRow
          title='Require Email Verification'
          description='New fans must confirm their email before receiving notifications.'
          checked={doubleOptIn}
          onCheckedChange={(enabled: boolean) => {
            setDoubleOptIn(enabled);
            updateNotifications({ require_double_opt_in: enabled });
          }}
          disabled={isPending}
          ariaLabel='Toggle email verification requirement'
        />
      </div>
    </DashboardCard>
  );
}

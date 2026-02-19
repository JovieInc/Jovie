'use client';

import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsNotificationsSection() {
  const [marketingEmails, setMarketingEmails] = useState(true);
  const { updateNotifications, isPending } = useNotificationSettingsMutation();

  return (
    <DashboardCard variant='settings' padding='none'>
      <div className='px-4 py-3'>
        <SettingsToggleRow
          title='Marketing Emails'
          description='Receive updates about new features, tips, and promotional offers.'
          checked={marketingEmails}
          onCheckedChange={(enabled: boolean) => {
            setMarketingEmails(enabled);
            updateNotifications({ marketing_emails: enabled });
          }}
          disabled={isPending}
          ariaLabel='Toggle marketing emails'
        />
      </div>
    </DashboardCard>
  );
}

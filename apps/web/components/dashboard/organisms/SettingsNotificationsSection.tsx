'use client';

import { useCallback, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsNotificationsSection() {
  const [marketingEmails, setMarketingEmails] = useState(true);
  const { updateNotifications, isPending } = useNotificationSettingsMutation();

  const handleMarketingToggle = useCallback(
    (enabled: boolean) => {
      // Optimistically update local state
      setMarketingEmails(enabled);

      // Persist to server with automatic error handling and toast
      updateNotifications({ marketing_emails: enabled });
    },
    [updateNotifications]
  );

  return (
    <DashboardCard variant='settings'>
      <SettingsToggleRow
        title='Marketing Emails'
        description='Receive updates about new features, tips, and promotional offers from Jovie.'
        checked={marketingEmails}
        onCheckedChange={enabled => {
          handleMarketingToggle(enabled);
        }}
        disabled={isPending}
        ariaLabel='Toggle marketing emails'
      />
    </DashboardCard>
  );
}

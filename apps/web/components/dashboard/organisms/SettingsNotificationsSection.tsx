'use client';

import { useCallback, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsNotificationsSection() {
  const [marketingEmails, setMarketingEmails] = useState(true);
  const [autoReleaseDayEmail, setAutoReleaseDayEmail] = useState(true);
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

  const handleReleaseDayEmailToggle = useCallback(
    (enabled: boolean) => {
      setAutoReleaseDayEmail(enabled);
      updateNotifications({ auto_release_day_email: enabled });
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
          void handleMarketingToggle(enabled);
        }}
        disabled={isPending}
        ariaLabel='Toggle marketing emails'
      />
      <div className='mt-4 border-t border-border pt-4'>
        <SettingsToggleRow
          title='Automatically email fans on release day'
          description='When a new release goes live, automatically notify your subscribers. You can disable this per-release.'
          checked={autoReleaseDayEmail}
          onCheckedChange={enabled => {
            void handleReleaseDayEmailToggle(enabled);
          }}
          disabled={isPending}
          ariaLabel='Toggle automatic release day emails to fans'
        />
      </div>
      {isPending && <p className='text-xs text-tertiary-token mt-2'>Saving…</p>}
    </DashboardCard>
  );
}

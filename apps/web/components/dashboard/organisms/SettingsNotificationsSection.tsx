'use client';

import { useCallback, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsNotificationsSection() {
  const [marketingEmails, setMarketingEmails] = useState(true);
  const [doubleOptIn, setDoubleOptIn] = useState(true);
  const { updateNotifications, isPending } = useNotificationSettingsMutation();

  const handleMarketingToggle = useCallback(
    (enabled: boolean) => {
      setMarketingEmails(enabled);
      updateNotifications({ marketing_emails: enabled });
    },
    [updateNotifications]
  );

  const handleDoubleOptInToggle = useCallback(
    (enabled: boolean) => {
      setDoubleOptIn(enabled);
      updateNotifications({ require_double_opt_in: enabled });
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
      <SettingsToggleRow
        title='Require Email Verification'
        description='New fans must confirm their email before receiving notifications. Prevents spam sign-ups and protects your sender reputation.'
        checked={doubleOptIn}
        onCheckedChange={enabled => {
          void handleDoubleOptInToggle(enabled);
        }}
        disabled={isPending}
        ariaLabel='Toggle email verification requirement'
      />
      {isPending && <p className='text-xs text-tertiary-token mt-2'>Saving…</p>}
    </DashboardCard>
  );
}

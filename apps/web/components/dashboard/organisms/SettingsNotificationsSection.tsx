'use client';

import { useState } from 'react';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsNotificationsSection() {
  const [marketingEmails, setMarketingEmails] = useState(true);
  const { updateNotifications, isPending } = useNotificationSettingsMutation();

  return (
    <div className='py-3 border-b border-subtle'>
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
  );
}

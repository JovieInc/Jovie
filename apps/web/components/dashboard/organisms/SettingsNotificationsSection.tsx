'use client';

import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsNotificationsSection() {
  const [marketingEmails, setMarketingEmails] = useState(true);
  const [doubleOptIn, setDoubleOptIn] = useState(true);
  const [pendingBySetting, setPendingBySetting] = useState<{
    marketingEmails: boolean;
    doubleOptIn: boolean;
  }>({
    marketingEmails: false,
    doubleOptIn: false,
  });

  const { updateNotificationsAsync } = useNotificationSettingsMutation();

  const handleMarketingEmailsToggle = async (enabled: boolean) => {
    const previousValue = marketingEmails;
    setMarketingEmails(enabled);
    setPendingBySetting(prev => ({ ...prev, marketingEmails: true }));

    try {
      await updateNotificationsAsync({ marketing_emails: enabled });
    } catch {
      setMarketingEmails(previousValue);
    } finally {
      setPendingBySetting(prev => ({ ...prev, marketingEmails: false }));
    }
  };

  const handleDoubleOptInToggle = async (enabled: boolean) => {
    const previousValue = doubleOptIn;
    setDoubleOptIn(enabled);
    setPendingBySetting(prev => ({ ...prev, doubleOptIn: true }));

    try {
      await updateNotificationsAsync({ require_double_opt_in: enabled });
    } catch {
      setDoubleOptIn(previousValue);
    } finally {
      setPendingBySetting(prev => ({ ...prev, doubleOptIn: false }));
    }
  };

  return (
    <DashboardCard variant='settings'>
      <div className='space-y-3 sm:space-y-5'>
        <SettingsToggleRow
          title='Marketing Emails'
          description='Receive updates about new features, tips, and promotional offers from Jovie.'
          checked={marketingEmails}
          onCheckedChange={handleMarketingEmailsToggle}
          disabled={pendingBySetting.marketingEmails}
          ariaLabel='Toggle marketing emails'
        />
        <div className='border-t border-subtle' />
        <SettingsToggleRow
          title='Require Email Verification'
          description='New fans must confirm their email before receiving notifications. Prevents spam sign-ups and protects your sender reputation.'
          checked={doubleOptIn}
          onCheckedChange={handleDoubleOptInToggle}
          disabled={pendingBySetting.doubleOptIn}
          ariaLabel='Toggle email verification requirement'
        />
      </div>
    </DashboardCard>
  );
}

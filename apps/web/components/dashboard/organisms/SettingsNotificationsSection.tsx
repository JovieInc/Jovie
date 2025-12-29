'use client';

import { useCallback, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';

export function SettingsNotificationsSection() {
  const [marketingEmails, setMarketingEmails] = useState(true);
  const [isMarketingSaving, setIsMarketingSaving] = useState(false);

  const handleMarketingToggle = useCallback(async (enabled: boolean) => {
    setIsMarketingSaving(true);
    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            settings: {
              marketing_emails: enabled,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update marketing preferences');
      }

      setMarketingEmails(enabled);
    } catch (error) {
      console.error('Failed to update marketing preferences:', error);
      setMarketingEmails(!enabled);
    } finally {
      setIsMarketingSaving(false);
    }
  }, []);

  return (
    <DashboardCard variant='settings'>
      <SettingsToggleRow
        title='Marketing Emails'
        description='Receive updates about new features, tips, and promotional offers from Jovie.'
        checked={marketingEmails}
        onCheckedChange={enabled => {
          void handleMarketingToggle(enabled);
        }}
        disabled={isMarketingSaving}
        ariaLabel='Toggle marketing emails'
      />
    </DashboardCard>
  );
}

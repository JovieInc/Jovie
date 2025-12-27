'use client';

import { useCallback, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';

export function NotificationsSettingsSection() {
  const notificationsGate = useFeatureGate(STATSIG_FLAGS.NOTIFICATIONS);
  const notificationsEnabled = notificationsGate.value;

  const [marketingEmails, setMarketingEmails] = useState(true);
  const [isMarketingSaving, setIsMarketingSaving] = useState(false);

  const handleMarketingToggle = useCallback(async (enabled: boolean) => {
    setIsMarketingSaving(true);
    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            settings: { marketing_emails: enabled },
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

  if (!notificationsEnabled) {
    return (
      <DashboardCard variant='settings'>
        <div className='text-center py-4'>
          <h3 className='text-lg font-medium text-primary mb-2'>
            Notifications are not available yet
          </h3>
          <p className='text-sm text-secondary'>
            We&apos;re focused on getting the core Jovie profile experience
            right before launching notifications.
          </p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard variant='settings'>
      <SettingsToggleRow
        title='Marketing Emails'
        description='Receive updates about new features, tips, and promotional offers from Jovie.'
        checked={marketingEmails}
        onCheckedChange={enabled => void handleMarketingToggle(enabled)}
        disabled={isMarketingSaving}
        ariaLabel='Toggle marketing emails'
      />
    </DashboardCard>
  );
}

'use client';

import { useRef, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useOptimisticMutation } from '@/lib/hooks/useOptimisticMutation';

export function SettingsNotificationsSection() {
  const [marketingEmails, setMarketingEmails] = useState(true);

  // Capture original value before optimistic update for accurate rollback
  const originalValueRef = useRef(marketingEmails);

  const { mutate: updateMarketingPreference, isLoading } =
    useOptimisticMutation({
      mutationFn: async (enabled: boolean, signal) => {
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
          signal,
        });

        if (!response.ok) {
          throw new Error('Failed to update marketing preferences');
        }

        return response.json();
      },
      onOptimisticUpdate: enabled => {
        // Capture the current value before updating
        originalValueRef.current = marketingEmails;
        setMarketingEmails(enabled);
      },
      onRollback: () => {
        // Restore the captured original value
        setMarketingEmails(originalValueRef.current);
      },
      successMessage: 'Marketing preferences updated',
      errorMessage: 'Failed to update preferences. Please try again.',
    });

  return (
    <DashboardCard variant='settings'>
      <SettingsToggleRow
        title='Marketing Emails'
        description='Receive updates about new features, tips, and promotional offers from Jovie.'
        checked={marketingEmails}
        onCheckedChange={enabled => {
          void updateMarketingPreference(enabled);
        }}
        disabled={isLoading}
        ariaLabel='Toggle marketing emails'
      />
    </DashboardCard>
  );
}

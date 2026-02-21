'use client';

import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsNotificationsSection() {
  const { updateNotificationsAsync, isPending } =
    useNotificationSettingsMutation();

  const { checked, handleToggle } = useOptimisticToggle({
    initialValue: true,
    mutateAsync: enabled =>
      updateNotificationsAsync({ marketing_emails: enabled }),
    errorMessage: 'Failed to update notification settings. Please try again.',
  });

  return (
    <DashboardCard variant='settings' padding='none'>
      <div className='px-4 py-3'>
        <SettingsToggleRow
          title='Marketing Emails'
          description='Receive updates about new features, tips, and promotional offers.'
          checked={checked}
          onCheckedChange={handleToggle}
          disabled={isPending}
          ariaLabel='Toggle marketing emails'
        />
      </div>
    </DashboardCard>
  );
}

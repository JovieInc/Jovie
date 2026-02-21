'use client';

import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsAudienceSection() {
  const { updateNotificationsAsync } = useNotificationSettingsMutation();

  const {
    checked: doubleOptIn,
    handleToggle,
    isPending,
  } = useOptimisticToggle({
    initialValue: true,
    mutateAsync: enabled =>
      updateNotificationsAsync({ require_double_opt_in: enabled }),
    errorMessage: 'Failed to update audience setting. Please try again.',
  });

  return (
    <DashboardCard variant='settings' padding='none'>
      <div className='px-4 py-3'>
        <SettingsToggleRow
          title='Require Email Verification'
          description='New fans must confirm their email before receiving notifications.'
          checked={doubleOptIn}
          onCheckedChange={handleToggle}
          disabled={isPending}
          ariaLabel='Toggle email verification requirement'
        />
      </div>
    </DashboardCard>
  );
}

'use client';

import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

interface SettingsNotificationsSectionProps {
  readonly isGrowth?: boolean;
}

export function SettingsNotificationsSection({
  isGrowth = false,
}: SettingsNotificationsSectionProps) {
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
          title='Double opt-in email confirmation'
          description='Subscriber emails use double opt-in by default to prevent spam. On Growth, you can disable this if you use a separate provider (for example, Mailchimp or webhooks).'
          checked={checked}
          onCheckedChange={handleToggle}
          disabled={isPending || !isGrowth}
          ariaLabel='Toggle double opt-in email confirmation'
          gated={!isGrowth}
          gatePlanName='Growth'
        />
      </div>
    </DashboardCard>
  );
}

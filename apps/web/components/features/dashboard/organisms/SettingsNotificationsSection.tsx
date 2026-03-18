'use client';

import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsToggleRow } from '@/features/dashboard/molecules/SettingsToggleRow';
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
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Notifications'
        subtitle='Control how fan verification works.'
        className='min-h-0 px-4 py-3'
      />
      <div className='border-t border-subtle/60 px-4 py-3'>
        <SettingsToggleRow
          title='Double opt-in verification'
          description='New fans verify their email before notifications begin. This prevents spam signups and protects your deliverability. On Growth, you can disable this.'
          checked={checked}
          onCheckedChange={handleToggle}
          disabled={isPending || !isGrowth}
          ariaLabel='Toggle double opt-in email confirmation'
          gated={!isGrowth}
          gatePlanName='Growth'
          gateFeatureContext='Double opt-in confirmation'
        />
      </div>
    </DashboardCard>
  );
}

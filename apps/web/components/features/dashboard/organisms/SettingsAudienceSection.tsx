'use client';

import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { SettingsToggleRow } from '@/features/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

export function SettingsAudienceSection() {
  const { updateNotificationsAsync } = useNotificationSettingsMutation();

  const {
    checked: doubleOptIn,
    handleToggle,
    isPending,
    saveStatus,
  } = useOptimisticToggle({
    initialValue: true,
    mutateAsync: (enabled: boolean) =>
      updateNotificationsAsync({ require_double_opt_in: enabled }),
    errorMessage: 'Failed to update email verification setting.',
  });

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Audience verification'
        subtitle='Control whether new fans must confirm their email before receiving updates.'
        className='min-h-0 px-4 py-3'
        actions={<SettingsStatusPill status={saveStatus} />}
        actionsClassName='w-auto shrink-0'
      />
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

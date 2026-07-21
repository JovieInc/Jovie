'use client';

import { ShieldCheck } from 'lucide-react';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
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
    <SettingsPanel
      title='Audience verification'
      description='Control whether new fans must confirm their email before receiving updates.'
      actions={<SettingsStatusPill status={saveStatus} />}
    >
      <div className='px-4 py-4 sm:px-5'>
        <SettingsToggleRow
          icon={<ShieldCheck className='h-4 w-4' aria-hidden />}
          title='Require email verification'
          description='New fans confirm their email before they start receiving updates, which keeps your list cleaner and protects deliverability.'
          checked={doubleOptIn}
          onCheckedChange={handleToggle}
          disabled={isPending}
          ariaLabel='Toggle email verification requirement'
        />
      </div>
    </SettingsPanel>
  );
}

'use client';

import { ShieldCheck } from 'lucide-react';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
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
    <SettingsPanel
      title='Verification'
      description='Choose how email confirmation works before fan notifications begin.'
    >
      <div className='px-4 py-4 sm:px-5'>
        <SettingsToggleRow
          icon={<ShieldCheck className='h-4 w-4' aria-hidden />}
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
    </SettingsPanel>
  );
}

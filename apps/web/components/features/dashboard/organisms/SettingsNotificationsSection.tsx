'use client';

import { ShieldCheck } from 'lucide-react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsToggleRow } from '@/features/dashboard/molecules/SettingsToggleRow';
import { useNotificationSettingsMutation } from '@/lib/queries';

interface SettingsNotificationsSectionProps {
  readonly isGrowth?: boolean;
}

// ui-casing-allow: Growth is a plan name
const DOUBLE_OPT_IN_DESCRIPTION =
  'New fans verify their email before notifications begin. This prevents spam signups and protects your deliverability. On Growth, you can disable this.';

export function SettingsNotificationsSection({
  isGrowth = false,
}: SettingsNotificationsSectionProps) {
  const { selectedProfile } = useDashboardData();
  const selectedProfileId = selectedProfile?.id;
  const { updateNotificationsAsync, isPending } =
    useNotificationSettingsMutation(selectedProfileId);

  const { checked, handleToggle } = useOptimisticToggle({
    initialValue: true,
    mutateAsync: async enabled => {
      if (!selectedProfileId) {
        throw new Error('Cannot update settings without a selected profile');
      }
      await updateNotificationsAsync({ marketing_emails: enabled });
    },
    errorMessage: 'Failed to update notification settings. Please try again.',
  });

  return (
    <SettingsPanel
      title='Verification'
      description='Choose how email confirmation works before fan notifications begin.'
    >
      <div className='px-4 py-4 sm:px-5'>
        {isGrowth ? (
          <SettingsToggleRow
            icon={<ShieldCheck className='h-4 w-4' aria-hidden />}
            title='Double opt-in verification'
            description={DOUBLE_OPT_IN_DESCRIPTION}
            checked={checked}
            onCheckedChange={handleToggle}
            disabled={isPending || !selectedProfileId}
            ariaLabel='Toggle double opt-in email confirmation'
          />
        ) : (
          <SettingsToggleRow
            gated
            icon={<ShieldCheck className='h-4 w-4' aria-hidden />}
            title='Double opt-in verification'
            description={DOUBLE_OPT_IN_DESCRIPTION}
            gatePlanName='Growth'
            gateFeatureContext='Double opt-in confirmation'
          />
        )}
      </div>
    </SettingsPanel>
  );
}

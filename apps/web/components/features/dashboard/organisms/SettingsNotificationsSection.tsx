'use client';

import { ShieldCheck } from 'lucide-react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { useNotificationSettingsMutation } from '@/lib/queries';

interface SettingsNotificationsSectionProps {
  readonly isGrowth?: boolean;
}

// ui-casing-allow: Max is a plan name
const DOUBLE_OPT_IN_DESCRIPTION =
  'New fans verify their email before notifications begin. This prevents spam signups and protects your deliverability. On Max, you can disable this.';

export function SettingsNotificationsSection({
  isGrowth = false,
}: SettingsNotificationsSectionProps) {
  const { selectedProfile, updateSelectedProfileSettings } = useDashboardData();
  const selectedProfileId = selectedProfile?.id;
  const storedDoubleOptIn = selectedProfile?.settings?.require_double_opt_in;
  const initialDoubleOptIn =
    typeof storedDoubleOptIn === 'boolean' ? storedDoubleOptIn : true;
  const { updateNotificationsAsync, isPending } =
    useNotificationSettingsMutation(selectedProfileId);

  const { checked, handleToggle } = useOptimisticToggle({
    initialValue: initialDoubleOptIn,
    syncKey: selectedProfileId,
    mutateAsync: async enabled => {
      if (!selectedProfileId) {
        throw new Error('Cannot update settings without a selected profile');
      }
      await updateNotificationsAsync({ require_double_opt_in: enabled });
      updateSelectedProfileSettings?.(selectedProfileId, {
        require_double_opt_in: enabled,
      });
    },
    errorMessage: 'Failed to update notification settings. Please try again.',
    showErrorToast: false,
  });

  return (
    <SettingsPanel
      title='Verification'
      description='Choose how email confirmation works before fan notifications begin.'
      bodyClassName='px-4 py-4 sm:px-5'
    >
      {isGrowth ? (
        <SettingsToggleRow
          icon={<ShieldCheck className='h-4 w-4' aria-hidden />}
          title='Double Opt-in Verification'
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
          title='Double Opt-in Verification'
          description={DOUBLE_OPT_IN_DESCRIPTION}
          gatePlanName='Max'
          gateFeatureContext='Double opt-in confirmation'
        />
      )}
    </SettingsPanel>
  );
}

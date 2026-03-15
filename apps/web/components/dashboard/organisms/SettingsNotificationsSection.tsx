'use client';

import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
    <ContentSurfaceCard className='overflow-hidden bg-surface-0'>
      <ContentSectionHeader
        title='Notifications'
        subtitle='Control how subscriber confirmation behaves in Jovie.'
        className='min-h-0 px-4 py-3'
      />
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
    </ContentSurfaceCard>
  );
}

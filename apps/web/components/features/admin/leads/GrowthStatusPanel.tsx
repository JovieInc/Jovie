'use client';

import { Switch } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { type ReactNode, startTransition } from 'react';
import { toast } from 'sonner';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  queryKeys,
  useLeadPipelineSettingsQuery,
  useUpdateLeadPipelineSettingsMutation,
} from '@/lib/queries';
import { detectSpeed, GtmSpeedDial } from './GtmSpeedDial';

export function GrowthStatusPanel() {
  const queryClient = useQueryClient();
  const settingsQuery = useLeadPipelineSettingsQuery();
  const updateSettingsMutation = useUpdateLeadPipelineSettingsMutation();
  const settings = settingsQuery.data?.settings;

  async function togglePipeline(enabled: boolean) {
    if (!settings) return;

    try {
      await updateSettingsMutation.mutateAsync({ ...settings, enabled });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.leads.settings(),
      });
      toast.success(
        enabled ? 'Growth automation enabled' : 'Growth automation paused'
      );
    } catch {
      toast.error('Failed to update Growth automation');
    }
  }

  const isBusy = settingsQuery.isLoading || updateSettingsMutation.isPending;

  let headerActions: ReactNode = null;
  if (settings) {
    headerActions = (
      <div className='flex items-center gap-2'>
        <span className='text-[12px] font-semibold text-secondary-token'>
          {settings.enabled ? 'On' : 'Off'}
        </span>
        <Switch
          checked={settings.enabled}
          disabled={isBusy}
          onCheckedChange={checked => {
            startTransition(() => {
              void togglePipeline(checked);
            });
          }}
          aria-label='Toggle Growth automation'
        />
      </div>
    );
  } else if (isBusy) {
    headerActions = (
      <Loader2 className='size-4 animate-spin text-tertiary-token' />
    );
  }

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <ContentSectionHeader
        title='Growth Status'
        subtitle='Keep the pipeline on, verify today’s throughput, and turn it off when needed.'
        actions={headerActions}
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        actionsClassName='shrink-0'
      />

      <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
        {settings ? (
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <ContentMetricCard
              label='Pipeline'
              value={settings.enabled ? 'Active' : 'Paused'}
              subtitle={`Mode: ${detectSpeed(settings) === 'custom' ? 'Custom' : detectSpeed(settings)}`}
              className='h-full bg-surface-0 shadow-none'
            />
            <ContentMetricCard
              label='Query Budget'
              value={`${settings.queriesUsedToday}/${settings.dailyQueryBudget}`}
              subtitle='Used today'
              className='h-full bg-surface-0 shadow-none'
            />
            <ContentMetricCard
              label='Auto-Ingested'
              value={settings.autoIngestedToday}
              subtitle={`Limit ${settings.autoIngestDailyLimit} per day`}
              className='h-full bg-surface-0 shadow-none'
            />
            <ContentMetricCard
              label='Send Cap'
              value={settings.dailySendCap}
              subtitle={`${settings.maxPerHour}/hour max`}
              className='h-full bg-surface-0 shadow-none'
            />
          </div>
        ) : (
          <div className='px-1 py-3 text-sm text-secondary-token'>
            Loading Growth status...
          </div>
        )}

        <GtmSpeedDial />
      </div>
    </ContentSurfaceCard>
  );
}

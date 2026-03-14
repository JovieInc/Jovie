'use client';

import { Button, Input, Switch } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, Zap } from 'lucide-react';
import { type ChangeEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  type LeadPipelineSettings,
  useLeadPipelineSettingsQuery,
  useRunLeadDiscoveryMutation,
  useRunLeadQualificationMutation,
  useUpdateLeadPipelineSettingsMutation,
} from '@/lib/queries';
import { queryKeys } from '@/lib/queries/keys';

export function LeadPipelineControls() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<LeadPipelineSettings | null>(null);

  const settingsQuery = useLeadPipelineSettingsQuery();
  const saveSettingsMutation = useUpdateLeadPipelineSettingsMutation();
  const discoveryMutation = useRunLeadDiscoveryMutation();
  const qualificationMutation = useRunLeadQualificationMutation();

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      setSettings(settingsQuery.data.settings);
    }
  }, [settingsQuery.data]);

  async function save() {
    if (!settings) return;
    try {
      const data = await saveSettingsMutation.mutateAsync(settings);
      setSettings(data.settings);
      toast.success('Pipeline settings saved');
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.leads.settings(),
      });
    } catch {
      toast.error('Failed to save settings');
    }
  }

  async function triggerDiscovery() {
    try {
      const data = await discoveryMutation.mutateAsync();
      toast.success(
        `Discovery complete: ${data.result.newLeadsFound} new leads from ${data.result.queriesUsed} queries`
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.leads.all(),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Discovery failed');
    }
  }

  async function triggerQualification() {
    try {
      const data = await qualificationMutation.mutateAsync();
      toast.success(data.message);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.leads.all(),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Qualification failed'
      );
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <div className='border-b border-subtle px-4 py-4 text-sm text-secondary-token'>
        Loading pipeline settings...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className='border-b border-subtle px-4 py-4 text-sm text-destructive'>
        Unable to load pipeline settings. Please refresh.
      </div>
    );
  }

  return (
    <section className='rounded-lg border border-subtle p-4 sm:p-6'>
      <div className='mb-4'>
        <h2 className='text-sm font-semibold text-primary-token'>
          Pipeline controls
        </h2>
        <p className='mt-1 text-xs text-secondary-token'>
          Toggle discovery, qualification, and auto-ingest settings.
        </p>
      </div>

      <div className='space-y-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm text-primary-token'>Pipeline enabled</p>
            <p className='text-xs text-secondary-token'>
              Master switch for the entire lead discovery pipeline.
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={checked =>
              setSettings(s => (s ? { ...s, enabled: checked } : s))
            }
            aria-label='Toggle pipeline'
            disabled={saveSettingsMutation.isPending}
          />
        </div>

        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm text-primary-token'>Discovery enabled</p>
            <p className='text-xs text-secondary-token'>
              Run Google CSE searches on cron to find new leads.
            </p>
          </div>
          <Switch
            checked={settings.discoveryEnabled}
            onCheckedChange={checked =>
              setSettings(s => (s ? { ...s, discoveryEnabled: checked } : s))
            }
            aria-label='Toggle discovery'
            disabled={saveSettingsMutation.isPending}
          />
        </div>

        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm text-primary-token'>Auto-ingest on approve</p>
            <p className='text-xs text-secondary-token'>
              Automatically create creator profiles when leads are approved.
            </p>
          </div>
          <Switch
            checked={settings.autoIngestEnabled}
            onCheckedChange={checked =>
              setSettings(s => (s ? { ...s, autoIngestEnabled: checked } : s))
            }
            aria-label='Toggle auto-ingest'
            disabled={saveSettingsMutation.isPending}
          />
        </div>

        <div className='flex flex-wrap gap-4'>
          <label htmlFor='auto-ingest-min-score' className='block'>
            <span className='text-sm text-primary-token'>
              Min fit score for auto-ingest
            </span>
            <Input
              id='auto-ingest-min-score'
              type='number'
              min={0}
              max={100}
              value={settings.autoIngestMinFitScore}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const val = Number.parseInt(e.target.value, 10);
                setSettings(s =>
                  s
                    ? {
                        ...s,
                        autoIngestMinFitScore: Number.isFinite(val) ? val : 0,
                      }
                    : s
                );
              }}
              className='mt-1 w-24'
              disabled={saveSettingsMutation.isPending}
            />
          </label>

          <label htmlFor='daily-query-budget' className='block'>
            <span className='text-sm text-primary-token'>
              Daily query budget
            </span>
            <Input
              id='daily-query-budget'
              type='number'
              min={1}
              max={10000}
              value={settings.dailyQueryBudget}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const val = Number.parseInt(e.target.value, 10);
                setSettings(s =>
                  s
                    ? {
                        ...s,
                        dailyQueryBudget: Number.isFinite(val) ? val : 100,
                      }
                    : s
                );
              }}
              className='mt-1 w-24'
              disabled={saveSettingsMutation.isPending}
            />
            <p className='mt-1 text-xs text-secondary-token'>
              Used today: {settings.queriesUsedToday}
            </p>
          </label>
        </div>

        <div className='flex flex-wrap gap-2 pt-2'>
          <Button
            onClick={() => void save()}
            disabled={saveSettingsMutation.isPending}
            size='sm'
          >
            {saveSettingsMutation.isPending && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            Save settings
          </Button>

          <Button
            variant='outline'
            size='sm'
            onClick={() => void triggerDiscovery()}
            disabled={discoveryMutation.isPending}
          >
            {discoveryMutation.isPending ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Play className='mr-2 h-4 w-4' />
            )}
            Run discovery
          </Button>

          <Button
            variant='outline'
            size='sm'
            onClick={() => void triggerQualification()}
            disabled={qualificationMutation.isPending}
          >
            {qualificationMutation.isPending ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Zap className='mr-2 h-4 w-4' />
            )}
            Qualify discovered
          </Button>
        </div>
      </div>
    </section>
  );
}

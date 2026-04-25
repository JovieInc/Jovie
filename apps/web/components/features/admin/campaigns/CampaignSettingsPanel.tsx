'use client';

import { Button, Input } from '@jovie/ui';
import { Loader2 } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import {
  DEFAULT_THROTTLING,
  type ThrottlingConfig,
  useCampaignSettings,
  useSaveCampaignSettings,
} from '@/lib/queries';

export function CampaignSettingsPanel() {
  const [fitScoreThreshold, setFitScoreThreshold] = useState(50);
  const [limit, setLimit] = useState(20);
  const [throttling, setThrottling] =
    useState<ThrottlingConfig>(DEFAULT_THROTTLING);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const settingsSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    data: savedSettings,
    isLoading: loading,
    isError,
    error,
  } = useCampaignSettings();
  const saveCampaignSettings = useSaveCampaignSettings();

  useEffect(() => {
    if (savedSettings?.settings) {
      const s = savedSettings.settings;
      setFitScoreThreshold(s.fitScoreThreshold);
      setLimit(s.batchLimit);
      setThrottling(s.throttlingConfig);
    }
  }, [savedSettings]);

  useEffect(() => {
    return () => {
      if (settingsSavedTimeoutRef.current) {
        clearTimeout(settingsSavedTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSettingsSaved(false);
    await saveCampaignSettings.mutateAsync({
      fitScoreThreshold,
      batchLimit: limit,
      throttlingConfig: throttling,
    });
    setSettingsSaved(true);
    if (settingsSavedTimeoutRef.current) {
      clearTimeout(settingsSavedTimeoutRef.current);
    }
    settingsSavedTimeoutRef.current = setTimeout(() => {
      setSettingsSaved(false);
      settingsSavedTimeoutRef.current = null;
    }, 3000);
  }, [saveCampaignSettings, fitScoreThreshold, limit, throttling]);

  if (loading) {
    return (
      <SettingsPanel
        title='Growth Defaults'
        description='Set campaign qualification and send pacing defaults. Day-to-day operation lives in Admin Growth.'
      >
        <div className='flex items-center gap-2 px-4 py-4 text-[13px] text-secondary-token sm:px-5'>
          <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
          Loading campaign settings...
        </div>
      </SettingsPanel>
    );
  }

  if (isError) {
    return (
      <SettingsPanel
        title='Growth Defaults'
        description='Set campaign qualification and send pacing defaults. Day-to-day operation lives in Admin Growth.'
      >
        <div className='px-4 py-4 text-[13px] text-destructive sm:px-5'>
          {error instanceof Error
            ? error.message
            : 'Unable to load campaign settings. Please refresh and try again.'}
        </div>
      </SettingsPanel>
    );
  }

  const avgDelaySeconds = Math.round(
    (throttling.minDelayMs + throttling.maxDelayMs) / 2 / 1000
  );
  const effectiveRatePerHour = Math.round(3600 / avgDelaySeconds);

  return (
    <SettingsPanel
      title='Growth Defaults'
      description='Set campaign qualification and send pacing defaults. Day-to-day operation lives in Admin Growth.'
      actions={
        <div className='flex flex-wrap items-center gap-3'>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleSave}
            disabled={saveCampaignSettings.isPending}
          >
            {saveCampaignSettings.isPending ? (
              <>
                <Icon
                  name='Loader2'
                  className='mr-2 h-3.5 w-3.5 animate-spin'
                />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
          {settingsSaved ? (
            <output
              className='flex items-center gap-1 text-xs text-success'
              aria-live='polite'
            >
              <Icon name='CheckCircle' className='h-3.5 w-3.5' />
              Saved
            </output>
          ) : null}
        </div>
      }
    >
      <div className='space-y-4 px-4 py-4 sm:px-5'>
        {/* Targeting */}
        <div className='grid gap-4 md:grid-cols-2'>
          <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
            <div className='space-y-2'>
              <label
                htmlFor='settings-fit-score'
                className='text-[13px] font-medium text-primary-token'
              >
                Minimum fit score
              </label>
              <div className='flex items-center gap-4'>
                <input
                  id='settings-fit-score'
                  type='range'
                  min={0}
                  max={100}
                  value={fitScoreThreshold}
                  onChange={e => setFitScoreThreshold(Number(e.target.value))}
                  className='flex-1'
                />
                <span className='w-12 text-right font-mono text-sm text-primary-token'>
                  {fitScoreThreshold}
                </span>
              </div>
              <p className='text-[12px] text-secondary-token'>
                Only invite profiles with fit score {'>='} {fitScoreThreshold}
              </p>
            </div>
          </ContentSurfaceCard>

          <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
            <div className='space-y-2'>
              <label
                htmlFor='settings-batch-size'
                className='text-[13px] font-medium text-primary-token'
              >
                Batch size
              </label>
              <Input
                id='settings-batch-size'
                type='number'
                min={1}
                max={100}
                value={limit}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setLimit(Number(e.target.value))
                }
                className='w-full'
              />
              <p className='text-[12px] text-secondary-token'>
                Maximum invites to send per batch
              </p>
            </div>
          </ContentSurfaceCard>
        </div>

        {/* Throttling */}
        <div className='grid gap-4 md:grid-cols-3'>
          <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
            <div className='space-y-2'>
              <label
                htmlFor='settings-min-delay'
                className='text-[13px] font-medium text-primary-token'
              >
                Min delay (seconds)
              </label>
              <Input
                id='settings-min-delay'
                type='number'
                min={10}
                max={300}
                value={throttling.minDelayMs / 1000}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setThrottling(t => {
                    const newMin = Number(e.target.value) * 1000;
                    return {
                      ...t,
                      minDelayMs: newMin,
                      maxDelayMs: Math.max(newMin, t.maxDelayMs),
                    };
                  })
                }
                className='w-full'
              />
            </div>
          </ContentSurfaceCard>

          <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
            <div className='space-y-2'>
              <label
                htmlFor='settings-max-delay'
                className='text-[13px] font-medium text-primary-token'
              >
                Max delay (seconds)
              </label>
              <Input
                id='settings-max-delay'
                type='number'
                min={30}
                max={600}
                value={throttling.maxDelayMs / 1000}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setThrottling(t => {
                    const newMax = Number(e.target.value) * 1000;
                    return {
                      ...t,
                      minDelayMs: Math.min(t.minDelayMs, newMax),
                      maxDelayMs: newMax,
                    };
                  })
                }
                className='w-full'
              />
            </div>
          </ContentSurfaceCard>

          <ContentMetricCard
            label='Effective Rate'
            value={`~${effectiveRatePerHour}/hour`}
            subtitle={`Avg delay: ${avgDelaySeconds}s`}
            className='h-full bg-surface-0 shadow-none'
            labelClassName='tracking-[0.06em]'
            valueClassName='text-[24px]'
          />
        </div>

        <ContentSurfaceCard className='flex items-start gap-2 border-warning/20 bg-warning/10 px-4 py-3'>
          <Icon
            name='AlertTriangle'
            className='mt-0.5 h-4 w-4 shrink-0 text-warning'
          />
          <p className='text-[12px] text-warning'>
            Delays are randomized between min and max to appear human-like. Stay
            under 50/hour to avoid spam filters.
          </p>
        </ContentSurfaceCard>

        {saveCampaignSettings.error && (
          <p className='text-xs text-destructive'>
            {saveCampaignSettings.error.message}
          </p>
        )}
      </div>
    </SettingsPanel>
  );
}

'use client';

import { Button, Input } from '@jovie/ui';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  useWaitlistSettingsMutation,
  useWaitlistSettingsQuery,
  type WaitlistSettingsResponse,
} from '@/lib/queries';

export function WaitlistSettingsPanel() {
  const {
    data: fetchedSettings,
    isLoading: loading,
    isError,
    error,
  } = useWaitlistSettingsQuery();

  const { mutate: save, isPending: saving } = useWaitlistSettingsMutation();

  // Local state for form edits (initialized from query data)
  const [settings, setSettings] = useState<WaitlistSettingsResponse | null>(
    null
  );

  // Sync fetched data into local state
  useEffect(() => {
    if (fetchedSettings && !settings) {
      setSettings(fetchedSettings);
    }
  }, [fetchedSettings, settings]);

  const handleSave = () => {
    if (!settings) return;
    save({
      gateEnabled: settings.gateEnabled,
      autoAcceptEnabled: settings.autoAcceptEnabled,
      autoAcceptDailyLimit: settings.autoAcceptDailyLimit,
    });
  };

  if (loading) {
    return (
      <ContentSurfaceCard className='flex items-center gap-2 px-4 py-3.5 text-[13px] text-(--linear-text-secondary)'>
        <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
        Loading waitlist settings...
      </ContentSurfaceCard>
    );
  }

  if (isError || !settings) {
    return (
      <ContentSurfaceCard className='border-destructive/25 bg-destructive/5 px-4 py-3.5 text-[13px] text-destructive'>
        {error instanceof Error
          ? error.message
          : 'Unable to load waitlist settings. Please refresh and try again.'}
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Waitlist gate controls'
        subtitle='Control approvals, auto-accept behavior, and daily intake limits.'
        className='min-h-0 px-4 py-3'
      />

      <div className='space-y-3 px-4 py-3'>
        <ContentSurfaceCard className='bg-(--linear-bg-surface-0) px-4 py-3.5'>
          <SettingsToggleRow
            title='Waitlist gate'
            description='When disabled, new submissions bypass manual approval.'
            checked={settings.gateEnabled}
            onCheckedChange={checked =>
              setSettings(current =>
                current ? { ...current, gateEnabled: checked } : current
              )
            }
            ariaLabel='Toggle waitlist gate'
            disabled={saving}
          />
        </ContentSurfaceCard>

        <ContentSurfaceCard className='bg-(--linear-bg-surface-0) px-4 py-3.5'>
          <SettingsToggleRow
            title='Auto-accept'
            description='Automatically approve a limited number of new submissions each day.'
            checked={settings.autoAcceptEnabled}
            onCheckedChange={checked =>
              setSettings(current =>
                current ? { ...current, autoAcceptEnabled: checked } : current
              )
            }
            ariaLabel='Toggle auto-accept'
            disabled={saving}
          />
        </ContentSurfaceCard>

        <ContentSurfaceCard className='flex items-center justify-between gap-3 bg-(--linear-bg-surface-0) px-4 py-3.5'>
          <div className='min-w-0'>
            <p className='text-[13px] font-[510] text-primary-token'>
              Daily limit
            </p>
            <p className='mt-0.5 text-[13px] text-secondary-token'>
              Today: {settings.autoAcceptedToday}
            </p>
          </div>
          <Input
            type='number'
            min={0}
            max={10000}
            value={settings.autoAcceptDailyLimit}
            onChange={event => {
              const next = Number.parseInt(event.target.value, 10);
              setSettings(current =>
                current
                  ? {
                      ...current,
                      autoAcceptDailyLimit: Number.isFinite(next) ? next : 0,
                    }
                  : current
              );
            }}
            size='sm'
            className='w-24 text-right tabular-nums'
            disabled={saving}
            aria-label='Daily auto-accept limit'
          />
        </ContentSurfaceCard>

        <div className='flex justify-end pt-1'>
          <Button
            variant='primary'
            size='sm'
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className='mr-1.5 h-3 w-3 animate-spin' />}
            Save
          </Button>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

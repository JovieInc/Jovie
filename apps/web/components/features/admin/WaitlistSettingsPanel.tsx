'use client';

import { Button, Input } from '@jovie/ui';
import { Hash, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SettingsActionRow } from '@/components/molecules/settings/SettingsActionRow';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import {
  useWaitlistSettingsMutation,
  useWaitlistSettingsQuery,
  type WaitlistSettingsResponse,
} from '@/lib/queries';

const MAX_AUTO_ACCEPT_DAILY_LIMIT = 10_000;

function clampDailyLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(MAX_AUTO_ACCEPT_DAILY_LIMIT, Math.max(0, Math.trunc(value)));
}

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
      autoAcceptDailyLimit: clampDailyLimit(settings.autoAcceptDailyLimit),
    });
  };

  if (loading) {
    return (
      <SettingsPanel
        title='People Intake Defaults'
        description='Set the approval rules for new people entering the pipeline.'
      >
        <div className='flex items-center gap-2 px-4 py-4 text-app text-secondary-token sm:px-5'>
          <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
          Loading waitlist settings...
        </div>
      </SettingsPanel>
    );
  }

  if (isError || !settings) {
    return (
      <SettingsPanel
        title='People Intake Defaults'
        description='Set the approval rules for new people entering the pipeline.'
      >
        <div className='px-4 py-4 text-app text-destructive sm:px-5'>
          {error instanceof Error
            ? error.message
            : 'Unable to load waitlist settings. Please refresh and try again.'}
        </div>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel
      title='People Intake Defaults'
      description='Set the approval rules for new people entering the pipeline.'
      actions={
        <Button
          variant='primary'
          size='sm'
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <Loader2 className='mr-1.5 h-3 w-3 animate-spin' />}
          Save
        </Button>
      }
    >
      <div className='divide-y divide-subtle/60 px-4 sm:px-5'>
        <div className='py-3.5'>
          <SettingsToggleRow
            icon={<ShieldCheck className='h-4 w-4' aria-hidden />}
            title='Manual approval gate'
            description='When enabled, every new access request is saved to the waitlist.'
            checked={settings.gateEnabled}
            onCheckedChange={checked =>
              setSettings(current =>
                current ? { ...current, gateEnabled: checked } : current
              )
            }
            ariaLabel='Toggle waitlist gate'
            disabled={saving}
          />
        </div>

        <div className='py-3.5'>
          <SettingsToggleRow
            icon={<UserPlus className='h-4 w-4' aria-hidden />}
            title='Auto-accept'
            description='When the manual gate is disabled, approve the first daily slots before waitlisting the rest.'
            checked={settings.autoAcceptEnabled}
            onCheckedChange={checked =>
              setSettings(current =>
                current ? { ...current, autoAcceptEnabled: checked } : current
              )
            }
            ariaLabel='Toggle auto-accept'
            disabled={saving}
          />
        </div>

        <div className='py-3.5'>
          <SettingsActionRow
            icon={<Hash className='h-4 w-4' aria-hidden />}
            title='Daily limit'
            description={`Today: ${settings.autoAcceptedToday} people auto-approved`}
            action={
              <Input
                type='number'
                min={0}
                max={MAX_AUTO_ACCEPT_DAILY_LIMIT}
                value={settings.autoAcceptDailyLimit}
                onChange={event => {
                  const next = Number.parseInt(event.target.value, 10);
                  setSettings(current =>
                    current
                      ? {
                          ...current,
                          autoAcceptDailyLimit: clampDailyLimit(next),
                        }
                      : current
                  );
                }}
                size='sm'
                className='w-24 text-right tabular-nums'
                disabled={saving}
                aria-label='Daily auto-accept limit'
              />
            }
          />
        </div>
      </div>
    </SettingsPanel>
  );
}

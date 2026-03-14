'use client';

import { Button, Input } from '@jovie/ui';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';

interface WaitlistSettingsResponse {
  gateEnabled: boolean;
  autoAcceptEnabled: boolean;
  autoAcceptDailyLimit: number;
  autoAcceptedToday: number;
  autoAcceptResetsAt: string;
}

export function WaitlistSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<WaitlistSettingsResponse | null>(
    null
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      try {
        setError(null);
        const response = await fetch(APP_ROUTES.ADMIN_WAITLIST_SETTINGS, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to load waitlist settings');
        }

        const payload = (await response.json()) as {
          settings?: WaitlistSettingsResponse;
        };

        if (!payload.settings) {
          throw new Error('Invalid waitlist settings response');
        }

        setSettings(payload.settings);
      } catch {
        if (!controller.signal.aborted) {
          setError(
            'Unable to load waitlist settings. Please refresh and try again.'
          );
          toast.error('Unable to load waitlist settings');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      controller.abort();
    };
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch(APP_ROUTES.ADMIN_WAITLIST_SETTINGS, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateEnabled: settings.gateEnabled,
          autoAcceptEnabled: settings.autoAcceptEnabled,
          autoAcceptDailyLimit: settings.autoAcceptDailyLimit,
        }),
      });

      if (!response.ok) throw new Error('Save failed');
      const payload = (await response.json()) as {
        settings: WaitlistSettingsResponse;
      };
      setSettings(payload.settings);
      setError(null);
      toast.success('Waitlist settings saved');
    } catch {
      toast.error('Failed to save waitlist settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ContentSurfaceCard className='flex items-center gap-2 px-4 py-3.5 text-[13px] text-(--linear-text-secondary)'>
        <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
        Loading waitlist settings…
      </ContentSurfaceCard>
    );
  }

  if (error || !settings) {
    return (
      <ContentSurfaceCard className='border-destructive/25 bg-destructive/5 px-4 py-3.5 text-[13px] text-destructive'>
        {error ??
          'Unable to load waitlist settings. Please refresh and try again.'}
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
            onClick={() => void save()}
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

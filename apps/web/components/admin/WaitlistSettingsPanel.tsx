'use client';

import { Button, Input, Switch } from '@jovie/ui';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
      <div className='rounded-md border border-subtle px-3 py-2.5 text-xs text-secondary-token'>
        <Loader2 className='mr-1.5 inline h-3 w-3 animate-spin' />
        Loading settings…
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className='rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive'>
        {error ??
          'Unable to load waitlist settings. Please refresh and try again.'}
      </div>
    );
  }

  return (
    <section className='rounded-md border border-subtle'>
      <div className='border-b border-subtle px-3 py-2'>
        <h2 className='text-xs font-semibold text-primary-token'>
          Waitlist gate controls
        </h2>
      </div>

      <div className='divide-y divide-subtle'>
        <div className='flex items-center justify-between gap-3 px-3 py-2.5'>
          <div className='min-w-0'>
            <p className='text-xs font-medium text-primary-token'>
              Waitlist gate
            </p>
            <p className='text-[11px] text-secondary-token'>
              When off, signups bypass approval.
            </p>
          </div>
          <Switch
            checked={settings.gateEnabled}
            onCheckedChange={checked =>
              setSettings(current =>
                current ? { ...current, gateEnabled: checked } : current
              )
            }
            aria-label='Toggle waitlist gate'
            disabled={saving}
          />
        </div>

        <div className='flex items-center justify-between gap-3 px-3 py-2.5'>
          <div className='min-w-0'>
            <p className='text-xs font-medium text-primary-token'>
              Auto-accept
            </p>
            <p className='text-[11px] text-secondary-token'>
              Auto-approve a daily limit of new submissions.
            </p>
          </div>
          <Switch
            checked={settings.autoAcceptEnabled}
            onCheckedChange={checked =>
              setSettings(current =>
                current ? { ...current, autoAcceptEnabled: checked } : current
              )
            }
            aria-label='Toggle auto-accept'
            disabled={saving}
          />
        </div>

        <div className='flex items-center justify-between gap-3 px-3 py-2.5'>
          <div className='min-w-0'>
            <p className='text-xs font-medium text-primary-token'>
              Daily limit
            </p>
            <p className='text-[11px] text-secondary-token'>
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
            className='w-20'
            disabled={saving}
            aria-label='Daily auto-accept limit'
          />
        </div>
      </div>

      <div className='border-t border-subtle px-3 py-2'>
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
    </section>
  );
}

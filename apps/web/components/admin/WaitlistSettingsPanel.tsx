'use client';

import { Button, Input, Switch } from '@jovie/ui';
import { Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { APP_ROUTES } from '@/constants/routes';

interface WaitlistSettingsResponse {
  gateEnabled: boolean;
  autoAcceptEnabled: boolean;
  autoAcceptDailyLimit: number;
  autoAcceptedToday: number;
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
      <div className='border-b border-subtle px-4 py-4 text-sm text-secondary-token'>
        Loading waitlist settings…
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className='border-b border-subtle px-4 py-4 text-sm text-destructive'>
        {error ??
          'Unable to load waitlist settings. Please refresh and try again.'}
      </div>
    );
  }

  return (
    <section className='border-b border-subtle px-4 py-3 sm:px-6'>
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0'>
          <h2 className='text-[13px] font-medium text-primary-token'>
            Waitlist gate controls
          </h2>
          <p className='text-xs text-tertiary-token mt-0.5'>
            Control whether signup is gated and how many creators are
            auto-approved each day.
          </p>
        </div>
        <Button
          variant='secondary'
          size='sm'
          onClick={() => void save()}
          disabled={saving}
          className='shrink-0'
        >
          {saving ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
          ) : (
            <Save className='h-3.5 w-3.5' />
          )}
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <div className='mt-3 space-y-2'>
        <div className='flex items-center justify-between gap-4 rounded-lg border border-subtle bg-surface-1/40 px-3 py-2.5'>
          <div className='min-w-0'>
            <p className='text-[13px] font-medium text-primary-token'>
              Waitlist gate
            </p>
            <p className='text-xs text-tertiary-token'>
              When off, new signups can continue without waiting for manual
              approval.
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

        <div className='flex items-center justify-between gap-4 rounded-lg border border-subtle bg-surface-1/40 px-3 py-2.5'>
          <div className='min-w-0'>
            <p className='text-[13px] font-medium text-primary-token'>
              Auto-accept
            </p>
            <p className='text-xs text-tertiary-token'>
              Automatically approve a limited number of new waitlist submissions
              each day.
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

        <div className='flex items-center justify-between gap-4 rounded-lg border border-subtle bg-surface-1/40 px-3 py-2.5'>
          <div className='shrink-0'>
            <p className='text-[13px] font-medium text-primary-token'>
              Daily auto-accept limit
            </p>
            <p className='text-xs text-tertiary-token'>
              Auto-accepted today:{' '}
              <span className='tabular-nums font-medium'>
                {settings.autoAcceptedToday}
              </span>
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
            className='w-20 shrink-0 text-center tabular-nums'
            disabled={saving}
          />
        </div>
      </div>
    </section>
  );
}

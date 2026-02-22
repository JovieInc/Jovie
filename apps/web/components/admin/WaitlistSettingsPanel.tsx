'use client';

import { Switch } from '@jovie/ui';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface WaitlistSettingsResponse {
  gateEnabled: boolean;
  autoAcceptEnabled: boolean;
  autoAcceptDailyLimit: number;
  autoAcceptedToday: number;
}

export function WaitlistSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<WaitlistSettingsResponse | null>(
    null
  );

  useEffect(() => {
    let mounted = true;
    fetch('/app/admin/waitlist/settings', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Failed to load waitlist settings');
        const payload = (await response.json()) as {
          settings: WaitlistSettingsResponse;
        };
        if (mounted) setSettings(payload.settings);
      })
      .catch(() => {
        toast.error('Unable to load waitlist settings');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch('/app/admin/waitlist/settings', {
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
      toast.success('Waitlist settings saved');
    } catch {
      toast.error('Failed to save waitlist settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className='border-b border-subtle px-4 py-4 text-sm text-secondary-token'>
        Loading waitlist settings…
      </div>
    );
  }

  return (
    <section className='border-b border-subtle px-4 py-4 sm:px-6'>
      <div className='mb-4'>
        <h2 className='text-sm font-semibold text-primary-token'>
          Waitlist gate controls
        </h2>
        <p className='text-xs text-secondary-token mt-1'>
          Control whether signup is gated and how many creators are
          auto-approved each day.
        </p>
      </div>

      <div className='space-y-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm text-primary-token'>Waitlist gate</p>
            <p className='text-xs text-secondary-token'>
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

        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm text-primary-token'>Auto-accept</p>
            <p className='text-xs text-secondary-token'>
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

        <label className='block'>
          <span className='text-sm text-primary-token'>
            Daily auto-accept limit
          </span>
          <input
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
            className='mt-1 h-10 w-32 rounded-md border border-subtle bg-background px-3 text-sm'
            disabled={saving}
          />
          <p className='mt-1 text-xs text-secondary-token'>
            Auto-accepted today: {settings.autoAcceptedToday}
          </p>
        </label>

        <button
          type='button'
          onClick={() => void save()}
          disabled={saving}
          className='inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60'
        >
          {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          Save settings
        </button>
      </div>
    </section>
  );
}

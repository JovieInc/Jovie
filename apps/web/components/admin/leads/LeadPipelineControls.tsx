'use client';

import { Button, Switch } from '@jovie/ui';
import { Loader2, Play, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface PipelineSettings {
  enabled: boolean;
  discoveryEnabled: boolean;
  autoIngestEnabled: boolean;
  autoIngestMinFitScore: number;
  dailyQueryBudget: number;
  queriesUsedToday: number;
}

export function LeadPipelineControls() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [qualifying, setQualifying] = useState(false);
  const [settings, setSettings] = useState<PipelineSettings | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch('/api/admin/leads/settings', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to load settings');
        const data = (await res.json()) as { settings: PipelineSettings };
        setSettings(data.settings);
      } catch {
        if (!controller.signal.aborted) {
          toast.error('Failed to load pipeline settings');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/leads/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: settings.enabled,
          discoveryEnabled: settings.discoveryEnabled,
          autoIngestEnabled: settings.autoIngestEnabled,
          autoIngestMinFitScore: settings.autoIngestMinFitScore,
          dailyQueryBudget: settings.dailyQueryBudget,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      const data = (await res.json()) as { settings: PipelineSettings };
      setSettings(data.settings);
      toast.success('Pipeline settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function triggerDiscovery() {
    setDiscovering(true);
    try {
      const res = await fetch('/api/admin/leads/discover', { method: 'POST' });
      const data = (await res.json()) as {
        result?: { queriesUsed: number; newLeadsFound: number };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Discovery failed');
      toast.success(
        `Discovery complete: ${data.result?.newLeadsFound ?? 0} new leads from ${data.result?.queriesUsed ?? 0} queries`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Discovery failed');
    } finally {
      setDiscovering(false);
    }
  }

  async function triggerQualification() {
    setQualifying(true);
    try {
      const res = await fetch('/api/admin/leads/qualify', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Qualification failed');
      toast.success(data.message ?? 'Qualification complete');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Qualification failed'
      );
    } finally {
      setQualifying(false);
    }
  }

  if (loading) {
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
    <section className='rounded-lg border border-subtle bg-surface-1/90 p-4 sm:p-6'>
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
            disabled={saving}
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
            disabled={saving}
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
            disabled={saving}
          />
        </div>

        <div className='flex flex-wrap gap-4'>
          <label className='block'>
            <span className='text-sm text-primary-token'>
              Min fit score for auto-ingest
            </span>
            <input
              type='number'
              min={0}
              max={100}
              value={settings.autoIngestMinFitScore}
              onChange={e => {
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
              className='mt-1 h-10 w-24 rounded-md border border-subtle bg-background px-3 text-sm'
              disabled={saving}
            />
          </label>

          <label className='block'>
            <span className='text-sm text-primary-token'>
              Daily query budget
            </span>
            <input
              type='number'
              min={1}
              max={10000}
              value={settings.dailyQueryBudget}
              onChange={e => {
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
              className='mt-1 h-10 w-24 rounded-md border border-subtle bg-background px-3 text-sm'
              disabled={saving}
            />
            <p className='mt-1 text-xs text-secondary-token'>
              Used today: {settings.queriesUsedToday}
            </p>
          </label>
        </div>

        <div className='flex flex-wrap gap-2 pt-2'>
          <Button onClick={() => void save()} disabled={saving} size='sm'>
            {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Save settings
          </Button>

          <Button
            variant='outline'
            size='sm'
            onClick={() => void triggerDiscovery()}
            disabled={discovering}
          >
            {discovering ? (
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
            disabled={qualifying}
          >
            {qualifying ? (
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

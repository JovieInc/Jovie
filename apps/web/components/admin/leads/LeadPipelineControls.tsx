'use client';

import { Button, Input, Switch } from '@jovie/ui';
import { Loader2, Play, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

interface PipelineSettings {
  enabled: boolean;
  discoveryEnabled: boolean;
  autoIngestEnabled: boolean;
  autoIngestMinFitScore: number;
  dailyQueryBudget: number;
  queriesUsedToday: number;
}

interface LeadSettingRowProps {
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
}

function LeadSettingRow({
  title,
  description,
  checked,
  onCheckedChange,
  ariaLabel,
  disabled = false,
}: Readonly<LeadSettingRowProps>) {
  return (
    <ContentSurfaceCard className='flex items-start justify-between gap-3 bg-(--linear-bg-surface-0) p-3.5'>
      <div className='space-y-1'>
        <p className='text-[13px] font-[560] text-(--linear-text-primary)'>
          {title}
        </p>
        <p className='text-[12px] leading-[18px] text-(--linear-text-secondary)'>
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    </ContentSurfaceCard>
  );
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
      <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Pipeline controls'
          subtitle='Discovery, qualification, and auto-ingest settings'
          className='px-5 py-3'
        />
        <div className='px-5 py-4 text-sm text-(--linear-text-secondary)'>
          Loading pipeline settings...
        </div>
      </ContentSurfaceCard>
    );
  }

  if (!settings) {
    return (
      <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Pipeline controls'
          subtitle='Discovery, qualification, and auto-ingest settings'
          className='px-5 py-3'
        />
        <div className='px-5 py-4 text-sm text-destructive'>
          Unable to load pipeline settings. Please refresh.
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Pipeline controls'
        subtitle='Discovery, qualification, and auto-ingest settings'
        className='px-5 py-3'
      />

      <div className='space-y-4 px-5 py-4'>
        <div className='grid gap-3 lg:grid-cols-3'>
          <LeadSettingRow
            title='Pipeline enabled'
            description='Master switch for the entire lead discovery pipeline.'
            checked={settings.enabled}
            onCheckedChange={checked =>
              setSettings(s => (s ? { ...s, enabled: checked } : s))
            }
            ariaLabel='Toggle pipeline'
            disabled={saving}
          />
          <LeadSettingRow
            title='Discovery enabled'
            description='Run Google CSE searches on cron to find new leads.'
            checked={settings.discoveryEnabled}
            onCheckedChange={checked =>
              setSettings(s => (s ? { ...s, discoveryEnabled: checked } : s))
            }
            ariaLabel='Toggle discovery'
            disabled={saving}
          />
          <LeadSettingRow
            title='Auto-ingest on approve'
            description='Automatically create creator profiles when leads are approved.'
            checked={settings.autoIngestEnabled}
            onCheckedChange={checked =>
              setSettings(s => (s ? { ...s, autoIngestEnabled: checked } : s))
            }
            ariaLabel='Toggle auto-ingest'
            disabled={saving}
          />
        </div>

        <div className='grid gap-3 sm:grid-cols-2'>
          <ContentSurfaceCard className='space-y-2 bg-(--linear-bg-surface-0) p-3.5'>
            <label
              htmlFor='auto-ingest-min-score'
              className='text-[13px] font-[560] text-(--linear-text-primary)'
            >
              Min fit score for auto-ingest
            </label>
            <Input
              id='auto-ingest-min-score'
              type='number'
              min={0}
              max={100}
              value={settings.autoIngestMinFitScore}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
              className='w-28'
              disabled={saving}
            />
            <p className='text-[12px] leading-[18px] text-(--linear-text-secondary)'>
              Qualified leads at or above this score can be ingested
              automatically.
            </p>
          </ContentSurfaceCard>

          <ContentSurfaceCard className='space-y-2 bg-(--linear-bg-surface-0) p-3.5'>
            <label
              htmlFor='daily-query-budget'
              className='text-[13px] font-[560] text-(--linear-text-primary)'
            >
              Daily query budget
            </label>
            <Input
              id='daily-query-budget'
              type='number'
              min={1}
              max={10000}
              value={settings.dailyQueryBudget}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
              className='w-28'
              disabled={saving}
            />
            <p className='text-[12px] leading-[18px] text-(--linear-text-secondary)'>
              Used today: {settings.queriesUsedToday}
            </p>
          </ContentSurfaceCard>
        </div>

        <div className='flex flex-wrap gap-2 pt-1'>
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
    </ContentSurfaceCard>
  );
}

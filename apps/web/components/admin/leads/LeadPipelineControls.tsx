'use client';

import { Button, Input, Switch } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  XCircle,
  Zap,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  type DiscoveryKeywordDiagnostic,
  type DiscoveryResultResponse,
  type LeadPipelineSettings,
  queryKeys,
  useLeadPipelineSettingsQuery,
  useRunLeadDiscoveryMutation,
  useRunLeadQualificationMutation,
  useUpdateLeadPipelineSettingsMutation,
} from '@/lib/queries';

function DiagnosticPanel({
  result,
}: Readonly<{ result: DiscoveryResultResponse }>) {
  const hasErrors = result.diagnostics.some(d => d.error);
  const totalRawResults = result.diagnostics.reduce(
    (sum, d) => sum + d.rawResultCount,
    0
  );
  const totalLinktreeUrls = result.diagnostics.reduce(
    (sum, d) => sum + d.linktreeUrlsFound,
    0
  );

  return (
    <div className='mt-4 rounded-lg border border-subtle bg-surface-1 p-4'>
      <h3 className='mb-2 text-sm font-semibold text-primary-token'>
        Discovery diagnostics
      </h3>

      {/* Summary row */}
      <div className='mb-3 flex flex-wrap gap-4 text-xs text-secondary-token'>
        <span>Queries: {result.queriesUsed}</span>
        <span>Raw results: {totalRawResults}</span>
        <span>Linktree URLs: {totalLinktreeUrls}</span>
        <span>New leads: {result.newLeadsFound}</span>
        <span>Duplicates: {result.duplicatesSkipped}</span>
        <span>Budget left: {result.budgetRemaining}</span>
        <span>
          Rotation: {result.keywordRotationIndex}/{result.totalEnabledKeywords}
        </span>
      </div>

      {totalRawResults === 0 && !hasErrors && (
        <div className='mb-3 flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-200'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          <div>
            <p className='font-medium'>
              Google CSE returned 0 results for all queries
            </p>
            <p className='mt-0.5 opacity-80'>
              This likely means your keywords are too specific, or your Google
              CSE engine is misconfigured. Try broader queries like{' '}
              <code className='rounded bg-white/10 px-1'>
                site:linktr.ee spotify music
              </code>{' '}
              or check your CSE settings in the Google Programmable Search
              Console.
            </p>
          </div>
        </div>
      )}

      {hasErrors && (
        <div className='mb-3 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200'>
          <XCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          <div>
            <p className='font-medium'>
              Some queries failed — check Sentry for details
            </p>
          </div>
        </div>
      )}

      {/* Per-keyword breakdown */}
      <div className='space-y-1.5'>
        {result.diagnostics.map(d => (
          <KeywordDiagnosticRow key={d.keywordId} diagnostic={d} />
        ))}
      </div>
    </div>
  );
}

function KeywordDiagnosticRow({
  diagnostic: d,
}: Readonly<{
  diagnostic: DiscoveryKeywordDiagnostic;
}>) {
  return (
    <div className='flex items-center gap-2 rounded border border-subtle px-2 py-1.5 text-xs'>
      {d.error && <XCircle className='h-3.5 w-3.5 shrink-0 text-red-400' />}
      {!d.error && d.rawResultCount === 0 && (
        <AlertTriangle className='h-3.5 w-3.5 shrink-0 text-yellow-400' />
      )}
      {!d.error && d.rawResultCount > 0 && (
        <CheckCircle2 className='h-3.5 w-3.5 shrink-0 text-green-400' />
      )}
      <code className='min-w-0 flex-1 truncate text-secondary-token'>
        {d.query}
      </code>
      <div className='flex shrink-0 items-center gap-3 text-secondary-token'>
        <span title='Google CSE start index (page offset)'>
          p{Math.ceil(d.searchOffset / 10)}
        </span>
        <span title='Raw Google results'>{d.rawResultCount} raw</span>
        <span title='Linktree URLs extracted'>
          {d.linktreeUrlsFound} linktr.ee
        </span>
        <span title='New leads inserted'>{d.newLeadsInserted} new</span>
        <span title='Query duration'>{d.durationMs}ms</span>
      </div>
      {d.error && (
        <span className='ml-1 truncate text-red-400' title={d.error}>
          {d.error}
        </span>
      )}
    </div>
  );
}

export function LeadPipelineControls() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<LeadPipelineSettings | null>(null);
  const [lastDiscoveryResult, setLastDiscoveryResult] =
    useState<DiscoveryResultResponse | null>(null);

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
    setLastDiscoveryResult(null);
    try {
      const data = await discoveryMutation.mutateAsync();
      setLastDiscoveryResult(data.result);

      const { newLeadsFound, queriesUsed, diagnostics } = data.result;
      const totalRaw = diagnostics.reduce(
        (sum, d) => sum + d.rawResultCount,
        0
      );

      if (totalRaw === 0) {
        toast.warning(
          `Discovery ran ${queriesUsed} queries but Google returned 0 results. Check keyword configuration.`
        );
      } else {
        toast.success(
          `Discovery complete: ${newLeadsFound} new leads from ${queriesUsed} queries (${totalRaw} raw results)`
        );
      }

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

  if (settingsQuery.isLoading || (settingsQuery.isFetching && !settings)) {
    return (
      <div className='border-b border-subtle px-4 py-4 text-sm text-secondary-token'>
        Loading pipeline settings...
      </div>
    );
  }

  if (!settings) {
    const errorMsg =
      settingsQuery.error?.message ||
      'Unable to load pipeline settings. Please refresh.';
    return (
      <div className='border-b border-subtle px-4 py-4 text-sm text-destructive'>
        {errorMsg}
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

      {lastDiscoveryResult && <DiagnosticPanel result={lastDiscoveryResult} />}
    </section>
  );
}

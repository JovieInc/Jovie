'use client';

import { Loader2, Rocket, X } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { DailyBucket } from '@/components/features/admin/ShippingVelocityChart';
import { ShippingVelocityChart } from '@/components/features/admin/ShippingVelocityChart';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { QRCode } from '@/components/molecules/QRCode';
import {
  getDefaultStatusTone,
  getDeploymentLabel,
  getDeploymentTone,
  type HudTone,
} from '@/lib/hud/tone-determination';
import type { HermesCliRuntime, HermesDispatchRequest } from '@/types/ai-ops';
import type { HudMetrics } from '@/types/hud';
import { HudClockClient } from './HudClockClient';
import { HudStatusPill } from './HudStatusPill';
import { useHudMetricsQuery } from './useHudMetricsQuery';

type HermesDispatchKind =
  | 'triage'
  | 'bug_patch'
  | 'code_review'
  | 'qa'
  | 'investigation'
  | 'support_draft';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function formatRunway(runwayMonths: number | null): string {
  if (runwayMonths == null) return '\u221E';
  if (!Number.isFinite(runwayMonths)) return '\u221E';
  if (runwayMonths < 0) return '0';
  return `${runwayMonths.toFixed(1)} mo`;
}

function formatUpdatedTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function formatDeploymentTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function getDeploymentDetail(deployments: HudMetrics['deployments']): string {
  if (deployments.current?.branch) {
    return `Branch ${deployments.current.branch}`;
  }

  if (deployments.availability === 'not_configured') {
    return 'Deploy not configured';
  }

  return deployments.errorMessage ?? '\u2014';
}

function getAiOpsTone(aiOps: HudMetrics['aiOps']): HudTone {
  if (aiOps.counts.failed > 0 || aiOps.counts.blocked > 0) return 'bad';
  if (aiOps.counts.stale > 0 || aiOps.availability === 'partial') {
    return 'warning';
  }
  if (aiOps.availability === 'available') return 'good';
  return 'neutral';
}

function getAiOpsLabel(aiOps: HudMetrics['aiOps']): string {
  if (aiOps.counts.failed > 0) return 'Failed';
  if (aiOps.counts.blocked > 0) return 'Blocked';
  if (aiOps.counts.stale > 0) return 'Stale';
  if (aiOps.counts.running > 0) return 'Running';
  if (aiOps.dispatch.available) return 'Ready';
  return 'Not configured';
}

function getDefaultSkills(kind: HermesDispatchKind): readonly string[] {
  if (kind === 'qa') return ['qa'];
  if (kind === 'code_review') return ['review'];
  if (kind === 'investigation') return ['investigate'];
  if (kind === 'triage') return ['autoplan'];
  return ['autoplan', 'investigate'];
}

function SectionEyebrow({
  children,
}: Readonly<{ readonly children: ReactNode }>) {
  return (
    <p className='text-[11px] font-semibold uppercase tracking-[0.16em] text-tertiary-token'>
      {children}
    </p>
  );
}

function DeploymentRow({
  run,
}: Readonly<{
  readonly run: HudMetrics['deployments']['recent'][number];
}>) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-xl border border-subtle bg-surface-0 px-3 py-2.5'>
      <div className='min-w-0'>
        <p className='truncate text-[13px] font-semibold text-primary-token'>
          #{run.runNumber}
          <span className='ml-2 font-normal text-secondary-token'>
            {run.branch ?? '\u2014'}
          </span>
        </p>
      </div>
      <div className='shrink-0 text-right'>
        <p className='text-[11px] text-tertiary-token'>
          {formatDeploymentTime(run.createdAtIso)}
        </p>
        <p className='mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary-token'>
          {run.status}
        </p>
      </div>
    </div>
  );
}

function AiOpsItemRow({
  item,
  onDismiss,
  isDismissed,
  onUndismiss,
}: Readonly<{
  readonly item: HudMetrics['aiOps']['blockers'][number];
  readonly onDismiss?: () => void;
  readonly isDismissed?: boolean;
  readonly onUndismiss?: () => void;
}>) {
  return (
    <div className='flex items-start justify-between gap-3 rounded-xl border border-subtle bg-surface-0 px-3 py-2.5'>
      <div className='min-w-0'>
        <p className='truncate text-[13px] font-semibold text-primary-token'>
          {item.summary}
        </p>
        <p className='mt-1 text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
          {item.source} / {item.status}
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-1.5 text-right text-[11px] text-tertiary-token'>
        <p>{formatDeploymentTime(item.updatedAt)}</p>
        {isDismissed && onUndismiss ? (
          <button
            type='button'
            onClick={onUndismiss}
            aria-label='Restore item'
            className='rounded px-1 py-0.5 text-[11px] text-tertiary-token hover:text-primary-token'
          >
            Undo
          </button>
        ) : onDismiss ? (
          <button
            type='button'
            onClick={onDismiss}
            aria-label='Dismiss item'
            className='rounded p-0.5 text-tertiary-token hover:text-primary-token'
          >
            <X className='h-3.5 w-3.5' aria-hidden='true' />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function HermesDispatchControls({
  aiOps,
  onDispatchComplete,
}: Readonly<{
  readonly aiOps: HudMetrics['aiOps'];
  readonly onDispatchComplete: () => void;
}>) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [runtime, setRuntime] = useState<HermesCliRuntime>('codex-cli');
  const [kind, setKind] = useState<HermesDispatchKind>('investigation');
  const [isDispatching, setIsDispatching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!aiOps.dispatch.available) {
    return (
      <p className='text-[13px] leading-5 text-secondary-token'>
        {aiOps.dispatch.unavailableReason ??
          'Hermes dispatch is not configured.'}
      </p>
    );
  }

  async function dispatchWorker(dryRun: boolean) {
    setIsDispatching(true);
    setMessage(null);

    const payload: HermesDispatchRequest = {
      source: 'hermes',
      sourceId: sourceUrl.trim() || `hud-${Date.now()}`,
      sourceUrl: sourceUrl.trim() || null,
      kind,
      runtime,
      priority: kind === 'bug_patch' ? 80 : 60,
      skills: getDefaultSkills(kind),
      allowedPaths: ['apps/web', 'scripts', '.github/workflows'],
      verification: ['pnpm --filter web exec tsc --noEmit'],
      dryRun,
      prompt: sourceUrl.trim()
        ? `Use the linked work item as source context: ${sourceUrl.trim()}`
        : 'Pick up the highest-value scoped internal AI ops task from the provided context.',
      owner: 'HUD',
    };

    try {
      const response = await fetch('/api/hud/ai-ops/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        branchName?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? `Dispatch failed (${response.status})`);
      }

      setMessage(
        dryRun
          ? 'Dry run dispatched to Hermes worker workflow.'
          : `Worker dispatched on ${result.branchName ?? 'agent branch'}.`
      );
      onDispatchComplete();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Hermes dispatch failed.'
      );
    } finally {
      setIsDispatching(false);
    }
  }

  return (
    <div className='grid gap-3'>
      <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_180px]'>
        <input
          type='url'
          value={sourceUrl}
          onChange={event => setSourceUrl(event.target.value)}
          placeholder='Linear, GitHub, or Sentry URL'
          className='min-h-10 rounded-lg border border-subtle bg-surface-0 px-3 text-[13px] text-primary-token outline-none'
        />
        <select
          value={runtime}
          onChange={event => setRuntime(event.target.value as HermesCliRuntime)}
          className='min-h-10 rounded-lg border border-subtle bg-surface-0 px-3 text-[13px] text-primary-token outline-none'
        >
          {aiOps.dispatch.runtimes.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={event => setKind(event.target.value as HermesDispatchKind)}
          className='min-h-10 rounded-lg border border-subtle bg-surface-0 px-3 text-[13px] text-primary-token outline-none'
        >
          <option value='investigation'>investigation</option>
          <option value='bug_patch'>bug_patch</option>
          <option value='code_review'>code_review</option>
          <option value='qa'>qa</option>
          <option value='triage'>triage</option>
          <option value='support_draft'>support_draft</option>
        </select>
      </div>
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          onClick={() => void dispatchWorker(false)}
          disabled={isDispatching}
          className='inline-flex min-h-10 items-center gap-2 rounded-lg border border-subtle bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60'
        >
          {isDispatching ? (
            <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
          ) : (
            <Rocket className='h-4 w-4' aria-hidden='true' />
          )}
          Dispatch worker
        </button>
        <button
          type='button'
          onClick={() => void dispatchWorker(true)}
          disabled={isDispatching}
          className='inline-flex min-h-10 items-center gap-2 rounded-lg border border-subtle bg-surface-0 px-3 text-[13px] font-semibold text-primary-token disabled:cursor-not-allowed disabled:opacity-60'
        >
          Dry run
        </button>
      </div>
      {message ? (
        <p className='text-[13px] leading-5 text-secondary-token'>{message}</p>
      ) : null}
    </div>
  );
}

export type HudDensity = 'shell' | 'kiosk';
export type HudPresentationMode = 'shell' | 'admin-kiosk' | 'token';

export interface HudDashboardClientProps {
  readonly initialMetrics: HudMetrics;
  /** Visual scale: shell-density matches Overview KPIs; kiosk uses TV-scale typography. */
  readonly density?: HudDensity;
  /**
   * Auth/access context. Independent of `density` — admin-kiosk keeps full
   * dispatch capability while rendering at kiosk scale. Token mode hides the
   * Hermes dispatch UI regardless of density.
   */
  readonly presentationMode?: HudPresentationMode;
  /** Required only in token presentation: the QR-target URL for the TV view. */
  readonly hudUrl?: string;
  /** Required only in token presentation: forwarded to the metrics refresh hook. */
  readonly kioskToken?: string | null;
  /** Pre-fetched shipping velocity data from the server (avoids loading flash). */
  readonly initialShippingData?: DailyBucket[];
  /** ISO timestamp of when shipping data was last cached. */
  readonly initialShippingCachedAt?: string;
}

function makeItemKey(item: HudMetrics['aiOps']['blockers'][number]): string {
  return `${item.source}|${item.summary}|${item.updatedAt}`;
}

export function HudDashboardClient({
  initialMetrics,
  density = 'kiosk',
  presentationMode = 'token',
  hudUrl,
  kioskToken = null,
  initialShippingData,
  initialShippingCachedAt,
}: HudDashboardClientProps) {
  const { data: metrics, refetch } = useHudMetricsQuery(
    initialMetrics,
    kioskToken
  );

  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  function dismissItem(item: HudMetrics['aiOps']['blockers'][number]) {
    setDismissedKeys(prev => new Set([...prev, makeItemKey(item)]));
  }

  function undismissItem(item: HudMetrics['aiOps']['blockers'][number]) {
    setDismissedKeys(prev => {
      const next = new Set(prev);
      next.delete(makeItemKey(item));
      return next;
    });
  }

  const defaultTone = getDefaultStatusTone(metrics.overview.defaultStatus);
  const deploymentsTone = getDeploymentTone(metrics.deployments);
  const deploymentLabel = getDeploymentLabel(metrics.deployments);
  const deploymentDetail = getDeploymentDetail(metrics.deployments);
  const aiOpsTone = getAiOpsTone(metrics.aiOps);
  const aiOpsLabel = getAiOpsLabel(metrics.aiOps);

  const isShell = density === 'shell';
  const showDispatch = presentationMode !== 'token';
  const showQrPanel = presentationMode === 'token' && Boolean(hudUrl);

  // Outer layout: kiosk gets the wide centered TV layout; shell defers width
  // to the AdminToolPage container that already provides app-shell padding.
  const outerClass = isShell
    ? 'flex w-full flex-col gap-3'
    : 'mx-auto flex w-full max-w-[1560px] flex-col gap-3 px-4 py-4 sm:px-6 sm:py-6 xl:px-8';

  // MRR scale: shell matches Overview KPIs (~28-32px); kiosk keeps the
  // TV-readable 44/56/72 ramp.
  const mrrValueClass = isShell
    ? 'text-[28px] font-[620] leading-none tracking-[-0.03em] sm:text-[32px]'
    : 'text-[44px] font-[620] leading-none tracking-[-0.045em] sm:text-[56px] lg:text-[72px]';

  // Operations / Reliability / Runway KPIs likewise scale down in shell.
  const secondaryValueClass = isShell
    ? 'text-[24px] font-[620] leading-none tracking-[-0.03em] sm:text-[28px]'
    : 'text-[36px] font-[620] leading-none tracking-[-0.04em] sm:text-[42px]';

  return (
    <div className={outerClass}>
      {!isShell ? (
        <ContentSurfaceCard
          surface='details'
          className='flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5'
        >
          <div className='flex items-center gap-3'>
            <div className='relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-subtle bg-surface-0'>
              <Image
                src='/brand/Jovie-Logo-Icon-White.svg'
                alt='Jovie'
                fill
                sizes='44px'
                className='object-contain p-2.5'
                priority
              />
            </div>
            <div className='min-w-0'>
              <SectionEyebrow>HUD</SectionEyebrow>
              <h1 className='mt-1 truncate text-[22px] font-[620] leading-none tracking-[-0.03em] text-primary-token sm:text-[24px]'>
                {metrics.branding.startupName}
              </h1>
            </div>
          </div>
          <div className='flex flex-col items-start gap-1 sm:items-end'>
            <div className='text-[18px] font-[620] tracking-[-0.03em] text-primary-token sm:text-[20px]'>
              <HudClockClient />
            </div>
            <p className='text-[12px] text-secondary-token'>
              Updated {formatUpdatedTime(metrics.generatedAtIso)}
            </p>
          </div>
        </ContentSurfaceCard>
      ) : null}

      {/* Top section: chart + metrics side-by-side on XL screens */}
      <div className='grid gap-3 xl:grid-cols-[2fr_1fr]'>
        {/* Shipping Velocity Chart */}
        <ContentSurfaceCard surface='details' className='p-0 overflow-hidden'>
          <ShippingVelocityChart
            initialData={initialShippingData}
            initialRange='7d'
            cachedAt={initialShippingCachedAt}
          />
        </ContentSurfaceCard>

        {/* MRR + small metric tiles */}
        <div className='grid gap-3 content-start'>
          <ContentMetricCard
            label='Monthly recurring revenue'
            value={formatUsd(metrics.overview.mrrUsd)}
            subtitle={
              <span className='text-[14px] text-secondary-token'>
                {metrics.overview.activeSubscribers.toLocaleString('en-US')}{' '}
                subscribers
              </span>
            }
            headerRight={
              <HudStatusPill label={deploymentLabel} tone={deploymentsTone} />
            }
            className='p-3'
            labelClassName='uppercase tracking-[0.16em] text-tertiary-token'
            valueClassName={mrrValueClass}
          />

          <div className='grid grid-cols-2 xl:grid-cols-2 gap-3'>
            <ContentMetricCard
              label='Runway'
              value={formatRunway(metrics.overview.runwayMonths)}
              subtitle={
                <div className='mt-2 grid gap-1.5'>
                  <ContentMetricRow
                    label='Cash'
                    value={formatUsd(metrics.overview.balanceUsd)}
                  />
                  <ContentMetricRow
                    label='Burn (30d)'
                    value={formatUsd(metrics.overview.burnRateUsd)}
                  />
                </div>
              }
              className='p-3'
              labelClassName='uppercase tracking-[0.16em] text-tertiary-token'
              valueClassName={secondaryValueClass}
            />
            <ContentMetricCard
              label='Operations'
              value={
                metrics.operations.status === 'ok' ? 'Healthy' : 'Degraded'
              }
              subtitle={
                metrics.operations.dbLatencyMs === null
                  ? 'DB latency —'
                  : `DB latency ${metrics.operations.dbLatencyMs.toFixed(0)}ms`
              }
              className='p-3'
              labelClassName='uppercase tracking-[0.16em] text-tertiary-token'
              valueClassName={secondaryValueClass}
            />
            <ContentMetricCard
              label='Reliability'
              value={`${metrics.reliability.errorRatePercent.toFixed(2)}%`}
              subtitle={
                metrics.reliability.p95LatencyMs === null
                  ? 'p95 —'
                  : `p95 ${metrics.reliability.p95LatencyMs.toFixed(0)}ms`
              }
              className='p-3 col-span-2'
              labelClassName='uppercase tracking-[0.16em] text-tertiary-token'
              valueClassName={secondaryValueClass}
            />
          </div>
        </div>
      </div>

      {/* Deployments + optional QR panel */}
      {showQrPanel ? (
        <div className='grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]'>
          <ContentSurfaceCard surface='details' className='space-y-3 p-3'>
            <div className='flex items-center justify-between gap-3'>
              <SectionEyebrow>Deployments</SectionEyebrow>
              <p className='text-[12px] text-secondary-token'>
                {deploymentDetail}
              </p>
            </div>
            {metrics.deployments.recent.length > 0 ? (
              <div className='grid gap-2'>
                {metrics.deployments.recent.slice(0, 5).map(run => (
                  <DeploymentRow key={run.id} run={run} />
                ))}
              </div>
            ) : (
              <p className='text-[13px] text-secondary-token'>
                No recent runs.
              </p>
            )}
          </ContentSurfaceCard>

          <ContentSurfaceCard surface='details' className='space-y-4 p-3'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
              <div className='space-y-1'>
                <SectionEyebrow>Open on phone</SectionEyebrow>
                <p className='text-[20px] font-[620] tracking-[-0.03em] text-primary-token'>
                  Scan to view
                </p>
                <p className='max-w-[28ch] text-[13px] leading-5 text-secondary-token'>
                  Open the live HUD on another device using this kiosk link.
                </p>
              </div>
              <div className='rounded-[12px] border border-subtle bg-surface-0 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
                <QRCode
                  data={hudUrl ?? ''}
                  size={196}
                  label='HUD link'
                  className='rounded-lg bg-white'
                />
              </div>
            </div>
          </ContentSurfaceCard>
        </div>
      ) : (
        <ContentSurfaceCard surface='details' className='space-y-3 p-3'>
          <div className='flex items-center justify-between gap-3'>
            <SectionEyebrow>Deployments</SectionEyebrow>
            <p className='text-[12px] text-secondary-token'>
              {deploymentDetail}
            </p>
          </div>
          {metrics.deployments.recent.length > 0 ? (
            <div className='grid gap-2'>
              {metrics.deployments.recent.slice(0, 5).map(run => (
                <DeploymentRow key={run.id} run={run} />
              ))}
            </div>
          ) : (
            <p className='text-[13px] text-secondary-token'>No recent runs.</p>
          )}
        </ContentSurfaceCard>
      )}

      {/* AI Ops / Hermes control plane */}
      <ContentSurfaceCard surface='details' className='space-y-4 p-3'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-1'>
            <SectionEyebrow>AI ops</SectionEyebrow>
            <p className='text-[24px] font-[620] leading-none text-primary-token sm:text-[28px]'>
              Hermes control plane
            </p>
            <p className='text-[13px] leading-5 text-secondary-token'>
              {metrics.aiOps.mergeQueue.openAgentPrs} /{' '}
              {metrics.aiOps.mergeQueue.openAgentPrThreshold} agent PRs open
            </p>
          </div>
          <HudStatusPill label={aiOpsLabel} tone={aiOpsTone} />
        </div>

        <div className='grid gap-3 sm:grid-cols-3 lg:grid-cols-6'>
          <ContentMetricRow
            label='Queued'
            value={metrics.aiOps.counts.queued.toLocaleString('en-US')}
          />
          <ContentMetricRow
            label='Running'
            value={metrics.aiOps.counts.running.toLocaleString('en-US')}
          />
          <ContentMetricRow
            label='Review'
            value={metrics.aiOps.counts.review.toLocaleString('en-US')}
          />
          <ContentMetricRow
            label='Blocked'
            value={metrics.aiOps.counts.blocked.toLocaleString('en-US')}
          />
          <ContentMetricRow
            label='Failed'
            value={metrics.aiOps.counts.failed.toLocaleString('en-US')}
          />
          <ContentMetricRow
            label='Stale'
            value={metrics.aiOps.counts.stale.toLocaleString('en-US')}
          />
        </div>

        <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]'>
          <div className='space-y-3'>
            <div className='flex items-center justify-between gap-3'>
              <SectionEyebrow>Blockers</SectionEyebrow>
              <p className='text-[12px] text-secondary-token'>
                {metrics.aiOps.availability}
              </p>
            </div>
            {(() => {
              const visible = metrics.aiOps.blockers
                .slice(0, 4)
                .filter(item => !dismissedKeys.has(makeItemKey(item)));
              const dismissed = metrics.aiOps.blockers
                .slice(0, 4)
                .filter(item => dismissedKeys.has(makeItemKey(item)));

              return (
                <>
                  {visible.length > 0 ? (
                    <div className='grid gap-2'>
                      {visible.map(item => (
                        <AiOpsItemRow
                          key={`${item.source}-${item.kind}-${item.url ?? item.summary}`}
                          item={item}
                          onDismiss={() => dismissItem(item)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className='text-[13px] text-secondary-token'>
                      No blocked worker runs or agent PRs.
                    </p>
                  )}
                  {dismissed.length > 0 ? (
                    <details className='group'>
                      <summary className='cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.12em] text-tertiary-token hover:text-secondary-token'>
                        Dismissed ({dismissed.length})
                      </summary>
                      <div className='mt-2 grid gap-2'>
                        {dismissed.map(item => (
                          <AiOpsItemRow
                            key={`dismissed-${item.source}-${item.kind}-${item.url ?? item.summary}`}
                            item={item}
                            isDismissed
                            onUndismiss={() => undismissItem(item)}
                          />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </>
              );
            })()}
          </div>

          <div className='space-y-3'>
            <SectionEyebrow>Dispatch</SectionEyebrow>
            {showDispatch && metrics.accessMode === 'admin' ? (
              <HermesDispatchControls
                aiOps={metrics.aiOps}
                onDispatchComplete={() => {
                  refetch().catch(() => {});
                }}
              />
            ) : (
              <p className='text-[13px] leading-5 text-secondary-token'>
                {showDispatch
                  ? 'Admin access required for worker dispatch.'
                  : 'Dispatch is hidden on the TV/wallboard view.'}
              </p>
            )}
          </div>
        </div>

        {(() => {
          const allRecs = metrics.aiOps.recommendations.slice(0, 3);
          const visibleRecs = allRecs.filter(
            item => !dismissedKeys.has(makeItemKey(item))
          );
          const dismissedRecs = allRecs.filter(item =>
            dismissedKeys.has(makeItemKey(item))
          );

          if (allRecs.length === 0) return null;

          return (
            <div className='border-t border-subtle pt-3'>
              <SectionEyebrow>Next actions</SectionEyebrow>
              {visibleRecs.length > 0 ? (
                <div className='mt-2 grid gap-2'>
                  {visibleRecs.map(item => (
                    <AiOpsItemRow
                      key={`${item.source}-${item.priority}-${item.summary}`}
                      item={item}
                      onDismiss={() => dismissItem(item)}
                    />
                  ))}
                </div>
              ) : (
                <p className='mt-2 text-[13px] text-secondary-token'>
                  All next actions dismissed.
                </p>
              )}
              {dismissedRecs.length > 0 ? (
                <details className='mt-2'>
                  <summary className='cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.12em] text-tertiary-token hover:text-secondary-token'>
                    Dismissed ({dismissedRecs.length})
                  </summary>
                  <div className='mt-2 grid gap-2'>
                    {dismissedRecs.map(item => (
                      <AiOpsItemRow
                        key={`dismissed-rec-${item.source}-${item.priority}-${item.summary}`}
                        item={item}
                        isDismissed
                        onUndismiss={() => undismissItem(item)}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          );
        })()}
      </ContentSurfaceCard>

      <ContentSurfaceCard
        surface='details'
        className='p-3'
        data-testid='hud-bottom-marker'
      >
        <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
          <div className='space-y-2'>
            <SectionEyebrow>Default status</SectionEyebrow>
            <p
              className={
                isShell
                  ? 'text-[26px] font-[620] leading-none tracking-[-0.03em] text-primary-token sm:text-[32px]'
                  : 'text-[40px] font-[620] leading-none tracking-[-0.045em] text-primary-token sm:text-[52px]'
              }
            >
              {metrics.overview.defaultStatus.toUpperCase()}
            </p>
            <p
              className={
                isShell
                  ? 'max-w-4xl text-[13px] leading-6 text-secondary-token'
                  : 'max-w-4xl text-[15px] leading-7 text-secondary-token'
              }
            >
              {metrics.overview.defaultStatusDetail}
            </p>
          </div>
          <HudStatusPill
            label={
              metrics.overview.defaultStatus === 'alive' ? 'Alive' : 'Dead'
            }
            tone={defaultTone}
          />
        </div>
      </ContentSurfaceCard>
    </div>
  );
}

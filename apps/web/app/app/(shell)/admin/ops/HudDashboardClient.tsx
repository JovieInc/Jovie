'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  Copy,
  ExternalLink,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Rocket,
  X,
} from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { AgentOsRunsPanel } from '@/components/features/admin/agent-os';
import { DesignProposalReviewPanel } from '@/components/features/admin/design-lab';
import { HudKpiSubgrid } from '@/components/features/admin/hud/HudKpiSubgrid';
import { HudSystemHealthStrip } from '@/components/features/admin/hud/HudSystemHealthStrip';
import type { DailyBucket } from '@/components/features/admin/ShippingVelocityChart';
import { ShippingVelocityChart } from '@/components/features/admin/ShippingVelocityChart';
import { TimActionRequiredSection } from '@/components/features/admin/TimActionRequiredSection';
import { WhatShipped } from '@/components/features/admin/WhatShipped';
import { toast } from '@/components/feedback';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { QRCode } from '@/components/molecules/QRCode';
import { ShellListRowFrame } from '@/components/organisms/table';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import { AGENT_OS_ADMIN_FIXTURE_ARTIFACTS } from '@/lib/agent-os/fixtures';
import { isHudMetricValueAvailable } from '@/lib/hud/source-trust';
import {
  getDefaultStatusTone,
  getDeploymentLabel,
  getDeploymentTone,
  type HudTone,
} from '@/lib/hud/tone-determination';
import type { HermesCliRuntime, HermesDispatchRequest } from '@/types/ai-ops';
import type {
  HudDeploymentRun,
  HudDeploymentState,
  HudMetrics,
} from '@/types/hud';
import { HudClockClient } from './HudClockClient';
import { HudMetricSourceTrust } from './HudMetricSourceTrust';
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

function formatReliabilitySubtitle(
  reliability: HudMetrics['reliability']
): string {
  const p95 =
    reliability.p95LatencyMs === null
      ? '\u2014'
      : `${reliability.p95LatencyMs.toFixed(0)}ms`;
  return `${reliability.unresolvedSentryIssues24h.toLocaleString('en-US')} unresolved | p95 ${p95}`;
}

function formatTestingQuarantineSubtitle(
  quarantine: HudMetrics['testing']['quarantine']
): string {
  const budget = `${quarantine.estimatedRetryAttemptsPerRun}/${quarantine.retryBudgetCap} retries`;
  const mix = `${quarantine.unitCount} unit | ${quarantine.e2eCount} e2e`;
  if (!quarantine.isValid) {
    return `Ledger invalid | ${budget}`;
  }
  if (!quarantine.withinRetryBudget) {
    return `Over budget | ${mix}`;
  }
  if (quarantine.expiredCount > 0) {
    return `${quarantine.expiredCount} expired | ${budget}`;
  }
  return `${mix} | ${budget}`;
}

function HudHealthMetricCards({
  metrics,
  secondaryValueClass,
  databaseSource,
  sentrySource,
  handleSourceRetry,
}: Readonly<{
  readonly metrics: HudMetrics;
  readonly secondaryValueClass: string;
  readonly databaseSource: HudMetrics['sources']['database'];
  readonly sentrySource: HudMetrics['sources']['sentry'];
  readonly handleSourceRetry: () => void;
}>) {
  return (
    <>
      <ContentMetricCard
        label='Operations'
        value={metrics.operations.status === 'ok' ? 'Healthy' : 'Degraded'}
        subtitle={metricSubtitleWithTrust(
          metrics.operations.dbLatencyMs === null
            ? 'DB latency —'
            : `DB latency ${metrics.operations.dbLatencyMs.toFixed(0)}ms`,
          databaseSource,
          handleSourceRetry
        )}
        className='p-3'
        valueClassName={secondaryValueClass}
      />
      <ContentMetricCard
        label='Reliability'
        value={`${metrics.reliability.reliabilityScorePercent.toFixed(1)}%`}
        subtitle={metricSubtitleWithTrust(
          formatReliabilitySubtitle(metrics.reliability),
          sentrySource,
          handleSourceRetry
        )}
        className='p-3'
        valueClassName={secondaryValueClass}
      />
      <ContentMetricCard
        label='Flaky Quarantine'
        value={metrics.testing.quarantine.activeCount.toLocaleString('en-US')}
        subtitle={formatTestingQuarantineSubtitle(metrics.testing.quarantine)}
        className='p-3'
        valueClassName={secondaryValueClass}
        data-testid='hud-flaky-quarantine-card'
      />
    </>
  );
}

function HudDeploymentsSurfaceCard({
  metrics,
  deploymentDetail,
  githubSource,
  handleSourceRetry,
}: Readonly<{
  readonly metrics: HudMetrics;
  readonly deploymentDetail: string;
  readonly githubSource: HudMetrics['sources']['github'];
  readonly handleSourceRetry: () => void;
}>) {
  return (
    <ContentSurfaceCard surface='details' className='space-y-3 p-3'>
      <div className='flex items-center justify-between gap-3'>
        <SectionLabel>Deployments</SectionLabel>
        <p className='text-xs text-secondary-token'>{deploymentDetail}</p>
      </div>
      {metrics.deployments.recent.length > 0 ? (
        <div className='grid gap-2'>
          {metrics.deployments.recent.slice(0, 5).map(run => (
            <DeploymentRow key={run.id} run={run} />
          ))}
        </div>
      ) : (
        <p className='text-app text-secondary-token'>No recent runs.</p>
      )}
      <HudMetricSourceTrust source={githubSource} onRetry={handleSourceRetry} />
    </ContentSurfaceCard>
  );
}

function formatDefaultStatusLabel(
  status: HudMetrics['overview']['defaultStatus']
): string {
  if (status === 'alive') return 'Alive';
  if (status === 'dead') return 'Dead';
  return 'Unknown';
}

const DEPLOYMENT_STATE_LABELS: Record<HudDeploymentState, string> = {
  success: 'Success',
  failure: 'Failure',
  in_progress: 'In Progress',
  unknown: 'Unknown',
  not_configured: 'Not Configured',
};

const DEPLOYMENT_STATE_DOT_CLASSNAMES: Record<HudDeploymentState, string> = {
  success: 'bg-success',
  failure: 'bg-destructive',
  in_progress: 'bg-info',
  unknown: 'bg-tertiary-token',
  not_configured: 'bg-tertiary-token',
};

const DISPATCH_SOURCE_PLACEHOLDER = 'Linear, GitHub, or Sentry URL';
const RUNWAY_BURN_LABEL = 'Burn (30d)';
const OVERVIEW_BURN_LABEL = 'Burn (30d)';

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

function SectionLabel({
  children,
}: Readonly<{ readonly children: ReactNode }>) {
  return (
    <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
      {children}
    </p>
  );
}

function formatMetaLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

async function copyDeploymentId(run: HudDeploymentRun) {
  try {
    await navigator.clipboard.writeText(String(run.id));
    toast.success('Deployment ID copied');
  } catch {
    toast.error('Failed to copy deployment ID');
  }
}

function DeploymentActionsMenu({
  run,
}: Readonly<{ readonly run: HudDeploymentRun }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-label='Deployment Actions'
          className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-tertiary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-secondary-token focus-visible:bg-surface-1 focus-visible:outline-none'
        >
          <MoreHorizontal className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={6}>
        {run.url ? (
          <DropdownMenuItem asChild>
            <a href={run.url} target='_blank' rel='noopener noreferrer'>
              <ExternalLink className='h-3.5 w-3.5' />
              Open GitHub run
            </a>
          </DropdownMenuItem>
        ) : null}
        {run.branch ? (
          <DropdownMenuItem asChild>
            <a
              href={`https://github.com/JovieInc/Jovie/tree/${encodeURIComponent(run.branch)}`}
              target='_blank'
              rel='noopener noreferrer'
            >
              <GitBranch className='h-3.5 w-3.5' />
              Open branch
            </a>
          </DropdownMenuItem>
        ) : null}
        {(run.url ?? run.branch) ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          onClick={() => {
            void copyDeploymentId(run);
          }}
        >
          <Copy className='h-3.5 w-3.5' />
          Copy deployment ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CompactDeploymentRow({
  run,
}: Readonly<{
  readonly run: HudMetrics['deployments']['recent'][number];
}>) {
  return (
    <ShellListRowFrame className='grid gap-1.5 border-b border-subtle px-0 py-2.5 last:border-b-0'>
      <div className='flex min-w-0 items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${DEPLOYMENT_STATE_DOT_CLASSNAMES[run.status]}`}
            aria-hidden='true'
          />
          <p className='truncate text-app font-semibold text-primary-token'>
            {DEPLOYMENT_STATE_LABELS[run.status]}
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-1.5'>
          <p className='text-xs font-[560] tabular-nums text-primary-token'>
            #{run.runNumber}
          </p>
          <DeploymentActionsMenu run={run} />
        </div>
      </div>
      <p
        className='truncate text-xs leading-4 text-secondary-token'
        title={run.branch ?? undefined}
      >
        {run.branch ?? '\u2014'}
      </p>
      <p className='text-2xs text-tertiary-token'>
        {formatDeploymentTime(run.createdAtIso)}
      </p>
    </ShellListRowFrame>
  );
}

function DeploymentRow({
  run,
}: Readonly<{
  readonly run: HudMetrics['deployments']['recent'][number];
}>) {
  return (
    <ShellListRowFrame className='flex items-center justify-between gap-3 border border-subtle bg-surface-0 px-3 py-2.5'>
      <div className='min-w-0'>
        <p className='truncate text-app font-semibold text-primary-token'>
          #{run.runNumber}
          <span className='ml-2 font-normal text-secondary-token'>
            {run.branch ?? '\u2014'}
          </span>
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <div className='text-right'>
          <p className='text-2xs text-tertiary-token'>
            {formatDeploymentTime(run.createdAtIso)}
          </p>
          <p className='mt-0.5 text-2xs font-medium text-secondary-token'>
            {DEPLOYMENT_STATE_LABELS[run.status]}
          </p>
        </div>
        <DeploymentActionsMenu run={run} />
      </div>
    </ShellListRowFrame>
  );
}

function DeploymentsPanel({
  deployments,
  detail,
}: Readonly<{
  readonly deployments: HudMetrics['deployments'];
  readonly detail: string;
}>) {
  return (
    <div
      className='space-y-2 border-subtle border-t pt-3'
      data-testid='ops-deployments-panel'
    >
      <div className='flex items-center justify-between gap-3'>
        <p className='text-xs font-[560] text-primary-token'>Deployments</p>
        <p className='truncate text-2xs text-tertiary-token' title={detail}>
          {detail}
        </p>
      </div>
      {deployments.recent.length > 0 ? (
        <div>
          {deployments.recent.slice(0, 5).map(run => (
            <CompactDeploymentRow key={run.id} run={run} />
          ))}
        </div>
      ) : (
        <p className='text-app text-secondary-token'>No recent runs.</p>
      )}
    </div>
  );
}

function DeploymentsPanelWithTrust({
  deployments,
  detail,
  githubSource,
  onRetry,
}: Readonly<{
  readonly deployments: HudMetrics['deployments'];
  readonly detail: string;
  readonly githubSource: HudMetrics['sources']['github'];
  readonly onRetry?: () => void;
}>) {
  return (
    <div className='space-y-2'>
      <DeploymentsPanel deployments={deployments} detail={detail} />
      <HudMetricSourceTrust source={githubSource} onRetry={onRetry} />
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
    <ShellListRowFrame className='flex items-start justify-between gap-3 border border-subtle bg-surface-0 px-3 py-2.5'>
      <div className='min-w-0'>
        <p className='truncate text-app font-semibold text-primary-token'>
          {item.summary}
        </p>
        <p className='mt-1 text-2xs text-tertiary-token'>
          {formatMetaLabel(item.source)} / {formatMetaLabel(item.status)}
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-1.5 text-right text-2xs text-tertiary-token'>
        <p>{formatDeploymentTime(item.updatedAt)}</p>
        {isDismissed && onUndismiss ? (
          <button
            type='button'
            onClick={onUndismiss}
            aria-label='Restore Item'
            className='rounded px-1 py-0.5 text-2xs text-tertiary-token hover:text-primary-token'
          >
            Undo
          </button>
        ) : onDismiss ? (
          <button
            type='button'
            onClick={onDismiss}
            aria-label='Dismiss Item'
            className='rounded p-0.5 text-tertiary-token hover:text-primary-token'
          >
            <X className='h-3.5 w-3.5' aria-hidden='true' />
          </button>
        ) : null}
      </div>
    </ShellListRowFrame>
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
      <p className='text-app leading-5 text-secondary-token'>
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
          placeholder={DISPATCH_SOURCE_PLACEHOLDER}
          className='min-h-10 rounded-lg border border-subtle bg-surface-0 px-3 text-app text-primary-token outline-none'
        />
        <select
          value={runtime}
          onChange={event => setRuntime(event.target.value as HermesCliRuntime)}
          className='min-h-10 rounded-lg border border-subtle bg-surface-0 px-3 text-app text-primary-token outline-none'
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
          className='min-h-10 rounded-lg border border-subtle bg-surface-0 px-3 text-app text-primary-token outline-none'
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
          className='inline-flex min-h-10 items-center gap-2 rounded-lg border border-(--linear-btn-primary-border) bg-btn-primary px-3 text-app font-semibold text-btn-primary-foreground shadow-button-inset transition-colors hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover disabled:cursor-not-allowed disabled:opacity-60'
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
          className='inline-flex min-h-10 items-center gap-2 rounded-lg border border-subtle bg-surface-0 px-3 text-app font-semibold text-primary-token disabled:cursor-not-allowed disabled:opacity-60'
        >
          Dry run
        </button>
      </div>
      {message ? (
        <p className='text-app leading-5 text-secondary-token'>{message}</p>
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
  /** When true and agentRuns empty, show dev fixtures on Agent OS panel. */
  readonly useFixtureAgentRuns?: boolean;
}

function resolveAgentOsArtifacts(
  metrics: HudMetrics,
  useFixtureAgentRuns: boolean
): AgentRunArtifact[] {
  if (metrics.agentRuns.length > 0) {
    return [...metrics.agentRuns];
  }
  if (useFixtureAgentRuns) {
    return [...AGENT_OS_ADMIN_FIXTURE_ARTIFACTS];
  }
  return [];
}

function makeItemKey(item: HudMetrics['aiOps']['blockers'][number]): string {
  return `${item.source}|${item.summary}|${item.updatedAt}`;
}

function metricSubtitleWithTrust(
  body: ReactNode,
  source: HudMetrics['sources'][keyof HudMetrics['sources']],
  onRetry?: () => void
): ReactNode {
  return (
    <>
      {body}
      <HudMetricSourceTrust source={source} onRetry={onRetry} />
    </>
  );
}

export function HudDashboardClient({
  initialMetrics,
  density = 'kiosk',
  presentationMode = 'token',
  hudUrl,
  kioskToken = null,
  initialShippingData,
  initialShippingCachedAt,
  useFixtureAgentRuns = false,
}: HudDashboardClientProps) {
  const { data: metrics, refetch } = useHudMetricsQuery(
    initialMetrics,
    kioskToken
  );
  const agentOsArtifacts = resolveAgentOsArtifacts(
    metrics,
    useFixtureAgentRuns
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
  const stripeSource = metrics.sources.stripe;
  const mercurySource = metrics.sources.mercury;
  const databaseSource = metrics.sources.database;
  const sentrySource = metrics.sources.sentry;
  const githubSource = metrics.sources.github;
  const handleSourceRetry = () => {
    refetch().catch(() => {});
  };

  const isShell = density === 'shell';
  const showDispatch = presentationMode !== 'token';
  const showQrPanel = presentationMode === 'token' && Boolean(hudUrl);

  // Outer layout: shell defers width to the AdminToolPage container (no
  // additional centering or max-width so metrics fill the full horizontal
  // space at any viewport). Kiosk keeps its own padding for breathing room
  // on TV displays but also removes the max-width cap so wide monitors get
  // full-bleed density.
  const outerClass = isShell
    ? 'flex w-full flex-col gap-3'
    : 'flex w-full flex-col gap-3 px-4 py-4 sm:px-6 sm:py-6 xl:px-8';

  // MRR scale: shell matches Overview KPIs (~28-32px); kiosk keeps the
  // TV-readable 44/56/72 ramp.
  const mrrValueClass = isShell
    ? 'text-3xl font-[620] leading-none tracking-[-0.03em] sm:text-3xl'
    : 'text-5xl font-[620] leading-none tracking-[-0.045em] sm:text-[56px] lg:text-[72px]';

  // Operations / Reliability / Runway KPIs likewise scale down in shell.
  const secondaryValueClass = isShell
    ? 'text-2xl font-[620] leading-none tracking-[-0.03em] sm:text-3xl'
    : 'text-4xl font-[620] leading-none tracking-[-0.04em] sm:text-[42px]';

  const aiOpsSummary = (
    <span>
      {metrics.aiOps.mergeQueue.openAgentPrs} /{' '}
      {metrics.aiOps.mergeQueue.openAgentPrThreshold} agent PRs open | Running{' '}
      {metrics.aiOps.counts.running.toLocaleString('en-US')} | Review{' '}
      {metrics.aiOps.counts.review.toLocaleString('en-US')} | Blocked{' '}
      {metrics.aiOps.counts.blocked.toLocaleString('en-US')} | Failed{' '}
      {metrics.aiOps.counts.failed.toLocaleString('en-US')} | Stale{' '}
      {metrics.aiOps.counts.stale.toLocaleString('en-US')}
    </span>
  );

  if (isShell) {
    return (
      <div className={outerClass}>
        <WhatShipped kioskToken={kioskToken} />
        <TimActionRequiredSection />
        <HudKpiSubgrid metrics={metrics} />
        <HudSystemHealthStrip metrics={metrics} />
        <DesignProposalReviewPanel />

        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
          <ContentMetricCard
            label='MRR'
            value={
              isHudMetricValueAvailable(stripeSource)
                ? formatUsd(metrics.overview.mrrUsd)
                : '\u2014'
            }
            subtitle={metricSubtitleWithTrust(
              <span>
                {isHudMetricValueAvailable(stripeSource)
                  ? `${metrics.overview.activeSubscribers.toLocaleString('en-US')} subscribers`
                  : 'Stripe data unavailable'}
              </span>,
              stripeSource,
              handleSourceRetry
            )}
            headerRight={
              <HudStatusPill label={deploymentLabel} tone={deploymentsTone} />
            }
            className='p-3'
            valueClassName={mrrValueClass}
          />
          <ContentMetricCard
            label='Runway'
            value={
              isHudMetricValueAvailable(mercurySource)
                ? formatRunway(metrics.overview.runwayMonths)
                : '\u2014'
            }
            subtitle={metricSubtitleWithTrust(
              isHudMetricValueAvailable(mercurySource) ? (
                <div className='grid gap-1.5'>
                  <ContentMetricRow
                    label='Cash'
                    value={formatUsd(metrics.overview.balanceUsd)}
                  />
                  <ContentMetricRow
                    label={RUNWAY_BURN_LABEL}
                    value={formatUsd(metrics.overview.burnRateUsd)}
                  />
                </div>
              ) : (
                <span>Mercury data unavailable</span>
              ),
              mercurySource,
              handleSourceRetry
            )}
            className='p-3'
            valueClassName={secondaryValueClass}
          />
          <HudHealthMetricCards
            metrics={metrics}
            secondaryValueClass={secondaryValueClass}
            databaseSource={databaseSource}
            sentrySource={sentrySource}
            handleSourceRetry={handleSourceRetry}
          />
        </div>

        {metrics.accessMode === 'admin' ? (
          <AgentOsRunsPanel
            artifacts={agentOsArtifacts}
            summary={aiOpsSummary}
            status={<HudStatusPill label={aiOpsLabel} tone={aiOpsTone} />}
            deploymentsPanel={
              <DeploymentsPanelWithTrust
                deployments={metrics.deployments}
                detail={deploymentDetail}
                githubSource={githubSource}
                onRetry={handleSourceRetry}
              />
            }
          />
        ) : null}

        <div className='grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]'>
          <ContentSurfaceCard surface='details' className='overflow-hidden p-0'>
            <ShippingVelocityChart
              initialData={initialShippingData}
              initialRange='7d'
              cachedAt={initialShippingCachedAt}
            />
          </ContentSurfaceCard>

          <ContentSurfaceCard
            surface='details'
            className='p-3'
            data-testid='hud-bottom-marker'
          >
            <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
              <div className='space-y-2'>
                <SectionLabel>Default status</SectionLabel>
                <p className='text-2xl font-[620] leading-none tracking-[-0.03em] text-primary-token sm:text-3xl'>
                  {formatDefaultStatusLabel(metrics.overview.defaultStatus)}
                </p>
                <p className='max-w-4xl text-app leading-6 text-secondary-token'>
                  {metrics.overview.defaultStatusDetail}
                </p>
              </div>
              <HudStatusPill
                label={formatDefaultStatusLabel(metrics.overview.defaultStatus)}
                tone={defaultTone}
              />
            </div>
          </ContentSurfaceCard>
        </div>
      </div>
    );
  }

  return (
    <div className={outerClass}>
      {!isShell ? (
        <ContentSurfaceCard
          surface='details'
          className='flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5'
        >
          <div className='flex items-center gap-3'>
            <div className='relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-subtle bg-surface-0'>
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
              <SectionLabel>HUD</SectionLabel>
              <h1 className='mt-1 truncate text-xl font-[620] leading-none tracking-[-0.03em] text-primary-token sm:text-2xl'>
                {metrics.branding.startupName}
              </h1>
            </div>
          </div>
          <div className='flex flex-col items-start gap-1 sm:items-end'>
            <div className='text-lg font-[620] tracking-[-0.03em] text-primary-token sm:text-xl'>
              <HudClockClient />
            </div>
            <p className='text-xs text-secondary-token'>
              Updated {formatUpdatedTime(metrics.generatedAtIso)}
            </p>
          </div>
        </ContentSurfaceCard>
      ) : null}

      <WhatShipped kioskToken={kioskToken} />

      {/* Tim Action Required — personal manual items, surfaces above everything else */}
      {/* ContentSurfaceCard is rendered by TimActionRequiredSection itself so it can self-hide */}
      <TimActionRequiredSection />

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
            label='Monthly Recurring Revenue'
            value={
              isHudMetricValueAvailable(stripeSource)
                ? formatUsd(metrics.overview.mrrUsd)
                : '\u2014'
            }
            subtitle={metricSubtitleWithTrust(
              <span className='text-sm text-secondary-token'>
                {isHudMetricValueAvailable(stripeSource)
                  ? `${metrics.overview.activeSubscribers.toLocaleString('en-US')} subscribers`
                  : 'Stripe data unavailable'}
              </span>,
              stripeSource,
              handleSourceRetry
            )}
            headerRight={
              <HudStatusPill label={deploymentLabel} tone={deploymentsTone} />
            }
            className='p-3'
            valueClassName={mrrValueClass}
          />

          <div className='grid grid-cols-2 gap-3'>
            <ContentMetricCard
              label='Runway'
              value={
                isHudMetricValueAvailable(mercurySource)
                  ? formatRunway(metrics.overview.runwayMonths)
                  : '\u2014'
              }
              subtitle={metricSubtitleWithTrust(
                isHudMetricValueAvailable(mercurySource) ? (
                  <div className='grid gap-1.5'>
                    <ContentMetricRow
                      label='Cash'
                      value={formatUsd(metrics.overview.balanceUsd)}
                    />
                    <ContentMetricRow
                      label={OVERVIEW_BURN_LABEL}
                      value={formatUsd(metrics.overview.burnRateUsd)}
                    />
                  </div>
                ) : (
                  <span>Mercury data unavailable</span>
                ),
                mercurySource,
                handleSourceRetry
              )}
              className='p-3'
              valueClassName={secondaryValueClass}
            />
            <HudHealthMetricCards
              metrics={metrics}
              secondaryValueClass={secondaryValueClass}
              databaseSource={databaseSource}
              sentrySource={sentrySource}
              handleSourceRetry={handleSourceRetry}
            />
          </div>
        </div>
      </div>

      {/* Deployments + optional QR panel */}
      {showQrPanel ? (
        <div className='grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]'>
          <HudDeploymentsSurfaceCard
            metrics={metrics}
            deploymentDetail={deploymentDetail}
            githubSource={githubSource}
            handleSourceRetry={handleSourceRetry}
          />

          <ContentSurfaceCard surface='details' className='space-y-4 p-3'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
              <div className='space-y-1'>
                <SectionLabel>Open on phone</SectionLabel>
                <p className='text-xl font-[620] tracking-[-0.03em] text-primary-token'>
                  Scan to view
                </p>
                <p className='max-w-[28ch] text-app leading-5 text-secondary-token'>
                  Open the live HUD on another device using this kiosk link.
                </p>
              </div>
              <div className='rounded-xl border border-subtle bg-surface-0 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
                <QRCode
                  data={hudUrl ?? ''}
                  size={196}
                  label='HUD Link'
                  className='rounded-lg bg-white dark:bg-white'
                />
              </div>
            </div>
          </ContentSurfaceCard>
        </div>
      ) : (
        <HudDeploymentsSurfaceCard
          metrics={metrics}
          deploymentDetail={deploymentDetail}
          githubSource={githubSource}
          handleSourceRetry={handleSourceRetry}
        />
      )}

      {/* AI Ops / Hermes control plane */}
      <ContentSurfaceCard surface='details' className='space-y-4 p-3'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-1'>
            <SectionLabel>AI ops</SectionLabel>
            <p className='text-2xl font-[620] leading-none text-primary-token sm:text-3xl'>
              Hermes control plane
            </p>
            <p className='text-app leading-5 text-secondary-token'>
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
              <SectionLabel>Blockers</SectionLabel>
              <p className='text-xs text-secondary-token'>
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
                    <p className='text-app text-secondary-token'>
                      No blocked worker runs or agent PRs.
                    </p>
                  )}
                  {dismissed.length > 0 ? (
                    <details className='group'>
                      <summary className='cursor-pointer list-none text-2xs font-medium text-tertiary-token hover:text-secondary-token'>
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
            <SectionLabel>Dispatch</SectionLabel>
            {showDispatch && metrics.accessMode === 'admin' ? (
              <HermesDispatchControls
                aiOps={metrics.aiOps}
                onDispatchComplete={() => {
                  refetch().catch(() => {});
                }}
              />
            ) : (
              <p className='text-app leading-5 text-secondary-token'>
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
              <SectionLabel>Next actions</SectionLabel>
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
                <p className='mt-2 text-app text-secondary-token'>
                  All next actions dismissed.
                </p>
              )}
              {dismissedRecs.length > 0 ? (
                <details className='mt-2'>
                  <summary className='cursor-pointer list-none text-2xs font-medium text-tertiary-token hover:text-secondary-token'>
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

      {isShell && metrics.accessMode === 'admin' ? (
        <AgentOsRunsPanel artifacts={agentOsArtifacts} />
      ) : null}

      <ContentSurfaceCard
        surface='details'
        className='p-3'
        data-testid='hud-bottom-marker'
      >
        <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
          <div className='space-y-2'>
            <SectionLabel>Default status</SectionLabel>
            <p
              className={
                isShell
                  ? 'text-2xl font-[620] leading-none tracking-[-0.03em] text-primary-token sm:text-3xl'
                  : 'text-4xl font-[620] leading-none tracking-[-0.045em] text-primary-token sm:text-5xl'
              }
            >
              {formatDefaultStatusLabel(metrics.overview.defaultStatus)}
            </p>
            <p
              className={
                isShell
                  ? 'max-w-4xl text-app leading-6 text-secondary-token'
                  : 'max-w-4xl text-mid leading-7 text-secondary-token'
              }
            >
              {metrics.overview.defaultStatusDetail}
            </p>
          </div>
          <HudStatusPill
            label={formatDefaultStatusLabel(metrics.overview.defaultStatus)}
            tone={defaultTone}
          />
        </div>
      </ContentSurfaceCard>
    </div>
  );
}

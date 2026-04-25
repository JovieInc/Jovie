import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  HardDrive,
  Rocket,
  Siren,
} from 'lucide-react';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { AdminReliabilitySummary } from '@/lib/admin/types';

interface ReliabilityCardProps {
  readonly summary: AdminReliabilitySummary;
}

type HealthTone = {
  label: 'Healthy' | 'Needs attention' | 'Critical';
  labelClassName: string;
  iconClassName: string;
};

function getHealthTone(summary: AdminReliabilitySummary): HealthTone {
  if (
    summary.incidents24h >= 5 ||
    summary.errorRatePercent >= 5 ||
    !summary.redisAvailable ||
    summary.deploymentAvailability === 'error' ||
    summary.deploymentState === 'failure'
  ) {
    return {
      label: 'Critical',
      labelClassName: 'text-error',
      iconClassName: 'text-error',
    };
  }

  if (
    summary.incidents24h >= 1 ||
    summary.errorRatePercent >= 1 ||
    summary.unresolvedSentryIssues24h > 0 ||
    summary.deploymentState === 'in_progress'
  ) {
    return {
      label: 'Needs attention',
      labelClassName: 'text-warning',
      iconClassName: 'text-warning',
    };
  }

  return {
    label: 'Healthy',
    labelClassName: 'text-success',
    iconClassName: 'text-success',
  };
}

const DEPLOYMENT_STATE_LABELS: Record<string, string> = {
  in_progress: 'In progress',
  failure: 'Failed',
  success: 'Healthy',
};

function getDeploymentLabel(summary: AdminReliabilitySummary): string {
  if (summary.deploymentAvailability === 'not_configured')
    return 'Not configured';
  if (summary.deploymentAvailability === 'error') return 'Unavailable';
  if (summary.deploymentState === null) return 'Unknown';
  return DEPLOYMENT_STATE_LABELS[summary.deploymentState] ?? 'Unknown';
}

export function ReliabilityCard({ summary }: Readonly<ReliabilityCardProps>) {
  const tone = getHealthTone(summary);
  const errorRateLabel = `${summary.errorRatePercent.toFixed(2)}%`;
  const latencyLabel =
    summary.p95LatencyMs === null
      ? '—'
      : `${summary.p95LatencyMs.toFixed(0)}ms`;
  const incidentsLabel = summary.incidents24h.toLocaleString();
  const sentryIssuesLabel = summary.unresolvedSentryIssues24h.toLocaleString();
  const redisLabel = summary.redisAvailable ? 'Available' : 'Unavailable';
  const deploymentLabel = getDeploymentLabel(summary);
  const lastIncidentLabel = summary.lastIncidentAt
    ? summary.lastIncidentAt.toISOString().slice(0, 10)
    : '—';

  return (
    <ContentSurfaceCard className='h-full overflow-hidden'>
      <ContentSectionHeader
        title='Reliability'
        subtitle='System health metrics'
        actions={
          <span className={`text-xs font-medium ${tone.labelClassName}`}>
            {tone.label}
          </span>
        }
        className='px-(--linear-app-header-padding-x) py-3'
      />
      <div className='space-y-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) text-xs leading-[17px] text-secondary-token'>
        <ContentMetricRow
          label='Error rate'
          value={errorRateLabel}
          icon={CheckCircle2}
          iconClassName={tone.iconClassName}
        />
        <ContentMetricRow
          label='p95 latency'
          value={latencyLabel}
          icon={Clock3}
          iconClassName={tone.iconClassName}
        />
        <ContentMetricRow
          label='Incidents (24h)'
          value={incidentsLabel}
          icon={summary.incidents24h > 0 ? AlertTriangle : CheckCircle2}
          iconClassName={
            summary.incidents24h > 0 ? tone.iconClassName : 'text-success'
          }
        />
        <ContentMetricRow
          label='Sentry issues'
          value={sentryIssuesLabel}
          icon={summary.unresolvedSentryIssues24h > 0 ? Siren : CheckCircle2}
          iconClassName={
            summary.unresolvedSentryIssues24h > 0
              ? tone.iconClassName
              : 'text-success'
          }
        />
        <ContentMetricRow
          label='Redis'
          value={redisLabel}
          icon={summary.redisAvailable ? CheckCircle2 : HardDrive}
          iconClassName={summary.redisAvailable ? 'text-success' : 'text-error'}
        />
        <ContentMetricRow
          label='Deploys'
          value={deploymentLabel}
          icon={
            summary.deploymentAvailability === 'available' &&
            summary.deploymentState !== 'failure'
              ? Rocket
              : AlertTriangle
          }
          iconClassName={
            summary.deploymentAvailability === 'available' &&
            summary.deploymentState === 'success'
              ? 'text-success'
              : tone.iconClassName
          }
        />

        {summary.lastIncidentAt && (
          <p className='pt-1 text-2xs text-tertiary-token'>
            Last incident on {lastIncidentLabel}.
            {tone.label !== 'Healthy' && (
              <> Review logs and alerts before shipping new changes.</>
            )}
          </p>
        )}
      </div>
    </ContentSurfaceCard>
  );
}

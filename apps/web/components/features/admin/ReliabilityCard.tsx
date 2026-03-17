import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { AdminReliabilitySummary } from '@/lib/admin/overview';

interface ReliabilityCardProps {
  readonly summary: AdminReliabilitySummary;
}

type HealthTone = {
  label: 'Healthy' | 'Needs attention' | 'Critical';
  labelClassName: string;
  iconClassName: string;
};

function getHealthTone(summary: AdminReliabilitySummary): HealthTone {
  if (summary.incidents24h >= 5 || summary.errorRatePercent >= 5) {
    return {
      label: 'Critical',
      labelClassName: 'text-error',
      iconClassName: 'text-error',
    };
  }

  if (summary.incidents24h >= 1 || summary.errorRatePercent >= 1) {
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

export function ReliabilityCard({ summary }: Readonly<ReliabilityCardProps>) {
  const tone = getHealthTone(summary);
  const errorRateLabel = `${summary.errorRatePercent.toFixed(2)}%`;
  const latencyLabel =
    summary.p95LatencyMs === null
      ? '—'
      : `${summary.p95LatencyMs.toFixed(0)}ms`;
  const incidentsLabel = summary.incidents24h.toLocaleString();
  const lastIncidentLabel = summary.lastIncidentAt
    ? summary.lastIncidentAt.toISOString().slice(0, 10)
    : '—';

  return (
    <ContentSurfaceCard className='h-full overflow-hidden'>
      <ContentSectionHeader
        title='Reliability'
        subtitle='System health metrics'
        actions={
          <span className={`text-[12px] font-medium ${tone.labelClassName}`}>
            {tone.label}
          </span>
        }
        className='px-5 py-3'
      />
      <div className='space-y-3 p-5 text-[12px] leading-[17px] text-secondary-token'>
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

        {summary.lastIncidentAt && (
          <p className='pt-1 text-[11px] text-tertiary-token'>
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

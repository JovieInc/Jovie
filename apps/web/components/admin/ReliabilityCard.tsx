import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
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
          <span className={`text-app font-medium ${tone.labelClassName}`}>
            {tone.label}
          </span>
        }
        className='px-5 py-3'
      />
      <div className='space-y-3 p-5 text-app text-secondary-token'>
        <div className='flex items-center justify-between rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-3 py-2.5'>
          <div className='flex items-center gap-2 font-medium text-(--linear-text-primary)'>
            <CheckCircle2 className={`h-4 w-4 ${tone.iconClassName}`} />
            Error rate
          </div>
          <span className='tabular-nums text-(--linear-text-primary)'>
            {errorRateLabel}
          </span>
        </div>
        <div className='flex items-center justify-between rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-3 py-2.5'>
          <div className='flex items-center gap-2 font-medium text-(--linear-text-primary)'>
            <Clock3 className={`h-4 w-4 ${tone.iconClassName}`} />
            p95 latency
          </div>
          <span className='tabular-nums text-(--linear-text-primary)'>
            {latencyLabel}
          </span>
        </div>
        <div className='flex items-center justify-between rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-3 py-2.5'>
          <div className='flex items-center gap-2 font-medium text-(--linear-text-primary)'>
            {summary.incidents24h > 0 ? (
              <AlertTriangle className={`h-4 w-4 ${tone.iconClassName}`} />
            ) : (
              <CheckCircle2 className='h-4 w-4 text-success' />
            )}
            Incidents (24h)
          </div>
          <span className='text-primary-token tabular-nums'>
            {incidentsLabel}
          </span>
        </div>

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

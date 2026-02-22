import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
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
      labelClassName: 'text-red-600 dark:text-red-400',
      iconClassName: 'text-red-500',
    };
  }

  if (summary.incidents24h >= 1 || summary.errorRatePercent >= 1) {
    return {
      label: 'Needs attention',
      labelClassName: 'text-amber-600 dark:text-amber-400',
      iconClassName: 'text-amber-500',
    };
  }

  return {
    label: 'Healthy',
    labelClassName: 'text-emerald-600 dark:text-emerald-400',
    iconClassName: 'text-emerald-500',
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
    <div className='h-full space-y-4'>
      <div className='flex items-start justify-between'>
        <div>
          <h3 className='text-sm font-medium text-primary-token'>
            Reliability
          </h3>
          <p className='text-xs text-tertiary-token'>System health metrics</p>
        </div>
        <span className={`text-xs font-medium ${tone.labelClassName}`}>
          {tone.label}
        </span>
      </div>
      <div className='space-y-3 text-sm text-secondary-token'>
        <div className='flex items-center justify-between py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <CheckCircle2 className={`size-4 ${tone.iconClassName}`} />
            Error rate
          </div>
          <span className='text-primary-token tabular-nums'>
            {errorRateLabel}
          </span>
        </div>
        <div className='flex items-center justify-between py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <Clock3 className='size-4 text-blue-500' />
            p95 latency
          </div>
          <span className='text-primary-token tabular-nums'>
            {latencyLabel}
          </span>
        </div>
        <div className='flex items-center justify-between py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <AlertTriangle className='size-4 text-amber-500' />
            Incidents (24h)
          </div>
          <span className='text-primary-token tabular-nums'>
            {incidentsLabel}
          </span>
        </div>
      </div>
      <p className='text-xs text-tertiary-token'>
        Last incident resolved on {lastIncidentLabel}. Review logs and alerts
        before shipping new changes.
      </p>
    </div>
  );
}

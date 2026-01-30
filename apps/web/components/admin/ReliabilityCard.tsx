import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import type { AdminReliabilitySummary } from '@/lib/admin/overview';

interface ReliabilityCardProps {
  readonly summary: AdminReliabilitySummary;
}

export function ReliabilityCard({ summary }: Readonly<ReliabilityCardProps>) {
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
        <span className='text-xs font-medium text-emerald-600 dark:text-emerald-400'>
          Healthy
        </span>
      </div>
      <div className='space-y-3 text-sm text-secondary-token'>
        <div className='flex items-center justify-between py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <CheckCircle2 className='size-4 text-emerald-500' />
            Error rate
          </div>
          <span className='text-primary-token'>{errorRateLabel}</span>
        </div>
        <div className='flex items-center justify-between py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <Clock3 className='size-4 text-blue-500' />
            p95 latency
          </div>
          <span className='text-primary-token'>{latencyLabel}</span>
        </div>
        <div className='flex items-center justify-between py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <AlertTriangle className='size-4 text-amber-500' />
            Incidents (24h)
          </div>
          <span className='text-primary-token'>{incidentsLabel}</span>
        </div>
      </div>
      <p className='text-xs text-tertiary-token'>
        Last incident resolved on {lastIncidentLabel}. Review logs and alerts
        before shipping new changes.
      </p>
    </div>
  );
}

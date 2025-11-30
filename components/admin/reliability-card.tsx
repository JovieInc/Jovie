import { Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import type { AdminReliabilitySummary } from '@/lib/admin/overview';

// TODO: extend reliability metrics with additional system health data.

interface ReliabilityCardProps {
  summary: AdminReliabilitySummary;
}

export function ReliabilityCard({ summary }: ReliabilityCardProps) {
  const errorRateLabel = `${summary.errorRatePercent.toFixed(2)}%`;
  const latencyLabel =
    summary.p95LatencyMs != null ? `${summary.p95LatencyMs.toFixed(0)}ms` : '—';
  const incidentsLabel = summary.incidents24h.toLocaleString();
  const lastIncidentLabel = summary.lastIncidentAt
    ? summary.lastIncidentAt.toISOString().slice(0, 10)
    : '—';

  return (
    <Card className='h-full border-subtle bg-surface-1/80 backdrop-blur-sm'>
      <CardHeader className='flex flex-row items-start justify-between'>
        <CardTitle className='text-lg'>Reliability</CardTitle>
        <span className='rounded-full border border-subtle bg-surface-2 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300'>
          Healthy
        </span>
      </CardHeader>
      <CardContent className='space-y-4 text-sm text-secondary-token'>
        <div className='grid gap-3'>
          <div className='flex items-center justify-between rounded-lg border border-subtle bg-surface-2 px-3 py-2'>
            <div className='flex items-center gap-2 font-medium text-primary-token'>
              <CheckCircle2 className='size-4 text-emerald-500' />
              Error rate
            </div>
            <span className='text-primary-token'>{errorRateLabel}</span>
          </div>
          <div className='flex items-center justify-between rounded-lg border border-subtle bg-surface-2 px-3 py-2'>
            <div className='flex items-center gap-2 font-medium text-primary-token'>
              <Clock3 className='size-4 text-blue-500' />
              p95 latency
            </div>
            <span className='text-primary-token'>{latencyLabel}</span>
          </div>
          <div className='flex items-center justify-between rounded-lg border border-subtle bg-surface-2 px-3 py-2'>
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
      </CardContent>
    </Card>
  );
}

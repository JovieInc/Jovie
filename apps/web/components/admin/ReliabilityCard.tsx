import { Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
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
    ? typeof summary.lastIncidentAt === 'string'
      ? summary.lastIncidentAt.slice(0, 10)
      : summary.lastIncidentAt.toISOString().slice(0, 10)
    : '—';

  return (
    <Card className='h-full border-subtle bg-surface-1/80'>
      <CardHeader className='space-y-1 p-5 pb-3'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <CardTitle className='text-lg tracking-tight'>
              Reliability
            </CardTitle>
            <p className='text-2xs text-tertiary-token'>
              System health metrics
            </p>
          </div>
          <span className={`text-app font-medium ${tone.labelClassName}`}>
            {tone.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className='space-y-3 p-5 pt-0 text-app text-secondary-token'>
        <div className='flex items-center justify-between rounded-md bg-surface-2 px-3 py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <CheckCircle2 className={`h-4 w-4 ${tone.iconClassName}`} />
            Error rate
          </div>
          <span className='text-primary-token tabular-nums'>
            {errorRateLabel}
          </span>
        </div>
        <div className='flex items-center justify-between rounded-md bg-surface-2 px-3 py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <Clock3 className={`h-4 w-4 ${tone.iconClassName}`} />
            p95 latency
          </div>
          <span className='text-primary-token tabular-nums'>
            {latencyLabel}
          </span>
        </div>
        <div className='flex items-center justify-between rounded-md bg-surface-2 px-3 py-2'>
          <div className='flex items-center gap-2 font-medium text-primary-token'>
            <AlertTriangle className={`h-4 w-4 ${tone.iconClassName}`} />
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
      </CardContent>
    </Card>
  );
}

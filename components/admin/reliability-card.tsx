import { Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';

// TODO: replace mock reliability metrics with live system health data.
const reliability = {
  errorRate: '0.34%',
  p95Latency: '182ms',
  incidents24h: 0,
  lastIncident: '2024-06-28',
};

export function ReliabilityCard() {
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
            <span className='text-primary-token'>{reliability.errorRate}</span>
          </div>
          <div className='flex items-center justify-between rounded-lg border border-subtle bg-surface-2 px-3 py-2'>
            <div className='flex items-center gap-2 font-medium text-primary-token'>
              <Clock3 className='size-4 text-blue-500' />
              p95 latency
            </div>
            <span className='text-primary-token'>{reliability.p95Latency}</span>
          </div>
          <div className='flex items-center justify-between rounded-lg border border-subtle bg-surface-2 px-3 py-2'>
            <div className='flex items-center gap-2 font-medium text-primary-token'>
              <AlertTriangle className='size-4 text-amber-500' />
              Incidents (24h)
            </div>
            <span className='text-primary-token'>
              {reliability.incidents24h}
            </span>
          </div>
        </div>
        <p className='text-xs text-tertiary-token'>
          Last incident resolved on {reliability.lastIncident}. Review logs and
          alerts before shipping new changes.
        </p>
      </CardContent>
    </Card>
  );
}

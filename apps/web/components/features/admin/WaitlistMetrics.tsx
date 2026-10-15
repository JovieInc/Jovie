import { AlertCircle, CheckCircle2, MailCheck, UserPlus2 } from 'lucide-react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import type { WaitlistMetrics as WaitlistMetricsType } from '@/lib/admin/types';

interface WaitlistMetricsProps {
  readonly metrics: WaitlistMetricsType;
}

export function WaitlistMetrics({ metrics }: WaitlistMetricsProps) {
  return (
    <div
      className='grid gap-3 sm:grid-cols-4'
      data-testid='admin-waitlist-content'
    >
      <ContentMetricCard
        layout='icon-chip-inline'
        label='Waitlisted'
        value={metrics.waitlisted.toLocaleString()}
        icon={UserPlus2}
        tone='accent'
      />
      <ContentMetricCard
        layout='icon-chip-inline'
        label='Invited'
        value={metrics.invited.toLocaleString()}
        icon={MailCheck}
        tone='secondary'
      />
      <ContentMetricCard
        layout='icon-chip-inline'
        label='Signed Up'
        value={metrics.signedUp.toLocaleString()}
        icon={CheckCircle2}
        tone='success'
      />
      <ContentMetricCard
        layout='icon-chip-inline'
        label='Email Failures'
        value={metrics.emailFailures.toLocaleString()}
        icon={AlertCircle}
        tone='destructive'
      />
    </div>
  );
}

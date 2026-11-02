import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import type { WaitlistGateFunnel as WaitlistGateFunnelData } from '@/lib/admin/waitlist-gate-funnel';
import { computeRatePercent } from '@/lib/analytics/metrics';
import { getWaitlistRoleLabel } from '@/lib/waitlist/roles';

interface WaitlistGateFunnelProps {
  readonly funnel: WaitlistGateFunnelData;
}

function formatHours(hours: number | null): string {
  if (hours === null) return '–';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/**
 * Closed-signup waitlist numbers beside the existing waitlist metrics:
 * submissions by role, then invite-link conversion per stage.
 */
export function WaitlistGateFunnel({ funnel }: WaitlistGateFunnelProps) {
  const { invite } = funnel;
  const stages = [
    { label: 'Invites Sent', value: invite.sent },
    { label: 'Invites Opened', value: invite.opened },
    { label: 'Accounts Created', value: invite.accountCreated },
    { label: 'Golden Path Entered', value: invite.goldenPathEntered },
    { label: 'Golden Path Completed', value: invite.goldenPathCompleted },
  ] as const;

  return (
    <div className='space-y-3' data-testid='admin-waitlist-gate-funnel'>
      <div className='grid gap-3 sm:grid-cols-5'>
        {funnel.byRole.map(row => (
          <ContentMetricCard
            key={row.role}
            density='compact'
            label={getWaitlistRoleLabel(row.role)}
            value={row.count.toLocaleString()}
          />
        ))}
      </div>
      <div className='grid gap-3 sm:grid-cols-6'>
        {stages.map(stage => (
          <ContentMetricCard
            key={stage.label}
            density='compact'
            label={stage.label}
            value={stage.value.toLocaleString()}
            subtitle={
              invite.sent > 0
                ? `${computeRatePercent(stage.value, invite.sent, 0)}% of sent`
                : undefined
            }
          />
        ))}
        <ContentMetricCard
          density='compact'
          label='P50 Invite To Golden Path'
          value={formatHours(funnel.p50HoursSentToGoldenPath)}
        />
      </div>
    </div>
  );
}

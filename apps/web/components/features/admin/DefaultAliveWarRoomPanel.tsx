import {
  HudStatusPill,
  type HudStatusPillProps,
} from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { formatUsd } from '@/lib/admin/format';
import type {
  WarRoomAlert,
  WarRoomDailyDecision,
  WarRoomDefaultStatus,
} from '@/lib/admin/war-room';
import { getWarRoomHudSnapshot } from '@/lib/admin/war-room.server';

function formatDefaultStatusLabel(status: WarRoomDefaultStatus): string {
  if (status === 'alive') return 'Default Alive';
  if (status === 'dead') return 'Default Dead';
  return 'Status Unknown';
}

function getDefaultStatusTone(
  status: WarRoomDefaultStatus
): HudStatusPillProps['tone'] {
  if (status === 'alive') return 'good';
  if (status === 'dead') return 'bad';
  return 'warning';
}

function getAlertTone(
  severity: WarRoomAlert['severity']
): HudStatusPillProps['tone'] {
  if (severity === 'critical') return 'bad';
  if (severity === 'warning') return 'warning';
  return 'neutral';
}

function formatDecisionStatus(status: WarRoomDailyDecision['status']): string {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'done') return 'Done';
  if (status === 'blocked') return 'Blocked';
  return 'Pending';
}

function formatRunwayDays(days: number | null): string {
  if (days == null) return '—';
  return `${days.toFixed(1)} days`;
}

export async function DefaultAliveWarRoomPanel() {
  const snapshot = await getWarRoomHudSnapshot();
  const defaultTone = getDefaultStatusTone(snapshot.defaultStatus);
  const invariantTone: HudStatusPillProps['tone'] =
    snapshot.operatingInvariantCompliant ? 'good' : 'warning';

  return (
    <ContentSurfaceCard
      className='overflow-hidden'
      data-testid='default-alive-war-room-panel'
    >
      <ContentSectionHeader
        title='Default Alive War Room'
        subtitle='Daily cash truth, spend freeze, bridge path, and accelerator facts.'
        actions={
          <HudStatusPill
            label={
              snapshot.operatingInvariantCompliant
                ? 'Loop healthy'
                : 'Needs attention'
            }
            tone={invariantTone}
          />
        }
      />

      <div className='space-y-4 p-4 sm:p-5'>
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
          <div className='space-y-1 rounded-lg bg-surface-0 px-2.5 py-2'>
            <ContentMetricRow
              label='Cash Truth'
              value={formatUsd(snapshot.cashTruthBalanceUsd)}
            />
            <p className='text-xs text-tertiary-token'>
              {snapshot.cashTruthVerified
                ? 'CFO verified'
                : `Constraint ${formatUsd(snapshot.cashConstraintUsd)} until JOV-1859`}
            </p>
          </div>
          <div className='space-y-1 rounded-lg bg-surface-0 px-2.5 py-2'>
            <ContentMetricRow
              label='Runway'
              value={formatRunwayDays(snapshot.runwayDays)}
            />
            <p className='text-xs text-tertiary-token'>
              {snapshot.burnRateUsd != null
                ? `Burn ${formatUsd(snapshot.burnRateUsd)}/30d`
                : 'Burn unavailable'}
            </p>
          </div>
          <div className='space-y-1 rounded-lg bg-surface-0 px-2.5 py-2'>
            <ContentMetricRow
              label='Default Status'
              value={formatDefaultStatusLabel(snapshot.defaultStatus)}
            />
            <p className='text-xs text-tertiary-token'>
              {snapshot.defaultStatusDetail}
            </p>
          </div>
          <div className='space-y-1 rounded-lg bg-surface-0 px-2.5 py-2'>
            <ContentMetricRow
              label='Burn Freeze'
              value={snapshot.burnFreezeActive ? 'Active' : 'Off'}
            />
            <p className='text-xs text-tertiary-token'>
              {snapshot.burnFreezeActive
                ? 'Nonessential spend frozen'
                : 'Spend freeze not active'}
            </p>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <HudStatusPill
            label={formatDefaultStatusLabel(snapshot.defaultStatus)}
            tone={defaultTone}
          />
          <HudStatusPill
            label={`Keep ${snapshot.vendorSummary.keep}`}
            tone='good'
          />
          <HudStatusPill
            label={`Cut ${snapshot.vendorSummary.cut}`}
            tone='bad'
          />
          <HudStatusPill
            label={`Defer ${snapshot.vendorSummary.defer}`}
            tone='warning'
          />
          <HudStatusPill
            label={`Bridge ${snapshot.bridgePipeline.identifiedCount}/${snapshot.bridgePipeline.targetCount}`}
            tone='neutral'
          />
        </div>

        {snapshot.alerts.length > 0 ? (
          <div className='space-y-2' data-testid='war-room-alerts'>
            {snapshot.alerts.map(alert => (
              <div
                key={alert.id}
                className='flex items-start gap-2 rounded-md border border-subtle bg-surface-0 px-3 py-2 text-app'
              >
                <HudStatusPill
                  label={alert.severity}
                  tone={getAlertTone(alert.severity)}
                />
                <p className='text-secondary-token'>{alert.message}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className='grid gap-3 lg:grid-cols-2'>
          <div className='space-y-2'>
            <p className='text-app font-medium text-primary-token'>
              Daily decisions
            </p>
            <div className='space-y-2'>
              {snapshot.dailyDecisions.map(decision => (
                <div
                  key={decision.id}
                  className='rounded-md border border-subtle bg-surface-0 px-3 py-2'
                  data-testid={`war-room-decision-${decision.id}`}
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <p className='font-medium text-primary-token'>
                      {decision.label}
                    </p>
                    <HudStatusPill
                      label={formatDecisionStatus(decision.status)}
                      tone={
                        decision.status === 'done'
                          ? 'good'
                          : decision.status === 'blocked'
                            ? 'bad'
                            : 'warning'
                      }
                    />
                  </div>
                  <p className='mt-1 text-xs text-tertiary-token'>
                    Owner: {decision.owner}
                    {decision.linearIssueId
                      ? ` · ${decision.linearIssueId}`
                      : ''}
                    {decision.requiresHumanApproval
                      ? ' · Human approval required'
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className='space-y-2'>
            <p className='text-app font-medium text-primary-token'>
              Accelerator facts
            </p>
            <div className='rounded-md border border-subtle bg-surface-0 px-3 py-3 text-app'>
              <ContentMetricRow
                label='Program'
                value={snapshot.acceleratorFacts.program}
              />
              <ContentMetricRow
                label='Submission Status'
                value={snapshot.acceleratorFacts.submissionStatus}
              />
              <ContentMetricRow
                label='Cash In Facts'
                value={formatUsd(snapshot.acceleratorFacts.cashUsd)}
              />
              <p className='mt-2 text-sm text-secondary-token'>
                {snapshot.acceleratorFacts.deadlineNote}
              </p>
            </div>

            {snapshot.nextPaymentsDue14d.length > 0 ? (
              <div className='space-y-2'>
                <p className='text-app font-medium text-primary-token'>
                  Payments due (14d)
                </p>
                {snapshot.nextPaymentsDue14d.map(payment => (
                  <div key={payment.id} className='space-y-1'>
                    <ContentMetricRow
                      label={payment.label}
                      value={formatUsd(payment.amountUsd)}
                    />
                    <p className='px-2.5 text-xs text-tertiary-token'>
                      Due {payment.dueDate}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

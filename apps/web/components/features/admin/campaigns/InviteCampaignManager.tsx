'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@jovie/ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useCallback, useState } from 'react';

import { Icon } from '@/components/atoms/Icon';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import {
  DEFAULT_THROTTLING,
  type SendCampaignInvitesResponse,
  type ThrottlingConfig,
  useCampaignInvitesQuery,
  useCampaignOverviewQuery,
  useCampaignPreviewQuery,
  useCampaignSettings,
  useCampaignStatsQuery,
  useSendCampaignInvitesMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Threshold for showing confirmation modal */
const LARGE_BATCH_THRESHOLD = 25;

function formatEngagementStatus(engagement: {
  clicked: boolean;
  clickCount: number;
  opened: boolean;
}): string {
  if (engagement.clicked) return `Clicked (${engagement.clickCount})`;
  if (engagement.opened) return 'Opened';
  return 'No events';
}

function CampaignSection({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: Readonly<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}>) {
  return (
    <ContentSurfaceCard className={cn('overflow-hidden', className)}>
      <ContentSectionHeader
        title={title}
        subtitle={subtitle}
        actions={actions}
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        actionsClassName='w-auto shrink-0'
      />
      <div
        className={cn(
          'space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)',
          bodyClassName
        )}
      >
        {children}
      </div>
    </ContentSurfaceCard>
  );
}

function CampaignCallout({
  tone,
  icon,
  children,
  className,
  ...props
}: Readonly<{
  tone: 'destructive' | 'info' | 'success' | 'warning';
  icon: 'AlertTriangle' | 'CheckCircle' | 'Info' | 'Loader2' | 'XCircle';
  children: ReactNode;
  className?: string;
}> &
  ComponentPropsWithoutRef<'div'>) {
  const toneClassNames: Record<typeof tone, string> = {
    destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
    info: 'border-info/20 bg-info/5 text-info',
    success: 'border-success/20 bg-success/10 text-success',
    warning: 'border-warning/20 bg-warning/10 text-warning',
  };
  const toneClassName = toneClassNames[tone];

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-[10px] border px-4 py-3',
        toneClassName,
        className
      )}
      {...props}
    >
      <Icon name={icon} className='mt-0.5 h-4 w-4 shrink-0' />
      <div className='min-w-0'>{children}</div>
    </div>
  );
}

function CampaignMetric({
  label,
  value,
  subtitle,
  valueClassName,
}: Readonly<{
  label: string;
  value: ReactNode;
  subtitle: string;
  valueClassName?: string;
}>) {
  return (
    <ContentMetricCard
      label={label}
      value={value}
      subtitle={subtitle}
      className='h-full bg-surface-0 shadow-none'
      labelClassName='tracking-[0.06em]'
      valueClassName={valueClassName}
    />
  );
}

function CampaignDataTable({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className='overflow-hidden rounded-xl border border-subtle bg-surface-0'>
      <table className='w-full text-sm'>{children}</table>
    </div>
  );
}

function CampaignTableHeaderCell({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <th className='px-4 py-2.5 text-left text-xs font-semibold tracking-normal text-secondary-token'>
      {children}
    </th>
  );
}

function CampaignTableCell({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return (
    <td className={cn('px-4 py-2.5 text-secondary-token', className)}>
      {children}
    </td>
  );
}

export function InviteCampaignManager() {
  const [sendResult, setSendResult] =
    useState<SendCampaignInvitesResponse | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Read persisted settings (configured via Settings > Admin > General)
  const { data: savedSettings } = useCampaignSettings();
  const fitScoreThreshold = savedSettings?.settings?.fitScoreThreshold ?? 50;
  const limit = savedSettings?.settings?.batchLimit ?? 20;
  const throttling: ThrottlingConfig =
    savedSettings?.settings?.throttlingConfig ?? DEFAULT_THROTTLING;

  // TanStack Query for preview data
  const {
    data: preview,
    isLoading: isLoadingPreview,
    error: previewError,
    refetch: refetchPreview,
  } = useCampaignPreviewQuery({
    threshold: fitScoreThreshold,
    limit,
  });

  // TanStack Query for campaign stats
  const { data: stats, isLoading: isLoadingStats } = useCampaignStatsQuery();

  const { data: inviteList, isLoading: isLoadingInvites } =
    useCampaignInvitesQuery({ limit: 10, offset: 0 });

  const { data: campaignOverview } = useCampaignOverviewQuery();

  // TanStack Query mutation for sending invites
  const sendInvitesMutation = useSendCampaignInvitesMutation();
  const { mutateAsync: sendInvites } = sendInvitesMutation;

  const handleRefreshClick = useCallback(() => {
    refetchPreview();
  }, [refetchPreview]);

  const handleConfirmSend = useCallback(async () => {
    setShowConfirmModal(false);
    if (!preview || preview.sample.withEmails === 0) return;

    setSendResult(null);

    try {
      const result = await sendInvites({
        fitScoreThreshold,
        limit,
        minDelayMs: throttling.minDelayMs,
        maxDelayMs: throttling.maxDelayMs,
        maxPerHour: throttling.maxPerHour,
        dryRun: false,
      });

      setSendResult(result);
    } catch {
      // Error is handled by the mutation
    }
  }, [preview, fitScoreThreshold, limit, throttling, sendInvites]);

  const handleSendClick = useCallback(() => {
    if (!preview || preview.sample.withEmails === 0) return;

    // Show confirmation for large batches
    if (preview.sample.withEmails >= LARGE_BATCH_THRESHOLD) {
      setShowConfirmModal(true);
    } else {
      handleConfirmSend();
    }
  }, [preview, handleConfirmSend]);

  const avgDelaySeconds = Math.round(
    (throttling.minDelayMs + throttling.maxDelayMs) / 2 / 1000
  );
  const effectiveRatePerHour = Math.round(3600 / avgDelaySeconds);

  const error =
    previewError?.message ?? (sendInvitesMutation.error?.message || null);

  const hasActiveJobs =
    (stats?.jobQueue?.pending ?? 0) > 0 ||
    (stats?.jobQueue?.processing ?? 0) > 0;

  return (
    <div className='space-y-4' data-testid='admin-campaigns-content'>
      <CampaignSection
        title='Campaign Results'
        subtitle='Live invite throughput and conversion outcomes'
        actions={
          isLoadingStats ? (
            <Icon
              name='Loader2'
              className='h-4 w-4 animate-spin text-tertiary-token'
              aria-hidden='true'
            />
          ) : null
        }
      >
        {stats && (
          <div className='grid gap-3 md:grid-cols-3 lg:grid-cols-6'>
            <CampaignMetric
              label='Total Invites'
              value={stats.campaign.total}
              subtitle='Queued across all runs'
            />
            <CampaignMetric
              label='Pending'
              value={stats.campaign.pending}
              subtitle='Awaiting processing'
              valueClassName='text-warning'
            />
            <CampaignMetric
              label='Sending'
              value={stats.campaign.sending}
              subtitle='In progress right now'
              valueClassName='text-info'
            />
            <CampaignMetric
              label='Sent'
              value={stats.campaign.sent}
              subtitle='Delivered successfully'
              valueClassName='text-success'
            />
            <CampaignMetric
              label='Failed'
              value={stats.campaign.failed}
              subtitle='Need follow-up'
              valueClassName='text-destructive'
            />
            <CampaignMetric
              label='Claimed'
              value={stats.campaign.claimed}
              subtitle='Profiles converted'
              valueClassName='text-accent'
            />
          </div>
        )}
      </CampaignSection>

      {stats?.jobQueue && hasActiveJobs && (
        <CampaignSection
          title='Job Queue Active'
          subtitle='Background work currently processing invite jobs'
          className='border-info/20 bg-info/5'
          actions={
            <Icon
              name='Loader2'
              className='h-4 w-4 animate-spin text-info'
              aria-hidden='true'
            />
          }
        >
          <div className='grid gap-3 md:grid-cols-4'>
            <CampaignMetric
              label='Jobs Pending'
              value={stats.jobQueue.pending}
              subtitle='Queued workers'
              valueClassName='text-info'
            />
            <CampaignMetric
              label='Processing'
              value={stats.jobQueue.processing}
              subtitle='Running now'
              valueClassName='text-info'
            />
            <CampaignMetric
              label='Succeeded'
              value={stats.jobQueue.succeeded}
              subtitle='Completed jobs'
              valueClassName='text-success'
            />
            <CampaignMetric
              label='Est. Remaining'
              value={`~${stats.jobQueue.estimatedMinutesRemaining} min`}
              subtitle='Until queue clears'
              valueClassName='text-info'
            />
          </div>

          {stats.jobQueue.nextRunAt && (
            <p className='text-xs text-info'>
              Next job scheduled:{' '}
              {new Date(stats.jobQueue.nextRunAt).toLocaleTimeString(
                undefined,
                {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }
              )}
            </p>
          )}
        </CampaignSection>
      )}

      <CampaignCallout tone='info' icon='Info'>
        <p className='text-xs'>
          Targeting: fit score {'>='} {fitScoreThreshold}, batch size {limit}.
          Throttling: {Math.round(throttling.minDelayMs / 1000)}–
          {Math.round(throttling.maxDelayMs / 1000)}s delay (~
          {effectiveRatePerHour}/hour).{' '}
          <a
            href={APP_ROUTES.SETTINGS_ADMIN}
            className='underline hover:text-primary-token'
          >
            Change in Settings
          </a>
        </p>
      </CampaignCallout>

      <CampaignSection
        title='Claim Funnel'
        subtitle='Invite-to-claim performance across recent sends'
      >
        <div className='grid gap-3 md:grid-cols-4'>
          <CampaignMetric
            label='Invites sent'
            value={campaignOverview?.invites.sent ?? 0}
            subtitle='Total delivered'
          />
          <CampaignMetric
            label='Unique click-throughs'
            value={campaignOverview?.engagement.uniqueClicks ?? 0}
            subtitle='Visitors who engaged'
            valueClassName='text-info'
          />
          <CampaignMetric
            label='Profiles claimed'
            value={campaignOverview?.conversion.profilesClaimed ?? 0}
            subtitle='Successful conversions'
            valueClassName='text-success'
          />
          <CampaignMetric
            label='Claim conversion rate'
            value={`${(campaignOverview?.conversion.claimRate ?? 0).toFixed(1)}%`}
            subtitle='Invite to claim'
            valueClassName='text-accent'
          />
        </div>
      </CampaignSection>

      <CampaignSection
        title='Recent Invite Activity'
        subtitle='Latest recipients, status, and downstream engagement'
        actions={
          isLoadingInvites ? (
            <Icon
              name='Loader2'
              className='h-4 w-4 animate-spin text-tertiary-token'
              aria-hidden='true'
            />
          ) : null
        }
      >
        {inviteList && inviteList.invites.length > 0 ? (
          <CampaignDataTable>
            <thead className='bg-surface-1'>
              <tr>
                <CampaignTableHeaderCell>Creator</CampaignTableHeaderCell>
                <CampaignTableHeaderCell>Status</CampaignTableHeaderCell>
                <CampaignTableHeaderCell>Engagement</CampaignTableHeaderCell>
                <CampaignTableHeaderCell>Claimed</CampaignTableHeaderCell>
              </tr>
            </thead>
            <tbody className='divide-y divide-(--linear-border-subtle)'>
              {inviteList.invites.map(invite => (
                <tr key={invite.id}>
                  <CampaignTableCell className='text-primary-token'>
                    @{invite.profile.username}
                  </CampaignTableCell>
                  <CampaignTableCell className='capitalize'>
                    {invite.status}
                  </CampaignTableCell>
                  <CampaignTableCell>
                    {formatEngagementStatus(invite.engagement)}
                  </CampaignTableCell>
                  <CampaignTableCell>
                    <span
                      className={
                        invite.profile.isClaimed
                          ? 'text-success'
                          : 'text-secondary-token'
                      }
                    >
                      {invite.profile.isClaimed ? 'Yes' : 'No'}
                    </span>
                  </CampaignTableCell>
                </tr>
              ))}
            </tbody>
          </CampaignDataTable>
        ) : (
          <p className='text-sm text-secondary-token'>
            No invite activity yet.
          </p>
        )}
      </CampaignSection>

      <CampaignSection
        title='Preview'
        subtitle='Preview the next invite batch before queuing it'
        actions={
          <Button
            variant='ghost'
            size='sm'
            onClick={handleRefreshClick}
            disabled={isLoadingPreview}
          >
            {isLoadingPreview ? (
              <Icon name='Loader2' className='h-3.5 w-3.5 animate-spin' />
            ) : (
              <Icon name='RefreshCw' className='h-3.5 w-3.5' />
            )}
            <span className='ml-2'>Refresh</span>
          </Button>
        }
      >
        {error && (
          <CampaignCallout tone='destructive' icon='XCircle'>
            <p className='text-sm'>{error}</p>
          </CampaignCallout>
        )}

        {preview && (
          <div className='space-y-4'>
            {/* Stats */}
            <div className='grid gap-3 md:grid-cols-3'>
              <CampaignMetric
                label='Total eligible'
                value={preview.totalEligible}
                subtitle={`Score >= ${preview.threshold}`}
              />
              <CampaignMetric
                label='With contact email'
                value={preview.sample.withEmails}
                subtitle='Ready to send'
                valueClassName='text-success'
              />
              <CampaignMetric
                label='Missing email'
                value={preview.sample.withoutEmails}
                subtitle='Needs enrichment first'
                valueClassName='text-warning'
              />
            </div>

            {/* Sample Profiles */}
            {preview.sample.profiles.length > 0 && (
              <div>
                <p className='mb-2 text-sm font-medium text-primary-token'>
                  Sample profiles to invite:
                </p>
                <CampaignDataTable>
                  <thead className='bg-surface-1'>
                    <tr>
                      <CampaignTableHeaderCell>
                        Username
                      </CampaignTableHeaderCell>
                      <CampaignTableHeaderCell>
                        Fit Score
                      </CampaignTableHeaderCell>
                      <CampaignTableHeaderCell>Email</CampaignTableHeaderCell>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-(--linear-border-subtle)'>
                    {preview.sample.profiles.map(profile => (
                      <tr key={profile.id}>
                        <CampaignTableCell className='text-primary-token'>
                          @{profile.username}
                        </CampaignTableCell>
                        <CampaignTableCell>
                          <span className='inline-flex items-center rounded-full border border-info/20 bg-info/10 px-2 py-0.5 text-xs font-medium text-info'>
                            {profile.fitScore ?? 'N/A'}
                          </span>
                        </CampaignTableCell>
                        <CampaignTableCell className='font-mono text-xs'>
                          {profile.email}
                        </CampaignTableCell>
                      </tr>
                    ))}
                  </tbody>
                </CampaignDataTable>
              </div>
            )}
          </div>
        )}
      </CampaignSection>

      <CampaignSection
        title='Send Invites'
        subtitle='Queue the next batch once your preview looks correct'
      >
        {sendResult?.ok && (
          <CampaignCallout
            tone='success'
            icon='CheckCircle'
            role='status'
            aria-live='polite'
          >
            <div>
              <p className='text-sm font-medium text-success'>
                Successfully queued {sendResult.jobsEnqueued} invites!
              </p>
              <p className='text-xs text-success'>
                Estimated completion: ~{sendResult.estimatedMinutes} minutes
              </p>
            </div>
          </CampaignCallout>
        )}

        <div className='flex items-center gap-4'>
          <Button
            variant='primary'
            onClick={handleSendClick}
            disabled={
              sendInvitesMutation.isPending ||
              !preview ||
              preview.sample.withEmails === 0 ||
              isLoadingPreview
            }
          >
            {sendInvitesMutation.isPending ? (
              <>
                <Icon
                  name='Loader2'
                  className='mr-2 h-3.5 w-3.5 animate-spin'
                />
                Sending...
              </>
            ) : (
              <>
                <Icon name='Send' className='mr-2 h-3.5 w-3.5' />
                Send {preview?.sample.withEmails ?? 0} Invites
              </>
            )}
          </Button>

          <p className='text-sm text-secondary-token'>
            Emails will be sent over ~
            {preview
              ? Math.ceil((preview.sample.withEmails * avgDelaySeconds) / 60)
              : 0}{' '}
            minutes
          </p>
        </div>
      </CampaignSection>

      {/* Confirmation Modal for Large Batches */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Large Batch Send</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send{' '}
              <span className='font-semibold'>
                {preview?.sample.withEmails ?? 0}
              </span>{' '}
              invite emails. This will take approximately{' '}
              <span className='font-semibold'>
                {preview
                  ? Math.ceil(
                      (preview.sample.withEmails * avgDelaySeconds) / 60
                    )
                  : 0}{' '}
                minutes
              </span>{' '}
              to complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <CampaignCallout tone='warning' icon='AlertTriangle' className='mt-4'>
            <p className='text-xs'>
              This action cannot be undone. Emails will be queued and sent
              gradually to avoid spam filters.
            </p>
          </CampaignCallout>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant='primary' onClick={handleConfirmSend}>
              Confirm Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
